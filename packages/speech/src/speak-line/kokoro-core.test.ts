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

function core(rp = 'DEPART  D IH0 - P AA1 T') {
  const runs: { ids: number[]; style: number[]; speed: number }[] = [];
  const session: KokoroSession = {
    async run(ids, style, speed) {
      runs.push({ ids: [...ids].map(Number), style: [...style.slice(0, 2)], speed });
      return new Float32Array(ids.length * 100);
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
  it('numbers each phoneme Kokoro knows, skipping any it doesn’t, at most 510', () => {
    const { core: k } = core();
    expect(k.tokens('kˈi')).toEqual([
      SYMBOLS.indexOf('k'),
      SYMBOLS.indexOf('ˈ'),
      SYMBOLS.indexOf('i'),
    ]);
    expect(k.tokens('k☃i')).toHaveLength(2);
    expect(k.tokens('a'.repeat(600))).toHaveLength(KOKORO_MAX_TOKENS);
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
});
