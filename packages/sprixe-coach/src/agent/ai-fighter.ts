import type { GameState } from '../types';
import { ModeManager, TurtleSpaceControl, MODE_REGISTRY, type Mode } from './modes';
import { PolicyRunner, DEFAULT_RYU_POLICY, type Policy } from './policy';
import type { VirtualInputChannel } from './input-sequencer';

export interface AiFighterOptions {
  /** Mode name to start the match in (legacy mode-based engine). */
  initialMode?: string;
  /** Switch to the policy engine (DSL rules) instead of the mode engine. */
  enginePolicy?: boolean;
}

/**
 * Controls P2 programmatically. Two execution engines live side by side:
 *
 *   - Mode engine (ModeManager) — hand-written modes picked by Claude.
 *     Stable, limited expressivity.
 *   - Policy engine (PolicyRunner) — DSL rules, Claude can compose a full
 *     policy from primitives at runtime. Richer but experimental.
 *
 * Pick via the `enginePolicy` option. Default stays on modes until the
 * policy engine is battle-tested.
 */
export class AiFighter {
  private readonly modeManager: ModeManager | null;
  private readonly policyRunner: PolicyRunner | null;

  constructor(channel: VirtualInputChannel, opts: AiFighterOptions = {}) {
    if (opts.enginePolicy) {
      this.modeManager = null;
      this.policyRunner = new PolicyRunner(channel, DEFAULT_RYU_POLICY);
    } else {
      const initial = opts.initialMode && MODE_REGISTRY[opts.initialMode]
        ? MODE_REGISTRY[opts.initialMode]!
        : TurtleSpaceControl;
      this.modeManager = new ModeManager(channel, initial);
      this.policyRunner = null;
    }
  }

  onVblank(state: GameState): void {
    this.modeManager?.onVblank(state);
    this.policyRunner?.onVblank(state);
  }

  /** Mode engine: switch active mode. */
  setMode(modeName: string): boolean {
    const mode = MODE_REGISTRY[modeName];
    if (!mode || !this.modeManager) return false;
    this.modeManager.setMode(mode);
    return true;
  }

  /** Policy engine: install a new policy (usually from Claude). */
  setPolicy(policy: Policy): boolean {
    if (!this.policyRunner) return false;
    this.policyRunner.setPolicy(policy);
    return true;
  }

  getCurrentMode(): Mode | null {
    return this.modeManager?.getCurrentMode() ?? null;
  }

  getCurrentPolicy(): Policy | null {
    return this.policyRunner?.getPolicy() ?? null;
  }

  /** True if running the DSL policy engine. */
  usesPolicyEngine(): boolean { return this.policyRunner !== null; }

  reset(): void {
    this.modeManager?.reset();
    this.policyRunner?.reset();
  }
}
