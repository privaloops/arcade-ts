export type {
  GameState,
  CharacterState,
  CPUState,
  CharacterId,
  RoundPhase,
  AttackPhase,
  AIMacroState,
} from './types';

export { StateExtractor } from './extractor/state-extractor';
export { StateHistory } from './extractor/state-history';
export { SF2HF_MEMORY_MAP } from './extractor/sf2hf-memory-map';
export { CoachController } from './coach-controller';
export type { CoachHost, CoachOptions } from './coach-controller';
export { EventDetector } from './detector/event-detector';
export { classifyCpuMacroState } from './detector/macro-state';
export { predictOpponentActions, hasSpecificPredictor } from './detector/opponent-patterns';
export type { OpponentPrediction } from './detector/opponent-patterns';
export type {
  CoachEvent,
  EventType,
  BaseEvent,
  HpHitEvent,
  ComboEvent,
  KnockdownEvent,
  NearDeathEvent,
  LowHpWarningEvent,
  RoundStartEvent,
  RoundEndEvent,
  SpecialStartupEvent,
  CornerTrapEvent,
  MacroStateChangeEvent,
  PatternPredictionEvent,
} from './detector/events';
