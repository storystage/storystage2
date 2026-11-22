/**
 * Spike 14.3: British pronunciations for Kokoro's British voices (owner, 10 Nov 2026). The CMU
 * dictionary is American, so its pronunciations are turned British by rules, and Reece Dunn's
 * RP list (BSD-2-Clause, about 2,100 words) goes on top. Nothing here comes from eSpeak NG.
 *
 * Both work in Kokoro's phonemes (misaki's EN_PHONES.md): British voices use `a` for TRAP,
 * `Q` for GOAT (/əʊ/), `ɒ` for LOT and `ː` for length, and have no `æ`, `O`, `ɾ` or `ᵻ`.
 */

const VOWELS = 'ɑɔɜəɪɛʊiuIWYAQOaɒʌæ';
const isVowel = (c: string | undefined) => c !== undefined && VOWELS.includes(c);

/** Where a post-vocalic r goes in British English, by the vowel before it. */
const R_DROPPED: Record<string, string> = {
  ɑ: 'ɑː', // car
  ɔ: 'ɔː', // more
  ɜ: 'ɜː', // nurse (stressed; unstressed is handled first)
  ə: 'ə', // letter
  ɪ: 'ɪə', // near (from rules)
  i: 'ɪə', // here: the CMU dictionary's /iɹ/
  ɛ: 'ɛː', // square (misaki's British /eə/)
  ʊ: 'ʊə', // cure
  u: 'ʊə', // tour
  I: 'Iə', // fire
  W: 'Wə', // our
  A: 'ɛː', // rare: American /eɪɹ/
  æ: 'ɑː', // rare
  ʌ: 'ʌ', // hurry has a vowel after, so this is rare
};

/** American Kokoro phonemes to British ones. Idempotent on British input. */
export function toBritish(us: string): string {
  let s = us
    .replace(/æ/g, 'a') // TRAP
    .replace(/O/g, 'Q') // GOAT
    .replace(/ɾ/g, 't') // flap t: better
    .replace(/ᵻ/g, 'ɪ');

  // An unstressed /ɜɹ/ (over, river) is a plain schwa.
  s = s.replace(/(^|[^ˈˌ])ɜɹ(?![ɑɔɜəɪɛʊiuIWYAQaɒʌ])/g, '$1ə');

  // Non-rhotic: an r after a vowel goes unless a vowel follows (very, carry keep theirs).
  let out = '';
  for (let k = 0; k < s.length; k++) {
    const c = s[k]!;
    if (c === 'ɹ' && isVowel(s[k - 1]) && !isVowel(s[k + 1])) {
      const v = s[k - 1]!;
      out = out.slice(0, -1) + (R_DROPPED[v] ?? v);
      continue;
    }
    out += c;
  }
  s = out;

  // LOT: American /ɑ/ not lengthened is British /ɒ/ (fox, hot); PALM words come from the lists.
  s = s.replace(/ɑ(?!ː)/g, 'ɒ');
  // THOUGHT and CLOTH: American /ɔ/ is /ɒ/ before ɡ ŋ f θ s ʃ (dog, long, off, cloth, lost,
  // wash), and /ɔː/ otherwise (walk, law).
  s = s.replace(/ɔ(?!ː)(?=([ɡŋfθsʃ]))/g, 'ɒ').replace(/ɔ(?![ːɒ])/g, 'ɔː');
  // Stressed FLEECE and GOOSE are long in RP: easy, food (unstressed happy-i stays short).
  s = s.replace(/([ˈˌ])([iu])(?!ː)/g, '$1$2ː');
  return s;
}

/** Reece Dunn's RP ARPAbet to Kokoro's British phonemes. */
const RP: Record<string, string> = {
  AA: 'ɑː',
  AE: 'a',
  AH: 'ʌ',
  AO: 'ɔː',
  AW: 'W',
  AX: 'ə',
  AY: 'I',
  EH: 'ɛ',
  ER: 'ɜː',
  EY: 'A',
  IH: 'ɪ',
  IY: 'iː',
  OW: 'Q',
  OY: 'Y',
  UH: 'ʊ',
  UW: 'uː',
  OH: 'ɒ',
  IA: 'ɪə',
  EA: 'ɛː',
  UA: 'ʊə',
  EL: 'ᵊl',
  I: 'i',
  B: 'b',
  CH: 'ʧ',
  D: 'd',
  DH: 'ð',
  F: 'f',
  G: 'ɡ',
  HH: 'h',
  JH: 'ʤ',
  K: 'k',
  L: 'l',
  M: 'm',
  N: 'n',
  NG: 'ŋ',
  P: 'p',
  R: 'ɹ',
  S: 's',
  SH: 'ʃ',
  T: 't',
  TH: 'θ',
  V: 'v',
  W: 'w',
  Y: 'j',
  Z: 'z',
  ZH: 'ʒ',
};

/** One RP entry's phones, `D IH0 - P AA1 T`, as Kokoro phonemes `dɪpˈɑːt`; null if unknown. */
export function rpToKokoro(phones: string): string | null {
  let out = '';
  for (const p of phones.split(/\s+/)) {
    if (p === '-' || p === '') continue;
    const m = /^([A-Z]+)([012])?$/.exec(p);
    const base = m && RP[m[1]!];
    if (!m || base === undefined) return null;
    out += (m[2] === '1' ? 'ˈ' : m[2] === '2' ? 'ˌ' : '') + base;
  }
  return out;
}

/**
 * Small words the RP list gives in their stressed, citation form (of /ɒv/, to /tuː/, the
 * /ðiː/). In a sentence they're weak (/əv/, /tə/, /ðə/), which the CMU dictionary and the rules
 * already give, so the RP list is used for content words only.
 */
const FUNCTION_WORDS = new Set(
  (
    'A AN AND ARE AS AT BE BEEN BUT BY CAN COULD DO DOES FOR FROM HAD HAS HAVE HE HER HIM HIS I ' +
    'IN IS IT ITS ME MY OF ON OR OUR SHALL SHE SHOULD SO SOME THAN THAT THE THEM THEN THERE ' +
    'THEY TO UP US WAS WE WERE WHAT WILL WITH WOULD YOU YOUR'
  ).split(' '),
);

/**
 * The RP list as dictionary lines for the phonemiser (`WORD\tphonemes`): content words only,
 * the first entry for each word, notes dropped; entries it can't read are left out.
 */
export function rpDictionary(text: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw || raw.startsWith(';;;')) continue;
    const line = raw.replace(/#@@.*$/, '').trim();
    const m = /^([A-Z'.-]+)(\([a-z-]+\))?\s+(.+)$/.exec(line);
    if (!m || seen.has(m[1]!) || FUNCTION_WORDS.has(m[1]!)) continue;
    const ps = rpToKokoro(m[3]!);
    if (!ps) continue;
    seen.add(m[1]!);
    lines.push(`${m[1]}\t${ps}`);
  }
  return lines;
}
