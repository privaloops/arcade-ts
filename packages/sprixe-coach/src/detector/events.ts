import type { AIMacroState, CharacterId } from '../types';

export type EventType =
  | 'hp_hit'
  | 'combo_connect'
  | 'knockdown'
  | 'near_death'
  | 'low_hp_warning'
  | 'round_start'
  | 'round_end'
  | 'special_startup'
  | 'corner_trap'
  | 'macro_state_change'
  | 'pattern_prediction';

export interface BaseEvent {
  type: EventType;
  frameIdx: number;
  timestampMs: number;
  /** 0 (trivial) to 1 (critical). Used to prioritize what the coach says. */
  importance: number;
}

export interface HpHitEvent extends BaseEvent {
  type: 'hp_hit';
  attacker: 'p1' | 'p2';
  damage: number;
  victimHpAfter: number;
  victimHpPercent: number;
}

export interface ComboEvent extends BaseEvent {
  type: 'combo_connect';
  attacker: 'p1' | 'p2';
  hits: number;
}

export interface KnockdownEvent extends BaseEvent {
  type: 'knockdown';
  victim: 'p1' | 'p2';
}

export interface NearDeathEvent extends BaseEvent {
  type: 'near_death';
  victim: 'p1' | 'p2';
  hpPercent: number;
}

export interface LowHpWarningEvent extends BaseEvent {
  type: 'low_hp_warning';
  victim: 'p1' | 'p2';
  hpPercent: number;
}

export interface RoundStartEvent extends BaseEvent {
  type: 'round_start';
  roundNumber: number;
}

export interface RoundEndEvent extends BaseEvent {
  type: 'round_end';
  winner: 'p1' | 'p2' | 'draw';
}

export interface SpecialStartupEvent extends BaseEvent {
  type: 'special_startup';
  player: 'p1' | 'p2';
  character: CharacterId;
  attackId: number;
}

export interface CornerTrapEvent extends BaseEvent {
  type: 'corner_trap';
  victim: 'p1' | 'p2';
  side: 'left' | 'right';
}

export interface MacroStateChangeEvent extends BaseEvent {
  type: 'macro_state_change';
  player: 'p1' | 'p2';
  from: AIMacroState;
  to: AIMacroState;
  triggers: string[];
}

export interface PatternPredictionEvent extends BaseEvent {
  type: 'pattern_prediction';
  player: 'p1' | 'p2';
  predictedAction: string;
  preNoticeMs: number;
  confidence: number;
  reason: string;
}

export type CoachEvent =
  | HpHitEvent
  | ComboEvent
  | KnockdownEvent
  | NearDeathEvent
  | LowHpWarningEvent
  | RoundStartEvent
  | RoundEndEvent
  | SpecialStartupEvent
  | CornerTrapEvent
  | MacroStateChangeEvent
  | PatternPredictionEvent;

/**
 * SF2 arcade screen bounds in world coordinates (empirical).
 * P1 x ~ 80 = left wall, ~900 = right wall in the scrolled world.
 * Used for corner-trap detection.
 */
export const SCREEN_BOUNDS = { xMin: 80, xMax: 900, cornerMargin: 40 } as const;

export const IMPORTANCE = {
  trivial: 0.2,
  minor: 0.4,
  moderate: 0.6,
  important: 0.75,
  critical: 0.9,
  urgent: 1.0,
} as const;
