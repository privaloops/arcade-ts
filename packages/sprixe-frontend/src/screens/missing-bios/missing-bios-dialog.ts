/**
 * Modal shown when a game's runner factory throws MissingBiosError —
 * the per-system variant of "you need to upload X first". The browser
 * stays underneath and the caller restores its focus via onClose().
 *
 * Dismiss: gamepad A (NavAction "confirm"), Enter, or Escape. The
 * dialog registers its own one-shot keydown listener so this works
 * without routing through the InputRouter.
 */

import type { NavAction } from "../../input/gamepad-nav";

export interface MissingBiosDialogOptions {
  system: "neogeo";
  biosId: string;
  onClose: () => void;
}

const SYSTEM_LABEL: Record<MissingBiosDialogOptions["system"], string> = {
  neogeo: "Neo-Geo",
};

export class MissingBiosDialog {
  readonly root: HTMLDivElement;
  private readonly onClose: () => void;
  private readonly keyHandler: (e: KeyboardEvent) => void;

  constructor(container: HTMLElement, options: MissingBiosDialogOptions) {
    this.onClose = options.onClose;

    const label = SYSTEM_LABEL[options.system];
    this.root = document.createElement("div");
    this.root.className = "af-missing-bios-dialog";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("data-testid", "missing-bios-dialog");
    this.root.dataset.system = options.system;

    const card = document.createElement("div");
    card.className = "af-missing-bios-card";

    const title = document.createElement("h2");
    title.className = "af-missing-bios-title";
    title.textContent = `${label} BIOS required`;
    card.appendChild(title);

    const body = document.createElement("p");
    body.className = "af-missing-bios-body";
    body.textContent = `Upload "${options.biosId}.zip" from your phone to play ${label} games. The BIOS is a one-time upload kept on-device.`;
    card.appendChild(body);

    const btn = document.createElement("button");
    btn.className = "af-missing-bios-ok";
    btn.type = "button";
    btn.setAttribute("data-testid", "missing-bios-ok");
    btn.textContent = "Back to games";
    btn.addEventListener("click", () => this.close());
    card.appendChild(btn);

    this.root.appendChild(card);
    container.appendChild(this.root);
    btn.focus();

    this.keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") {
        e.preventDefault();
        this.close();
      }
    };
    window.addEventListener("keydown", this.keyHandler);
  }

  handleNavAction(action: NavAction): boolean {
    if (action === "confirm" || action === "back") {
      this.close();
      return true;
    }
    return false;
  }

  close(): void {
    window.removeEventListener("keydown", this.keyHandler);
    this.root.remove();
    this.onClose();
  }
}
