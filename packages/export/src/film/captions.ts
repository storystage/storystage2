/**
 * WP11.4: captions from the film's lines (spec 08, section 6). The measuring run gives every
 * `say` and speak line with its scene, object, words, start and length; these turn them into
 * captions for the picture and for the WebVTT and SRT files saved beside the film.
 */
import type { SceneId, ScriptLine } from '@storystage/production';
import { micros, type Micros } from '@storystage/story-api';

/** A line in the film, as the measuring run gives it. Times are on the film's clock. */
export interface SpokenLine {
  readonly scene: SceneId;
  /** The object saying it: its id in the scene, such as `owl`. */
  readonly object: string;
  /** A speak line's words are its script line's words. */
  readonly text: string;
  /**
   * A `think` is a thought, not speech, so it isn't captioned. A speak line comes as the stage's
   * `caption` (spec 06, section 4.7).
   */
  readonly kind: 'say' | 'think' | 'caption';
  /** The script line a speak line speaks (its `LineId`), if it came from one. */
  readonly line?: string;
  readonly start: Micros;
  readonly duration: Micros;
  /** The block's own time, before any cut at the scene's end; `duration` when not given. */
  readonly length?: Micros;
}

export interface Caption {
  readonly start: Micros;
  readonly end: Micros;
  /** "OWL: Here is the key." */
  readonly text: string;
}

/** A caption shows for at least this long. */
export const CAPTION_MIN = micros(1);

/** At most this many show on the picture at once. */
export const CAPTIONS_AT_ONCE = 2;

/** One line of words: runs of spaces and line breaks become one space. */
const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

const END_MARKS = new Set(['.', '!', '?', '…', ',', ';', ':']);

/**
 * Words as a script and a block might each write them: case, spaces and end marks aside. The
 * marks come off in a loop from the end, not with a regular expression, so a learner's long run
 * of "!!!" takes no longer than its length (CodeQL, polynomial regular expression).
 */
function sameWords(text: string): string {
  const words = oneLine(text).toLowerCase();
  let end = words.length;
  while (end > 0 && END_MARKS.has(words[end - 1]!)) end--;
  return words.slice(0, end);
}

export interface CaptionOptions {
  /** Added to every time: the title card's length, as times count from the film's start. */
  readonly offset?: Micros;
}

/**
 * The captions, in time order. Who says it is the script's character when a dialogue line in
 * that scene has the same words, or else the object's name; either way in capitals.
 */
export function captionsFor(
  lines: readonly SpokenLine[],
  script: readonly ScriptLine[],
  options: CaptionOptions = {},
): Caption[] {
  const offset = options.offset ?? 0;
  const characters = new Map<string, string>();
  const byId = new Map(script.map((s) => [s.id as string, s]));
  for (const s of script) {
    const key = `${s.scene}\n${sameWords(s.text)}`;
    if (s.kind === 'dialogue' && s.character && !characters.has(key))
      characters.set(key, oneLine(s.character));
  }
  return lines
    .map((line, order) => ({ line, order }))
    .filter(({ line }) => line.kind !== 'think' && oneLine(line.text) !== '')
    .sort((a, b) => a.line.start - b.line.start || a.order - b.order)
    .map(({ line }) => {
      // A speak line's own script line names its speaker first.
      const spoken = line.line === undefined ? undefined : byId.get(line.line);
      const who =
        (spoken?.kind === 'dialogue' && spoken.character ? oneLine(spoken.character) : null) ??
        characters.get(`${line.scene}\n${sameWords(line.text)}`) ??
        oneLine(line.object);
      const start = line.start + offset;
      return {
        start,
        end: start + Math.max(line.duration, CAPTION_MIN),
        text: `${who.toUpperCase()}: ${oneLine(line.text)}`,
      };
    });
}

/**
 * What shows on the picture at `t`: a caption from its start up to its end. When more than two
 * overlap, the two that started last, stacked earliest first.
 */
export function captionsAt(captions: readonly Caption[], t: Micros): Caption[] {
  return captions.filter((c) => c.start <= t && t < c.end).slice(-CAPTIONS_AT_ONCE);
}

/** So a learner's `<`, `>` and `&` stay text. */
const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** `00:01:02.500` in WebVTT, `00:01:02,500` in SRT. */
function clock(t: Micros, mark: '.' | ','): string {
  const ms = Math.round(t / 1000);
  const two = (n: number) => String(n).padStart(2, '0');
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return `${two(h)}:${two(m)}:${two(s)}${mark}${String(ms % 1000).padStart(3, '0')}`;
}

const cues = (captions: readonly Caption[], mark: '.' | ',') =>
  captions.map(
    (c, i) =>
      `${i + 1}\n${clock(c.start, mark)} --> ${clock(c.end, mark)}\n${escape(oneLine(c.text))}\n`,
  );

/** The captions as a WebVTT file (`.vtt`). */
export function webVtt(captions: readonly Caption[]): string {
  return ['WEBVTT\n', ...cues(captions, '.')].join('\n');
}

/** The same captions as an SRT file (`.srt`). */
export function srt(captions: readonly Caption[]): string {
  return cues(captions, ',').join('\n');
}
