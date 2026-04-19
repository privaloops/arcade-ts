import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { identifyRom } from "./identify";
import { InvalidRomError, UnsupportedSystemError } from "./errors";

const FIXTURE_PATH = resolve(__dirname, "../../tests/fixtures/test.zip");

async function bufferFromFixture(): Promise<ArrayBuffer> {
  const buf = await readFile(FIXTURE_PATH);
  // Clone into a brand-new ArrayBuffer so JSZip sees a standalone
  // buffer — Node's Buffer.buffer is a shared pool that can spook
  // JSZip's magic-byte sniffer on large shared regions.
  const copy = new Uint8Array(buf.byteLength);
  copy.set(buf);
  return copy.buffer;
}

/**
 * Build a Neo-Geo shaped ZIP in-memory — files follow the MAME
 * `NNN-p1.p1 / NNN-c1.c1` pattern that isNeoGeoRom() recognises.
 * Sizes are tiny zero-filled buffers; we only care about file names.
 */
async function mockNeoGeoZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const pad = (size: number) => new Uint8Array(size);
  zip.file("201-p1.p1", pad(1024));
  zip.file("201-c1.c1", pad(1024));
  zip.file("201-c2.c2", pad(1024));
  zip.file("201-s1.s1", pad(1024));
  zip.file("201-m1.m1", pad(1024));
  zip.file("201-v1.v1", pad(1024));
  const blob = await zip.generateAsync({ type: "uint8array" });
  return blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer;
}

async function mockUnknownZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("readme.txt", "Not a ROM");
  zip.file("notes.md", "# not a rom set");
  const blob = await zip.generateAsync({ type: "uint8array" });
  return blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer;
}

async function emptyZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const blob = await zip.generateAsync({ type: "uint8array" });
  return blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer;
}

/**
 * Build a Neo-Geo BIOS shaped ZIP — recognised by the sp-s2.sp1 / sp-s.sp1
 * system ROM. We don't ship the real BIOS (DMCA), so the test only asserts
 * identification, not execution.
 */
async function mockNeoGeoBiosZip(): Promise<ArrayBuffer> {
  const zip = new JSZip();
  const pad = (size: number) => new Uint8Array(size);
  zip.file("sp-s2.sp1", pad(128 * 1024));
  zip.file("sfix.sfix", pad(128 * 1024));
  zip.file("000-lo.lo", pad(65536));
  zip.file("sm1.sm1", pad(128 * 1024));
  const blob = await zip.generateAsync({ type: "uint8array" });
  return blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer;
}

describe("identifyRom", () => {
  it("identifies the test.zip fixture as CPS-1", async () => {
    const data = await bufferFromFixture();
    const result = await identifyRom(data);
    expect(result.system).toBe("cps1");
    expect(result.setName).not.toBeNull();
    expect(result.fileNames.length).toBeGreaterThan(0);
  });

  it("identifies a Neo-Geo-shaped ZIP as neogeo game", async () => {
    const data = await mockNeoGeoZip();
    const result = await identifyRom(data);
    expect(result.system).toBe("neogeo");
    expect(result.kind).toBe("game");
  });

  it("identifies a Neo-Geo BIOS ZIP as kind=bios with setName=neogeo", async () => {
    const data = await mockNeoGeoBiosZip();
    const result = await identifyRom(data);
    expect(result.system).toBe("neogeo");
    expect(result.kind).toBe("bios");
    expect(result.setName).toBe("neogeo");
  });

  it("identifies the test.zip fixture as a CPS-1 game (kind=game)", async () => {
    const data = await bufferFromFixture();
    const result = await identifyRom(data);
    expect(result.kind).toBe("game");
  });

  it("throws InvalidRomError on bad ZIP magic", async () => {
    const garbage = new TextEncoder().encode("Not a ZIP file at all — raw text.").buffer;
    await expect(identifyRom(garbage)).rejects.toBeInstanceOf(InvalidRomError);
  });

  it("throws InvalidRomError on empty ZIP archive", async () => {
    const data = await emptyZip();
    await expect(identifyRom(data)).rejects.toBeInstanceOf(InvalidRomError);
  });

  it("throws UnsupportedSystemError when no known ROM set matches", async () => {
    const data = await mockUnknownZip();
    await expect(identifyRom(data)).rejects.toBeInstanceOf(UnsupportedSystemError);
  });

  it("UnsupportedSystemError surfaces the file names for debug", async () => {
    const data = await mockUnknownZip();
    try {
      await identifyRom(data);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedSystemError);
      const err = e as UnsupportedSystemError;
      expect(err.fileNames).toContain("readme.txt");
    }
  });
});
