/**
 * RomPipeline — glue between the WebRTC receive handler (PeerHost)
 * and the frontend's persistent ROM store (RomDB).
 *
 * Called once per received file. Identifies the ROM's system + set
 * name via the engine bridge, then upserts a RomRecord into IndexedDB
 * with the freshly-received binary. Typed errors propagate so Phase
 * 3.11 can forward them back to the phone (protocol 'error' message).
 */

import { identifyRom, type Identification } from "../engine-bridge/identify";
import { InvalidRomError, UnsupportedSystemError } from "../engine-bridge/errors";
import { RomDB, type RomRecord } from "../storage/rom-db";

export interface ReceivedPayload {
  name: string;
  data: ArrayBuffer;
}

export interface ProcessResult {
  record: RomRecord;
  identification: Identification;
}

export interface RomPipelineOptions {
  db: RomDB;
  /** Override the identifier for tests. */
  identify?: (data: ArrayBuffer) => Promise<Identification>;
}

export class RomPipeline {
  private readonly db: RomDB;
  private readonly identify: (data: ArrayBuffer) => Promise<Identification>;

  constructor(options: RomPipelineOptions) {
    this.db = options.db;
    this.identify = options.identify ?? identifyRom;
  }

  /**
   * Identify + persist. Throws InvalidRomError / UnsupportedSystemError
   * unchanged so callers can build a protocol 'error' reply; any other
   * error (DB quota, write failure) bubbles with its original name.
   */
  async process(payload: ReceivedPayload): Promise<ProcessResult> {
    const identification = await this.identify(payload.data);

    const id = identification.setName ?? inferIdFromFilename(payload.name);

    const record: RomRecord = {
      id,
      system: identification.system,
      kind: identification.kind,
      zipData: payload.data,
      addedAt: Date.now(),
      lastPlayedAt: 0,
      playCount: 0,
      favorite: false,
      size: payload.data.byteLength,
    };

    await this.db.put(record);
    return { record, identification };
  }
}

function inferIdFromFilename(name: string): string {
  // Strip directory + extension; MAME ROM set names are lowercase
  // alphanumerics so we normalise to match the catalogue.
  const base = name.split(/[\\/]/).pop() ?? name;
  const stem = base.replace(/\.zip$/i, "");
  return stem.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Public re-export so PeerHost consumers can catch typed errors. */
export { InvalidRomError, UnsupportedSystemError };
