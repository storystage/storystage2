/**
 * How long a speak line takes (spec 06, section 4.2): from its words, not its voice, so Rehearse
 * and export take exactly the same time on every device. The `speakLine` procedure uses it when
 * the block has no `duration` detail, and the speech package imports it to fit each line's sound
 * to the same time (decided by S1 and S6, 10 Nov 2026).
 */

/** Seconds before the first word, and for each word: 150 words a minute, a calm pace. */
export const LINE_START_SECONDS = 0.4;
export const LINE_SECONDS_PER_WORD = 0.4;
/** The shortest a line takes, so even "Oh!" can be read as a caption. */
export const LINE_MIN_SECONDS = 1.5;

/** The words in a line: what's between spaces, with anything that has a letter or digit. */
export function lineWords(text: string): number {
  return text.split(/\s+/u).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/**
 * A line's duration in seconds: 0.4 s plus 0.4 s a word, at least 1.5 s, rounded up to the next
 * 0.1 s. Worked in tenths, so it is exact: "Here is the key." is 2 s.
 */
export function lineDuration(text: string): number {
  const tenths = Math.ceil(
    Math.max(
      LINE_MIN_SECONDS * 10,
      LINE_START_SECONDS * 10 + LINE_SECONDS_PER_WORD * 10 * lineWords(text),
    ) - 1e-9,
  );
  return tenths / 10;
}
