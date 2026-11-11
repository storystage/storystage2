/**
 * Speak line's voices (WP14b, 14.3; spec 06, section 4; S1's part of this package): the engine,
 * Kokoro in a worker (`KokoroEngine`), and everything that works with any `SpeechEngine`.
 */
export { webAudioOut, type AudioContextLike } from './audio-out.ts';
export { rpDictionary, rpToKokoro, toBritish } from './british.ts';
export {
  BRITISH_WORDS,
  KOKORO_MAX_TOKENS,
  KOKORO_SAMPLE_RATE,
  KokoroCore,
  KokoroError,
  type KokoroSession,
  type KokoroText,
} from './kokoro-core.ts';
export { KokoroEngine, type KokoroEngineOptions, type KokoroWorker } from './kokoro-engine.ts';
export type { KokoroOptions, KokoroPlaces } from './kokoro-protocol.ts';
export {
  LineCache,
  LinePlayer,
  lineKey,
  lineSeconds,
  makeLine,
  type AudioOut,
  type Line,
  type LineFailure,
  type SpeechEngine,
} from './lines.ts';
export {
  BASE_VOICES,
  DEFAULT_ACCENT,
  PRESETS,
  VOICE_LIMITS,
  castVoices,
  isCastVoice,
  switchAccent,
  voiceFor,
  type Accent,
  type CastMember,
  type CastVoice,
  type Preset,
} from './presets.ts';
export { changeVoice, fitToTime, type VoiceShape } from './voice-change.ts';
