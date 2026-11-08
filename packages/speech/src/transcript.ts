/**
 * Cleaning what whisper hears (`docs/spec/06-speech.md` section 1.7): its timestamps, its
 * bracketed notes (`[BLANK_AUDIO]`, `(music)`) and the repeated lines it sometimes loops on are
 * removed, and space is tidied. Its capitals and punctuation are kept.
 */

const TIMESTAMP = /\[\d{2}:\d{2}(:\d{2})?(\.\d+)?\s*-->\s*\d{2}:\d{2}(:\d{2})?(\.\d+)?\]/g;
const NOTE = /\[[^\]]{0,40}\]|\([^)]{0,40}\)|\*[^*]{0,40}\*|♪+/g;

export function cleanTranscript(raw: string): string {
  const text = raw.replace(TIMESTAMP, ' ').replace(NOTE, ' ').replace(/\s+/g, ' ').trim();
  // Whisper can repeat one sentence many times on silence or noise: keep each run once.
  const sentences = text.match(/[^.!?]+[.!?]*/g) ?? [];
  const kept: string[] = [];
  for (const sentence of sentences.map((s) => s.trim()).filter(Boolean)) {
    const previous = kept.at(-1);
    if (previous === undefined || previous.toLowerCase() !== sentence.toLowerCase())
      kept.push(sentence);
  }
  return kept
    .join(' ')
    .replace(/ ([,.!?;:])/g, '$1')
    .trim();
}
