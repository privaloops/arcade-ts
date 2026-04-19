/**
 * MappingScreen — first-boot controller setup (§2.3).
 *
 * Walks the player through binding each role in MAPPING_ROLES
 * sequentially. Each prompt awaits a single InputBinding from
 * InputCapture; duplicates against previously-bound roles are refused
 * with a warning and the prompt remains active.
 *
 * When every role is bound, the mapping is persisted via saveMapping()
 * and onComplete(mapping) fires. Screens that mount this component
 * (Phase 2.4 boot flow) use onComplete to transition to the browser.
 */

import {
  MAPPING_ROLES,
  MAPPING_ROLE_LABELS,
  type MappingRole,
  type InputBinding,
  type InputMapping,
  saveMapping,
  findDuplicate,
} from "../../input/mapping-store";
import { InputCapture } from "../../input/input-capture";

const ROLE_LABELS: Record<MappingRole, string> = MAPPING_ROLE_LABELS;

function formatBinding(binding: InputBinding): string {
  switch (binding.kind) {
    case "button":
      return `Button ${binding.index}`;
    case "axis":
      return `Axis ${binding.index}${binding.dir < 0 ? "-" : "+"}`;
    case "key":
      return `Key ${binding.code}`;
  }
}

export interface MappingScreenOptions {
  onComplete: (mapping: InputMapping) => void;
  /** Override the role sequence. Defaults to MAPPING_ROLES. */
  roles?: readonly MappingRole[];
  /** Override the capture for unit tests. Defaults to new InputCapture(). */
  capture?: InputCapture;
  /** Disable persistence (used by Vitest so it doesn't touch localStorage). */
  persist?: boolean;
}

export class MappingScreen {
  readonly root: HTMLDivElement;

  private readonly onComplete: (mapping: InputMapping) => void;
  private readonly roles: readonly MappingRole[];
  private readonly capture: InputCapture;
  private readonly persist: boolean;

  private readonly mapping: Partial<Record<MappingRole, InputBinding>> = {};
  private inputType: "gamepad" | "keyboard" | null = null;
  private currentIndex = 0;
  private readonly promptEls = new Map<MappingRole, HTMLElement>();
  private warningEl: HTMLElement;

  constructor(container: HTMLElement, options: MappingScreenOptions) {
    this.onComplete = options.onComplete;
    this.roles = options.roles ?? MAPPING_ROLES;
    this.capture = options.capture ?? new InputCapture();
    this.persist = options.persist ?? true;

    this.root = document.createElement("div");
    this.root.className = "af-mapping-screen";
    this.root.setAttribute("data-testid", "mapping-screen");

    const title = document.createElement("h1");
    title.className = "af-mapping-title";
    title.textContent = "CONTROLLER SETUP — Player 1";
    this.root.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.className = "af-mapping-subtitle";
    subtitle.textContent = "Press the button for each action:";
    this.root.appendChild(subtitle);

    const list = document.createElement("ul");
    list.className = "af-mapping-list";
    for (const role of this.roles) {
      const li = document.createElement("li");
      li.className = "af-mapping-prompt";
      li.dataset.role = role;
      li.setAttribute("data-state", "pending");
      li.textContent = `${ROLE_LABELS[role]} — [pending]`;
      list.appendChild(li);
      this.promptEls.set(role, li);
    }
    this.root.appendChild(list);

    this.warningEl = document.createElement("div");
    this.warningEl.className = "af-mapping-warning";
    this.warningEl.setAttribute("data-testid", "mapping-warning");
    this.warningEl.style.visibility = "hidden";
    this.warningEl.textContent = "";
    this.root.appendChild(this.warningEl);

    container.appendChild(this.root);
    this.advance();
  }

  unmount(): void {
    this.capture.stop();
    this.root.remove();
  }

  /** Testing helper — returns the currently-pending role or null if done. */
  getCurrentRole(): MappingRole | null {
    return this.currentIndex < this.roles.length ? this.roles[this.currentIndex]! : null;
  }

  getMapping(): Readonly<Partial<Record<MappingRole, InputBinding>>> {
    return this.mapping;
  }

  private advance(): void {
    const role = this.getCurrentRole();
    if (role === null) {
      this.finish();
      return;
    }
    this.refresh(role, "active");
    this.capture.start((binding) => {
      const dup = findDuplicate(this.mapping, binding);
      if (dup) {
        this.showWarning(
          `That input is already mapped to ${ROLE_LABELS[dup]}. Press a different button.`
        );
        this.advance(); // re-arm for the same prompt
        return;
      }
      this.clearWarning();
      this.mapping[role] = binding;
      if (this.inputType === null) {
        this.inputType = binding.kind === "key" ? "keyboard" : "gamepad";
      }
      this.refresh(role, "done", formatBinding(binding));
      this.currentIndex += 1;
      this.advance();
    });
  }

  private finish(): void {
    const mapping: InputMapping = {
      version: 1,
      type: this.inputType ?? "gamepad",
      p1: this.mapping,
    };
    if (this.persist) saveMapping(mapping);
    this.onComplete(mapping);
  }

  private refresh(role: MappingRole, state: "pending" | "active" | "done", detail?: string): void {
    const el = this.promptEls.get(role);
    if (!el) return;
    el.setAttribute("data-state", state);
    if (state === "active") {
      el.textContent = `${ROLE_LABELS[role]} — [awaiting input]`;
    } else if (state === "done") {
      el.textContent = `${ROLE_LABELS[role]} — ✓ ${detail ?? ""}`.trim();
    }
  }

  private showWarning(message: string): void {
    this.warningEl.textContent = message;
    this.warningEl.style.visibility = "visible";
  }

  private clearWarning(): void {
    this.warningEl.style.visibility = "hidden";
    this.warningEl.textContent = "";
  }
}
