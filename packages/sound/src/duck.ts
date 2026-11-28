/**
 * Music lowered under speech (decision 0076; the owner's numbers, 27 Nov 2026; spec 08 section
 * 4): while a speak line is voiced, the whole music track plays at `DUCK_LEVEL` of itself. It
 * goes down over `DUCK_DOWN_SECONDS`, ending as the line starts, so the first word is clear, and
 * back up over `DUCK_UP_SECONDS` after it. Lines less than `DUCK_JOIN_SECONDS` apart count as one
 * stretch, so the music doesn't bob up and down between them. A plain `say` bubble is silent, so
 * it isn't speech here.
 *
 * Rehearse's player and the export both multiply the music by these points, on top of each cue's
 * own `gain` and the music track's volume (`mixOf`), so Rehearse sounds as the film does. Pure.
 */

/** How loud the music is under speech: 0.4 of itself, about 8 dB down. */
export const DUCK_LEVEL = 0.4;
/** How long the music takes to go down, ending as the line starts. */
export const DUCK_DOWN_SECONDS = 0.3;
/** How long it takes to come back up after the speech. */
export const DUCK_UP_SECONDS = 0.6;
/** Lines closer than this are one stretch of speech. */
export const DUCK_JOIN_SECONDS = 1;

/** A voiced speak line, in seconds on the film's clock: from its start to where its sound stops. */
export interface SpeechSpan {
  readonly start: number;
  readonly end: number;
}

const round = (seconds: number) => Math.round(seconds * 1000) / 1000;

/**
 * The music's level under the film's speech, as `[time, level]` points to ramp between in
 * straight lines, holding the first before it and the last after it. None means full throughout.
 */
export function duckOf(spans: readonly SpeechSpan[]): (readonly [number, number])[] {
  const sorted = spans.filter((s) => s.end > s.start).sort((a, b) => a.start - b.start);
  const joined: { start: number; end: number }[] = [];
  for (const s of sorted) {
    const last = joined.at(-1);
    if (last && s.start - last.end < DUCK_JOIN_SECONDS) last.end = Math.max(last.end, s.end);
    else joined.push({ start: s.start, end: s.end });
  }
  const points: (readonly [number, number])[] = [];
  for (const { start, end } of joined) {
    const down = start - DUCK_DOWN_SECONDS;
    if (down >= 0) points.push([round(down), 1]);
    else {
      // No room before the film's start: begin part way down, where the ramp would be at 0.
      const left = start / DUCK_DOWN_SECONDS;
      points.push([0, round(DUCK_LEVEL + (1 - DUCK_LEVEL) * left)]);
    }
    points.push([round(start), DUCK_LEVEL], [round(end), DUCK_LEVEL]);
    points.push([round(end + DUCK_UP_SECONDS), 1]);
  }
  return points;
}

type Points = readonly (readonly [number, number])[];

/** From point `i`, which `t` has reached: its level, or the straight line on to the next. */
function along(points: Points, i: number, t: number): number {
  const [t0, v0] = points[i]!;
  const next = points[i + 1];
  if (!next) return v0;
  return v0 + ((next[1] - v0) * (t - t0)) / (next[0] - t0);
}

/**
 * The level at `t` from `[time, level]` points: a straight line between neighbours, the first
 * point's level before it and the last's after it, full (1) with no points, and the later point's
 * level at a time two share. For `duckOf`'s points and a `MusicPlay`'s `gain` alike. The same as
 * S3's in Rehearse's player (agreed, 28 Nov 2026), so the two read levels alike.
 */
export function levelAt(points: Points, t: number): number {
  if (points.length === 0) return 1;
  if (t < points[0]![0]) return points[0]![1];
  let i = 0;
  while (i + 1 < points.length && points[i + 1]![0] <= t) i++;
  return along(points, i, t);
}

/**
 * `levelAt` for times that only go forwards, as a mix's samples do: it keeps its place in the
 * points, so a long film with many points costs one pass, not a search for every sample.
 */
export function levelsFrom(points: Points): (t: number) => number {
  if (points.length === 0) return () => 1;
  let i = 0;
  return (t) => {
    if (t < points[0]![0]) return points[0]![1];
    while (i + 1 < points.length && points[i + 1]![0] <= t) i++;
    return along(points, i, t);
  };
}
