/**
 * Which voice speaks (`docs/spec/06-speech.md` section 2.1). Only voices that run on the device,
 * so no text leaves it to be spoken (decision 0021); English, en-GB first.
 */

/** The parts of the browser's `SpeechSynthesisVoice` this needs. */
export interface VoiceInfo {
  readonly name: string;
  readonly lang: string;
  readonly voiceURI: string;
  readonly localService: boolean;
  readonly default: boolean;
}

/** Browsers write `en-GB`, `en_GB` or `en-gb`. */
const tag = (lang: string) => lang.replace('_', '-').toLowerCase();

const rank = (v: VoiceInfo) => (tag(v.lang) === 'en-gb' ? 0 : 1) * 2 + (v.default ? 0 : 1);

/** The voices a learner may choose from, in the order to offer them. */
export function onDeviceVoices(voices: readonly VoiceInfo[]): VoiceInfo[] {
  return voices
    .filter((v) => v.localService && /^en(-|$)/.test(tag(v.lang)))
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'en'));
}

/**
 * The voice to use: the learner's choice if it is still on the device and allowed, else the
 * first one offered. None is a normal state; captions still show.
 */
export function chooseVoice(voices: readonly VoiceInfo[], preferredURI?: string): VoiceInfo | null {
  const offered = onDeviceVoices(voices);
  return offered.find((v) => v.voiceURI === preferredURI) ?? offered[0] ?? null;
}
