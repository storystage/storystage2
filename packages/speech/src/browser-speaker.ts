/**
 * A `Speaker` over the browser's speech synthesis (`docs/spec/06-speech.md` section 2). The
 * browser objects are passed in, so this is tested without one:
 *
 *   browserSpeaker(speechSynthesis, voice, (text) => new SpeechSynthesisUtterance(text))
 */
import type { Speaker } from './narration.ts';
import type { VoiceInfo } from './voices.ts';

/** The parts of `SpeechSynthesisUtterance` this sets. */
export interface UtteranceLike {
  text: string;
  voice: unknown;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

/** The parts of `speechSynthesis` this uses. */
export interface SynthLike {
  speak(utterance: never): void;
  cancel(): void;
}

export function browserSpeaker(
  synth: SynthLike,
  voice: VoiceInfo,
  makeUtterance: (text: string) => UtteranceLike,
): Speaker {
  let live: UtteranceLike | null = null;
  return {
    speak(text, onEnd) {
      const utterance = makeUtterance(text);
      utterance.voice = voice;
      utterance.lang = voice.lang;
      live = utterance;
      // An error ends the utterance too, so one bad one never stalls the queue.
      const finish = () => {
        if (live !== utterance) return;
        live = null;
        onEnd();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      synth.speak(utterance as never);
    },
    cancel() {
      live = null;
      synth.cancel();
    },
  };
}
