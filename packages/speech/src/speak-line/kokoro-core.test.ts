import { describe, expect, it } from 'vitest';
import { KOKORO_MAX_TOKENS, KokoroCore, type KokoroSession } from './kokoro-core.ts';

/** Every phoneme Kokoro's British and American voices use, numbered from 1 ($ is 0, the pad). */
const SYMBOLS = [...'$;:,.!?—…"() AIOQWYabdefhijklmnopqrstuvwxyzæðŋɑɒɔəɛɜɡɪɹɾʃʊʌʒʤʧˈˌθᵊᵻː'];
const tokenizer = JSON.stringify({
  model: { vocab: Object.fromEntries(SYMBOLS.map((s, i) => [s, i])) },
});

const dictionary = ['THANK\tθˈæŋk', 'YOU\tjˈu', 'FOX\tfˈɑks', 'KEY\tkˈi', 'RIVER\tɹˈɪvɜɹ'].join(
  '\n',
);

function core(rp = 'DEPART  D IH0 - P AA1 T', bad?: number) {
  const runs: { ids: number[]; style: number[]; speed: number }[] = [];
  const session: KokoroSession = {
    async run(ids, style, speed) {
      runs.push({ ids: [...ids].map(Number), style: [...style.slice(0, 2)], speed });
      const out = new Float32Array(ids.length * 100);
      if (bad !== undefined) out[7] = bad;
      return out;
    },
  };
  // A voice file whose style vector for n tokens starts with n.
  const voice = async () => Float32Array.from({ length: 512 * 256 }, (_, i) => Math.floor(i / 256));
  return { core: new KokoroCore({ tokenizer, dictionary, rp }, session, voice), runs };
}

describe('KokoroCore.phonemes', () => {
  it('is American for American voices', () => {
    expect(core().core.phonemes('Thank you, fox.', 'american')).toBe('θˈæŋk jˈu, fˈɑks.');
  });

  it('is British for British voices: the rules, the RP list and the hand list', () => {
    const { core: k } = core();
    expect(k.phonemes('Thank you, fox.', 'british')).toBe('θˈaŋk jˈuː, fˈɒks.');
    expect(k.phonemes('river', 'british')).toBe('ɹˈɪvə');
    expect(k.phonemes('depart', 'british')).toBe('dɪpˈɑːt'); // from the RP list
    expect(k.phonemes('castle', 'british')).toBe('kˈɑːsəl'); // the hand list wins
    expect(k.phonemes('path', 'british')).toBe('pˈɑːθ'); // from the hand list
  });
});

describe('KokoroCore.tokens', () => {
  it('numbers each phoneme Kokoro knows, skipping any it doesn’t', () => {
    const { core: k } = core();
    expect(k.tokens('kˈi')).toEqual([
      SYMBOLS.indexOf('k'),
      SYMBOLS.indexOf('ˈ'),
      SYMBOLS.indexOf('i'),
    ]);
    expect(k.tokens('k☃i')).toHaveLength(2);
  });
});

describe('KokoroCore.parts', () => {
  const sentence = 'Key key key key key key key key key key.'; // about 50 tokens
  const long = Array.from({ length: 14 }, () => sentence).join(' ');

  it('keeps a line that fits in one part', () => {
    expect(core().core.parts(sentence, 'british')).toEqual([sentence]);
  });

  it('splits a long line at its sentences, joining them back as far as each part fits', () => {
    const { core: k } = core();
    const parts = k.parts(long, 'british');
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.join(' ')).toBe(long); // nothing cut
    for (const p of parts)
      expect(k.tokens(k.phonemes(p, 'british')).length).toBeLessThanOrEqual(KOKORO_MAX_TOKENS);
  });

  it('splits a long sentence at its commas, then its words', () => {
    const { core: k } = core();
    const words = Array.from({ length: 150 }, () => 'key').join(' ');
    const parts = k.parts(words, 'british');
    expect(parts.join(' ')).toBe(words);
    expect(parts.length).toBeGreaterThan(1);
  });
});

describe('KokoroCore.speak', () => {
  it('pads the tokens, picks the style for their number, and gives the model’s samples', async () => {
    const { core: k, runs } = core();
    const samples = await k.speak('Key.', { base: 'bf_emma', accent: 'british' });
    const ids = k.tokens(k.phonemes('Key.', 'british'));
    expect(runs[0]!.ids).toEqual([0, ...ids, 0]);
    expect(runs[0]!.style).toEqual([ids.length, ids.length]);
    expect(runs[0]!.speed).toBe(1);
    expect(samples.length).toBe((ids.length + 2) * 100);
  });

  it('speaks a long line part by part, and joins the sound', async () => {
    const { core: k, runs } = core();
    const long = Array.from({ length: 14 }, () => 'Key key key key key key key key key key.').join(
      ' ',
    );
    const samples = await k.speak(long, { base: 'bf_emma', accent: 'british' });
    expect(runs.length).toBe(k.parts(long, 'british').length);
    expect(samples.length).toBe(runs.reduce((n, r) => n + r.ids.length * 100, 0));
  });

  it.each([NaN, Infinity])('refuses sound with %s in it, rather than hand it on', async (bad) => {
    const { core: k } = core(undefined, bad);
    await expect(k.speak('Key.', { base: 'bf_isabella', accent: 'british' })).rejects.toThrow(
      'Kokoro made no usable sound for this line.',
    );
  });
});
