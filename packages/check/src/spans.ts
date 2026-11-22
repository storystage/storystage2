/**
 * Each frame's span in the film (spec 08 section 9.3): when it starts and ends within its
 * scene's run, from the frames' links to blocks (10.8) and the blocks' measured starts, or from
 * the frames' planned lengths where nothing linked has run.
 */
import type { MeasuredBlock, MeasuredScene } from '@storystage/playback';
import type { Frame, FrameId } from '@storystage/production';
import { micros, type Micros } from '@storystage/story-api';

export interface FrameSpan {
  /** On the film's clock. */
  readonly start: Micros;
  readonly end: Micros;
}

/**
 * The spans of one scene's frames, in storyboard order:
 * - a frame starts when the first of its linked blocks first runs in the scene's run, unless
 *   that's before the frame before it starts;
 * - otherwise where the frame before was planned to end (its start plus its planned length), or
 *   with the scene for the first;
 * - a frame ends where the next one starts, or with the scene for the last; when the next one
 *   doesn't start later, at its own start plus its planned length;
 * - every span is inside the scene.
 */
export function frameSpans(
  scene: MeasuredScene,
  frames: readonly Frame[],
  blocks: readonly MeasuredBlock[],
): Map<FrameId, FrameSpan> {
  const sceneEnd = scene.start + scene.length;
  const inScene = blocks.filter(
    (b) => b.scene === scene.scene && b.at >= scene.start && b.at <= sceneEnd,
  );
  const firstRun = (frame: Frame): Micros | null => {
    let first: Micros | null = null;
    for (const b of inScene)
      if (frame.links.includes(b.node) && (first === null || b.at < first)) first = b.at;
    return first;
  };
  const within = (t: Micros) => Math.min(sceneEnd, Math.max(scene.start, t));
  const ordered = [...frames].sort((a, b) => a.order - b.order);

  const starts: Micros[] = [];
  ordered.forEach((frame, i) => {
    const before = i > 0 ? starts[i - 1]! : null;
    const linked = firstRun(frame);
    const planned = before === null ? scene.start : before + micros(ordered[i - 1]!.lengthSeconds);
    starts.push(
      within(linked !== null && (before === null || linked >= before) ? linked : planned),
    );
  });

  const spans = new Map<FrameId, FrameSpan>();
  ordered.forEach((frame, i) => {
    const start = starts[i]!;
    const next = starts[i + 1];
    const end =
      next === undefined
        ? sceneEnd
        : next > start
          ? next
          : within(start + micros(frame.lengthSeconds));
    spans.set(frame.id, { start, end });
  });
  return spans;
}
