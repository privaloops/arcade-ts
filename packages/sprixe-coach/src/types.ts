export type CharacterId =
  | 'ryu'
  | 'ken'
  | 'chun-li'
  | 'guile'
  | 'blanka'
  | 'zangief'
  | 'e-honda'
  | 'dhalsim'
  | 'balrog'
  | 'vega'
  | 'sagat'
  | 'bison'
  | 'unknown';

export type RoundPhase = 'intro' | 'fight' | 'ko' | 'outro';

export type AttackPhase = 'startup' | 'active' | 'recovery' | null;

export type AIMacroState =
  | 'idle'
  | 'zoning'
  | 'rush'
  | 'defensive'
  | 'corner_pressure'
  | 'charge_building'
  | 'desperation'
  | 'teleport_setup'
  | 'unknown';

export interface CharacterState {
  hp: number;
  maxHp: number;
  x: number;
  y: number;
  charId: CharacterId;
  animState: number;
  stunCounter: number;
  comboCount: number;
  isBlocking: boolean;
  isJumping: boolean;
  isCrouching: boolean;
  isAirborne: boolean;
  /** Animation frame pointer (32-bit BE). The canonical "current move"
   *  signature — changes every time the character transitions to a
   *  new animation. Calibration maps ptr value → move name. */
  animPtr: number;
  /** FSM state byte. 0=neutral, 0x02=walk, 0x04=jump, 0x0A=normal
   *  attack, 0x0C=special attack, 0x0E=hurt. */
  stateByte: number;
  /** True while the attacking flag (+0x18B) is 0x01. */
  attacking: boolean;
}

export interface CPUState extends CharacterState {
  aiState: AIMacroState;
  chargeCounter: number;
  retreatCounter: number;
  lastSpecialFrame: number;
}

export interface GameState {
  frameIdx: number;
  timestampMs: number;
  p1: CharacterState;
  p2: CPUState;
  timer: number;
  roundNumber: number;
  roundPhase: RoundPhase;
}
