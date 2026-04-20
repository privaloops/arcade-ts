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
  currentAttackId: number | null;
  attackPhase: AttackPhase;
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
