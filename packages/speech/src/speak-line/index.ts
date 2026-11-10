/**
 * Speak line's voices (WP14b, 14.3; spec 06, section 4; S1's part of this package). The engine,
 * Kokoro in a worker, comes in the next pull request; everything here works with any
 * `SpeechEngine`.
 */
export { webAudioOut, type AudioContextLike } from './audio-out.ts';
export { rpDictionary, rpToKokoro, toBritish } from './british.ts';
export {
  LineCache,
  LinePlayer,
  lineKey,
  lineSeconds,
  makeLine,
  type AudioOut,
  type Line,
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
