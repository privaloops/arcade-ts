import { describe, it, expect } from "vitest";
import { classifyTransferError, TransferTimeoutError } from "./error-handling";
import { InvalidRomError, UnsupportedSystemError } from "../engine-bridge/errors";
import { TransferError } from "./peer-send";

describe("classifyTransferError", () => {
  it("InvalidRomError → 'Not a valid ZIP archive'", () => {
    const c = classifyTransferError(new InvalidRomError("bad magic"));
    expect(c.level).toBe("error");
    expect(c.message).toBe("Not a valid ZIP archive");
  });

  it("UnsupportedSystemError → 'Unknown ROM format'", () => {
    const c = classifyTransferError(new UnsupportedSystemError("unknown", ["a.txt"]));
    expect(c.level).toBe("error");
    expect(c.message).toBe("Unknown ROM format");
  });

  it("TransferTimeoutError → 'Transfer stalled — try again'", () => {
    const c = classifyTransferError(new TransferTimeoutError(10_000));
    expect(c.level).toBe("error");
    expect(c.message).toBe("Transfer stalled — try again");
  });

  it("QuotaExceededError DOMException → 'Storage full'", () => {
    // jsdom DOMException supports the name argument.
    const dom = new DOMException("quota", "QuotaExceededError");
    const c = classifyTransferError(dom);
    expect(c.level).toBe("error");
    expect(c.message).toContain("Storage full");
  });

  it("plain { name: 'QuotaExceededError' } duck-types as quota full", () => {
    const c = classifyTransferError({ name: "QuotaExceededError" });
    expect(c.message).toContain("Storage full");
  });

  it("TransferError surfaces the underlying message", () => {
    const c = classifyTransferError(new TransferError("ICE failed", "connect"));
    expect(c.level).toBe("error");
    expect(c.message).toBe("Transfer failed: ICE failed");
  });

  it("generic Error wraps the message", () => {
    const c = classifyTransferError(new Error("weird"));
    expect(c.level).toBe("error");
    expect(c.message).toBe("Transfer failed: weird");
  });

  it("non-Error values produce a generic message", () => {
    expect(classifyTransferError("string").message).toBe("Transfer failed");
    expect(classifyTransferError(undefined).message).toBe("Transfer failed");
    expect(classifyTransferError(null).message).toBe("Transfer failed");
    expect(classifyTransferError(42).message).toBe("Transfer failed");
  });

  it("cause is always preserved unchanged", () => {
    const original = new Error("keep me");
    expect(classifyTransferError(original).cause).toBe(original);
  });
});
