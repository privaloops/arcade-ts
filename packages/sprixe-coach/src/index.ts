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
export type { CoachHost, CoachOptions, TtsProvider } from './coach-controller';
export { TtsPlayer } from './tts/tts-player';
export type { TtsPlayerOptions } from './tts/tts-player';
export { LocalTtsPlayer } from './tts/local-tts-player';
export type { LocalTtsOptions } from './tts/local-tts-player';
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
