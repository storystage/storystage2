/** The parts of HeadTTS's English language module that speak line uses. */
export class Language {
  constructor(settings?: { trace?: boolean });
  /** Word (upper case) → Kokoro phonemes, one character each. `null` until set. */
  dictionary: Record<string, string[]> | null;
  /** Adds one `WORD\tphonemes` line. */
  addToDictionary(line: string): void;
  generate(text: string): { phonemes: string[] };
}
