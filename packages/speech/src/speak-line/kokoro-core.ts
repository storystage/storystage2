/**
 * Kokoro-82M, the speak line engine (decision 0068, spike 14.3): text → Kokoro's phonemes →
 * token ids → 24 kHz audio. The phonemiser is HeadTTS's (vendored, MIT) over the CMU dictionary
 * (BSD), never eSpeak NG; British voices get our British rules and the RP list (`british.ts`).
 *
 * Runs in a worker (`kokoro-worker.ts`). The model runner is behind `KokoroSession`, so this is
 * tested without ONNX Runtime.
 */
import { Language } from './vendor/headtts/language-en-us.mjs';
import { rpDictionary, toBritish } from './british.ts';
import type { Accent } from './presets.ts';

export const KOKORO_SAMPLE_RATE = 24_000;
/** Kokoro reads at most 510 phoneme tokens, between two pads. */
export const KOKORO_MAX_TOKENS = 510;
/** Each voice file holds one 256-number style vector for every possible token count. */
const STYLE_SIZE = 256;

/** What the model needs: token ids, the voice's style for that many tokens, and the speed. */
export interface KokoroSession {
  run(inputIds: BigInt64Array, style: Float32Array, speed: number): Promise<Float32Array>;
}

/** The text files Kokoro needs, as fetched (`scripts/fetch-kokoro-assets.mjs`). */
export interface KokoroText {
  /** `tokenizer.json`: Kokoro's phoneme vocabulary. */
  readonly tokenizer: string;
  /** HeadTTS's `en-us.txt`: the CMU dictionary in Kokoro's phonemes. */
  readonly dictionary: string;
  /** Reece Dunn's `en-GB-x-rp.dict`. */
  readonly rp: string;
  /** British pronunciations the rules can't make (`BRITISH_WORDS`). */
  readonly british?: readonly string[];
}

/**
 * British pronunciations nothing in American spelling or pronunciation predicts: BATH and PALM
 * words, and a few others (spike 14.3). Kokoro's British phonemes; the list grows as words are found.
 */
export const BRITISH_WORDS: readonly string[] = [
  'ASK\tˈɑːsk',
  'AFTER\tˈɑːftə',
  'BATH\tbˈɑːθ',
  "CAN'T\tkˈɑːnt",
  'CLASS\tklˈɑːs',
  'DANCE\tdˈɑːns',
  'FAST\tfˈɑːst',
  'GLASS\tɡlˈɑːs',
  'GRASS\tɡɹˈɑːs',
  'HALF\thˈɑːf',
  'LAST\tlˈɑːst',
  'LAUGH\tlˈɑːf',
  'PASS\tpˈɑːs',
  'PATH\tpˈɑːθ',
  'PLANT\tplˈɑːnt',
  'FATHER\tfˈɑːðə',
  'CALM\tkˈɑːm',
  'ONE\twˈʌn',
  'TOMATO\ttəmˈɑːtQ',
  'GARAGE\tɡˈaɹɑːʒ',
  'SCHEDULE\tʃˈɛdjuːl',
  'AFTERNOON\tˌɑːftənˈuːn',
  'CASTLE\tkˈɑːsəl',
];

function phonemiser(lines: Iterable<string>): Language {
  const language = new Language({ trace: false });
  language.dictionary = {};
  for (const line of lines) language.addToDictionary(line);
  return language;
}

export class KokoroCore {
  readonly #vocab: Record<string, number>;
  readonly #american: Language;
  readonly #british: Language;
  readonly #session: KokoroSession;
  readonly #voice: (name: string) => Promise<Float32Array>;

  constructor(
    text: KokoroText,
    session: KokoroSession,
    voice: (name: string) => Promise<Float32Array>,
  ) {
    this.#vocab = (
      JSON.parse(text.tokenizer) as { model: { vocab: Record<string, number> } }
    ).model.vocab;
    const dictionary = text.dictionary.split('\n');
    this.#american = phonemiser(dictionary);
    // British: the same dictionary, then the RP list's content words, then the hand list; the
    // rules turn the result British (british.ts).
    this.#british = phonemiser([
      ...dictionary,
      ...rpDictionary(text.rp),
      ...(text.british ?? BRITISH_WORDS),
    ]);
    this.#session = session;
    this.#voice = voice;
  }

  /** Kokoro's phonemes for `text` in an accent. */
  phonemes(text: string, accent: Accent): string {
    return accent === 'british'
      ? toBritish(this.#british.generate(text).phonemes.join(''))
      : this.#american.generate(text).phonemes.join('');
  }

  /** The token ids: one per phoneme Kokoro knows, at most 510. */
  tokens(phonemes: string): number[] {
    return [...phonemes]
      .map((c) => this.#vocab[c])
      .filter((id): id is number => id !== undefined)
      .slice(0, KOKORO_MAX_TOKENS);
  }

  /** Speaks `text` in one of Kokoro's voices, giving 24 kHz samples. */
  async speak(
    text: string,
    voice: { readonly base: string; readonly accent: Accent },
  ): Promise<Float32Array> {
    const ids = this.tokens(this.phonemes(text, voice.accent));
    const styles = await this.#voice(voice.base);
    // The style vector depends on the number of tokens (Kokoro's model card).
    const at = Math.min(ids.length, styles.length / STYLE_SIZE - 1);
    const style = styles.slice(at * STYLE_SIZE, (at + 1) * STYLE_SIZE);
    const padded = BigInt64Array.from([0, ...ids, 0].map(BigInt));
    return this.#session.run(padded, style, 1);
  }
}
