import { describe, expect, it } from 'vitest';
import { browserSpeaker, type SynthLike, type UtteranceLike } from './browser-speaker.ts';
import type { VoiceInfo } from './voices.ts';

const daniel: VoiceInfo = {
  name: 'Daniel',
  lang: 'en-GB',
  voiceURI: 'uri:Daniel',
  localService: true,
  default: false,
};

function fakeSynth() {
  const spoken: UtteranceLike[] = [];
  let cancelled = 0;
  const synth: SynthLike = {
    speak: (u) => spoken.push(u),
    cancel: () => {
      cancelled += 1;
    },
  };
  return { synth, spoken, cancelled: () => cancelled };
}

const makeUtterance = (text: string): UtteranceLike => ({
  text,
  voice: null,
  lang: '',
  onend: null,
  onerror: null,
});

describe('browserSpeaker', () => {
  it('speaks with the chosen voice and its language, and reports the end', () => {
    const { synth, spoken } = fakeSynth();
    let ended = 0;
    browserSpeaker(synth, daniel, makeUtterance).speak('Hello.', () => (ended += 1));
    expect(spoken).toHaveLength(1);
    expect(spoken[0]).toMatchObject({ text: 'Hello.', voice: daniel, lang: 'en-GB' });
    spoken[0]?.onend?.();
    expect(ended).toBe(1);
  });

  it('carries on after an error, so one bad utterance never stalls the queue', () => {
    const { synth, spoken } = fakeSynth();
    let ended = 0;
    browserSpeaker(synth, daniel, makeUtterance).speak('Hello.', () => (ended += 1));
    spoken[0]?.onerror?.();
    expect(ended).toBe(1);
  });

  it('reports the end only once, however the browser signals it', () => {
    const { synth, spoken } = fakeSynth();
    let ended = 0;
    browserSpeaker(synth, daniel, makeUtterance).speak('Hello.', () => (ended += 1));
    spoken[0]?.onend?.();
    spoken[0]?.onerror?.();
    expect(ended).toBe(1);
  });

  it('cancels, and a cancelled utterance reports no end', () => {
    const { synth, spoken, cancelled } = fakeSynth();
    let ended = 0;
    const speaker = browserSpeaker(synth, daniel, makeUtterance);
    speaker.speak('Hello.', () => (ended += 1));
    speaker.cancel();
    spoken[0]?.onend?.();
    expect(cancelled()).toBe(1);
    expect(ended).toBe(0);
  });
});
