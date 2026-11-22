/**
 * The rough cut's logic (WP11.1, spec 08 section 2), from `measure`'s timeline: the segments of
 * the bar under the player, the time, the scene and frame at a moment, and the moment Compare's
 * film still shows (11.2, section 3). Pure, so the screen only draws what these give.
 */
import type { MeasuredScene, Timeline } from '@storystage/playback';
import type { Frame, Production, SceneId } from '@storystage/production';
import { MICROS_PER_SECOND, micros, type Micros } from '@storystage/story-api';

/** One scene's part of the film. A scene that plays twice has two. */
export interface Segment {
  readonly scene: SceneId;
  /** Its place in the running order, from 1. */
  readonly number: number;
  readonly heading: string;
  readonly start: Micros;
  readonly length: Micros;
  /** It waits on the viewer, so it has no fixed length: its segment ends in a mark. */
  readonly waits: boolean;
}

export function segments(production: Production, timeline: Timeline): Segment[] {
  const order = production.manifest.runningOrder.map((e) => e.scene);
  const heading = (scene: SceneId) =>
    production.storyboard.cards.find((c) => c.id === scene)?.heading ?? '';
  return timeline.scenes.map((s: MeasuredScene) => ({
    scene: s.scene,
    number: order.indexOf(s.scene) + 1,
    heading: heading(s.scene),
    start: s.start,
    length: s.length,
    waits: s.waits,
  }));
}

/** "1:12": minutes and whole seconds. */
export function clock(t: Micros): string {
  const seconds = Math.floor(Math.max(0, t) / MICROS_PER_SECOND);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const waits = (timeline: Timeline) => timeline.scenes.some((s) => s.waits);

/** "0:38 / 1:12", or "0:38 / 1:12+" when a scene waits on the viewer. */
export function timeLabel(t: Micros, timeline: Timeline): string {
  return `${clock(t)} / ${clock(timeline.length)}${waits(timeline) ? '+' : ''}`;
}

/** The bar's `aria-valuetext`: "0:38 of 1:12". */
export function sliderText(t: Micros, timeline: Timeline): string {
  return `${clock(t)} of ${clock(timeline.length)}${waits(timeline) ? ' or more' : ''}`;
}

/** The segment playing at `t`: the later one at a boundary, the last one at the end. */
export function sceneAt(all: readonly Segment[], t: Micros): Segment | null {
  let found: Segment | null = null;
  for (const s of all) if (s.start <= t) found = s;
  return found;
}

/** A scene's frames in storyboard order. */
const framesOf = (production: Production, scene: SceneId) =>
  production.frames.filter((f) => f.scene === scene).sort((a, b) => a.order - b.order);

/** The frame whose planned length covers `offset` into its scene, or the last one after them. */
function plannedFrame(frames: readonly Frame[], offset: Micros): Frame | null {
  let end = 0;
  for (const f of frames) {
    end += micros(f.lengthSeconds);
    if (offset < end) return f;
  }
  return frames.at(-1) ?? null;
}

/**
 * The current frame at `t`: the frame linked to the block that ran most recently in this
 * scene; if none is linked, the frame whose planned length covers this moment.
 */
export function currentFrame(production: Production, timeline: Timeline, t: Micros): Frame | null {
  const segment = sceneAt(segments(production, timeline), t);
  if (!segment) return null;
  const frames = framesOf(production, segment.scene);
  if (frames.length === 0) return null;
  const linked = timeline.blocks
    .filter((b) => b.scene === segment.scene && b.at >= segment.start && b.at <= t)
    .map((b) => frames.find((f) => f.links.includes(b.node)))
    .filter((f) => f !== undefined);
  return linked.at(-1) ?? plannedFrame(frames, t - segment.start);
}

/** The player's label, "Scene 2 · Frame 2.3", as numbers for the strings to say. */
export function frameLabel(
  segment: Segment,
  frame: Frame | null,
): { readonly scene: number; readonly frame: string | null } {
  if (!frame) return { scene: segment.number, frame: null };
  return { scene: segment.number, frame: `${segment.number}.${frame.order + 1}` };
}

/**
 * The moment Compare's film still shows for a frame: when its linked blocks first ran in the
 * scene's first play, or else the end of its planned span, inside the scene. `null` if the
 * scene never played.
 */
export function stillMoment(
  production: Production,
  timeline: Timeline,
  frame: Frame,
): Micros | null {
  const scene = timeline.scenes.find((s) => s.scene === frame.scene);
  if (!scene) return null;
  const end = scene.start + scene.length;
  const ran = timeline.blocks.find(
    (b) =>
      b.scene === frame.scene && b.at >= scene.start && b.at < end && frame.links.includes(b.node),
  );
  if (ran) return ran.at;
  let planned = scene.start;
  for (const f of framesOf(production, frame.scene)) {
    planned += micros(f.lengthSeconds);
    if (f.id === frame.id) break;
  }
  return Math.min(planned, end - 1);
}

/** The bar's keys: the arrows move 5 seconds, Home and End go to the ends. */
export function nudge(t: Micros, key: string, timeline: Timeline): Micros | null {
  const step = micros(5);
  const within = (x: Micros) => Math.min(timeline.length, Math.max(0, x));
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return within(t + step);
    case 'ArrowLeft':
    case 'ArrowDown':
      return within(t - step);
    case 'Home':
      return 0;
    case 'End':
      return timeline.length;
    default:
      return null;
  }
}
