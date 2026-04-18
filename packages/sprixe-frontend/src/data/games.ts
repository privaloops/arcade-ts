/**
 * GameEntry — normalized game definition used by the arcade frontend.
 *
 * Phase 2 will populate a concrete data source (IndexedDB via RomDB) but
 * every screen in Phase 1 consumes this shape so the plumbing doesn't
 * have to change once real ROMs arrive.
 */

export type System = "cps1" | "neogeo";

export interface GameEntry {
  /** MAME ROM set name — stable id across the app. */
  id: string;
  title: string;
  year: string;
  publisher: string;
  system: System;
  /** Relative or absolute URL. In Phase 1 these point at bundled placeholder svgs. */
  screenshotUrl: string | null;
  /** Optional MP4 loop URL. In Phase 1 left null; Phase 4 wires the CDN. */
  videoUrl: string | null;
  favorite: boolean;
}
