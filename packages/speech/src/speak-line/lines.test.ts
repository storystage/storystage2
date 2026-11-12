import { describe, expect, it } from 'vitest';
import {
  LineCache,
  LinePlayer,
  lineKey,
  lineSeconds,
  type AudioOut,
  type Line,
  type SpeechEngine,
} from './lines.ts';
import { voiceFor } from './presets.ts';

const RATE = 24_000;

/** A fake engine: a second of a 200 Hz tone for every word, and a log of what it was asked. */
function fakeEngine() {
  const asked: string[] = [];
  const waiting: (() => void)[] = [];
  let hold = false;
  const engine: SpeechEngine = {
    sampleRate: RATE,
    async speak(text, voice) {
      asked.push(`${voice.base}: ${text}`);
      if (hold) await new Promise<void>((r) => waiting.push(r));
      const n = text.split(' ').length * RATE * 0.3;
      return Float32Array.from(
        { length: n },
        (_, i) => 0.5 * Math.sin((2 * Math.PI * 200 * i) / RATE),
      );
    },
  };
  return {
    engine,
    asked,
    holdNext: () => (hold = true),
    release: () => {
      hold = false;
      waiting.splice(0).forEach((r) => r());
    },
  };
}

const emma = voiceFor('woman', 'british', 0);
const line = (text: string, voice = emma): Line => ({ text, voice, seconds: lineSeconds(text) });

describe('lineSeconds', () => {
  it('times a line from its words, unless the block gives a duration', () => {
    expect(lineSeconds('Here is the key.')).toBe(2);
    expect(lineSeconds('Here is the key.', 5)).toBe(5);
  });
});

describe('LineCache', () => {
  it('makes each line once, and shares a sound between identical lines', async () => {
    const f = fakeEngine();
    const cache = new LineCache(f.engine);
    await cache.prepare([line('Here is the key.'), line('Here is the key.'), line('Thank you.')]);
    await cache.prepare([line('Here is the key.'), line('Thank you.')]);
    expect(f.asked).toEqual(['bf_emma: Here is the key.', 'bf_emma: Thank you.']);
    expect(cache.size).toBe(2);
    expect(cache.get(line('Thank you.'))!.length).toBeGreaterThan(0);
  });

  it('fits each sound to its line’s time', async () => {
    const cache = new LineCache(fakeEngine().engine);
    const short = { ...line('one two three four five six seven eight'), seconds: 1.5 };
    await cache.prepare([short]);
    expect(cache.get(short)!.length).toBe(1.5 * RATE);
  });

  it('lets go of lines no longer in the code, and makes a new voice’s line again', async () => {
    const f = fakeEngine();
    const cache = new LineCache(f.engine);
    await cache.prepare([line('Hello.')]);
    const george = voiceFor('man', 'british', 0);
    await cache.prepare([line('Hello.', george)]);
    expect(cache.size).toBe(1);
    expect(cache.get(line('Hello.'))).toBeUndefined();
    expect(f.asked).toEqual(['bf_emma: Hello.', 'bm_george: Hello.']);
  });

  it('stops making lines the newer code deleted', async () => {
    const f = fakeEngine();
    const cache = new LineCache(f.engine);
    f.holdNext();
    const first = cache.prepare([line('Gone soon.'), line('Also gone.')]);
    await Promise.resolve();
    const second = cache.prepare([line('Kept.')]);
    f.release();
    await Promise.all([first, second]);
    expect(f.asked).toEqual(['bf_emma: Gone soon.', 'bf_emma: Kept.']);
    expect(cache.get(line('Gone soon.'))).toBeUndefined();
    expect(cache.get(line('Kept.'))).toBeDefined();
  });

  it('carries on past a line it can’t make, and says which', async () => {
    const f = fakeEngine();
    const failing: SpeechEngine = {
      sampleRate: RATE,
      speak: (text, voice) =>
        text === 'Broken.' ? Promise.reject(new Error('no sound')) : f.engine.speak(text, voice),
    };
    const cache = new LineCache(failing);
    const failures = await cache.prepare([line('Before.'), line('Broken.'), line('After.')]);
    expect(failures).toEqual([{ line: line('Broken.'), message: 'no sound' }]);
    expect(cache.get(line('Before.'))).toBeDefined();
    expect(cache.get(line('After.'))).toBeDefined();
    expect(cache.get(line('Broken.'))).toBeUndefined();
  });

  it('forgets everything on clear, as after an accent change', async () => {
    const cache = new LineCache(fakeEngine().engine);
    await cache.prepare([line('Hello.')]);
    cache.clear();
    expect(cache.size).toBe(0);
  });

  it('keys a line by its words, voice and time', () => {
    expect(lineKey(line('Hi.'))).toBe(lineKey(line('Hi.')));
    expect(lineKey(line('Hi.'))).not.toBe(lineKey({ ...line('Hi.'), seconds: 3 }));
  });
});

describe('LinePlayer', () => {
  function fakeOut() {
    const log: string[] = [];
    const out: AudioOut = {
      play: (s, rate, delay = 0) =>
        log.push(`play ${s.length / rate}s${delay ? ` in ${delay}s` : ''}`),
      stop: () => log.push('stop'),
    };
    return { out, log };
  }

  it('plays a ready line, cutting the one before, and stops on cue', async () => {
    const cache = new LineCache(fakeEngine().engine);
    await cache.prepare([line('Here is the key.'), line('Thank you.')]);
    const { out, log } = fakeOut();
    const player = new LinePlayer(cache, out);
    expect(player.start(line('Here is the key.'))).toBe(true);
    expect(player.start(line('Thank you.'))).toBe(true);
    player.stop();
    expect(log).toEqual(['stop', 'play 1.2s', 'stop', 'play 0.6s', 'stop']);
  });

  it('passes a delay on, for a line known ahead of its picture', async () => {
    const cache = new LineCache(fakeEngine().engine);
    await cache.prepare([line('Thank you.')]);
    const { out, log } = fakeOut();
    expect(new LinePlayer(cache, out).start(line('Thank you.'), 0.1)).toBe(true);
    expect(log).toEqual(['stop', 'play 0.6s in 0.1s']);
  });

  it('is silent for a line not ready yet: the caption shows without it', () => {
    const { out, log } = fakeOut();
    const player = new LinePlayer(new LineCache(fakeEngine().engine), out);
    expect(player.start(line('Not made yet.'))).toBe(false);
    expect(log).toEqual(['stop']);
  });
});
