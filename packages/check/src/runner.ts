/**
 * Running the check (spec 08 sections 9.1, 9.2 and 9.7): each scene is played offscreen on the
 * caller's hidden stage, in fixed steps, deterministic and with the runtime's `trace`, as a
 * rehearsal of that scene (a scene that waits on the viewer goes on after 5 seconds, as the export
 * does). At every step it notes where each character is, and the camera; afterwards it works out
 * each frame's span, takes the state at the frame's end, and compares (`compareFrame`).
 *
 * The caller makes, prepares and disposes of the hidden stage; the runner never disposes of it.
 * No picture is taken, and nothing is sent anywhere.
 */
import { indexProgram, type NodeId, type Program } from '@storystage/ast';
import {
  FILM_CAP,
  Playback,
  type MeasuredBlock,
  type Missing,
  type RuntimeWorker,
} from '@storystage/playback';
import type {
  CheckItem,
  CheckResult,
  Frame,
  FrameId,
  LineId,
  Production,
  SceneId,
} from '@storystage/production';
import type { Stage } from '@storystage/stage';
import {
  CAMERA,
  micros,
  type Micros,
  type ObjectId,
  type StageQuery,
  type StageQueryResult,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import { compareFrame, type NumberedLine, type Seen, type Spoken } from './compare.ts';
import { project } from './geometry.ts';
import { frameSpans, type FrameSpan } from './spans.ts';
import { basisFor } from './status.ts';

/** A scene that waits on the viewer goes on after this long, as in the export. */
const VIEWER_WAIT = micros(5);
const FPS = 30;
/** Every run of a film plays the same way (WP6.5), as the Screening room's does. */
const SEED = 1;

export interface CheckRun {
  readonly production: Production;
  /** Hidden: the caller's, prepared with the film's models. Not disposed here. */
  readonly stage: Stage;
  readonly startWorker: () => RuntimeWorker;
  /** The learner leaves, or the code changes: the run stops with an `AbortError`. */
  readonly signal?: AbortSignal;
  /** Frames done of frames to do: "Checking frame 2 of 5…". */
  readonly onProgress?: (done: number, total: number) => void;
}

/** One step of the run: where each character and the camera were. */
interface Sample {
  readonly at: Micros;
  readonly camera: Transform;
  readonly lens: number;
  readonly characters: ReadonlyMap<
    string,
    { readonly transform: Transform; readonly showing: boolean }
  >;
}

/** What the scene's run did. */
interface SceneRun {
  readonly length: Micros;
  readonly samples: readonly Sample[];
  readonly blocks: readonly MeasuredBlock[];
  readonly said: readonly { readonly text: string; readonly start: Micros }[];
  /** The speak lines' captions, before they're matched with their blocks. */
  readonly captions: readonly Omit<Spoken, 'node' | 'name'>[];
  readonly error: {
    readonly at: Micros;
    readonly node: NodeId | null;
    readonly words: string;
  } | null;
  readonly missing: readonly Missing[];
  readonly heights: ReadonlyMap<string, number>;
}

/** The stage's answer, if it's of this kind; `null` for an object it doesn't know. */
function ask(stage: Stage, query: StageQuery, kind: StageQueryResult['kind']): unknown {
  try {
    const answer = stage.answer(query);
    return answer.kind === kind ? answer.value : null;
  } catch {
    // An object the stage doesn't know (a stand-in it couldn't make): nothing to say about it.
    return null;
  }
}

/** Plays one scene on the hidden stage, noting everything the comparison needs. */
async function runScene(run: CheckRun, scene: SceneId): Promise<SceneRun> {
  const { production, stage, signal } = run;
  const setup = production.scenes.find((s) => s.id === scene)?.setup;
  const objects = (setup?.objects ?? []).map((o) => o.id as string);
  const worker = run.startWorker();
  const playback = new Playback({
    production,
    stage,
    port: worker.port,
    terminate: worker.terminate,
    mode: 'rehearse',
    seed: SEED,
    from: scene,
    trace: true,
    viewerWait: VIEWER_WAIT,
  });
  const blocks: MeasuredBlock[] = [];
  const said: { text: string; start: Micros }[] = [];
  const captions: Omit<Spoken, 'node' | 'name'>[] = [];
  let error: SceneRun['error'] = null;
  let missing: readonly Missing[] = [];
  let now: Micros = 0;
  playback.on((e) => {
    switch (e.kind) {
      case 'ran':
        for (const b of e.blocks) blocks.push({ scene, node: b.node, at: b.at });
        break;
      case 'commands':
        for (const c of e.commands) {
          if (c.kind !== 'say' || c.bubble === 'think') continue;
          said.push({ text: c.text, start: c.start });
          if (c.bubble === 'caption')
            captions.push({
              object: c.object,
              text: c.text,
              line: (c.line ?? null) as LineId | null,
              start: c.start,
            });
        }
        break;
      case 'error':
        error = { at: now, node: e.error.node, words: e.words };
        break;
      case 'missing':
        missing = e.missing;
        break;
      default:
        break;
    }
  });

  const samples: Sample[] = [];
  const heights = new Map<string, number>();
  const sample = (at: Micros) => {
    const camera = ask(
      stage,
      { kind: 'transform', object: CAMERA, at },
      'transform',
    ) as Transform | null;
    const lens = ask(stage, { kind: 'lens', at }, 'lens') as number | null;
    if (!camera || lens === null) return;
    const characters = new Map<string, { transform: Transform; showing: boolean }>();
    for (const id of objects) {
      const object = id as ObjectId;
      const transform = ask(
        stage,
        { kind: 'transform', object, at },
        'transform',
      ) as Transform | null;
      if (!transform) continue;
      const showing =
        (ask(stage, { kind: 'isVisible', object, at }, 'isVisible') as boolean | null) ?? false;
      characters.set(id, { transform, showing });
      if (!heights.has(id)) {
        const size = ask(stage, { kind: 'size', object, at }, 'size') as Vec3 | null;
        if (size) heights.set(id, size.y);
      }
    }
    samples.push({ at, camera, lens, characters });
  };

  try {
    signal?.throwIfAborted();
    await playback.start();
    sample(0);
    for (let frame = 1; !playback.ended(); frame++) {
      signal?.throwIfAborted();
      now = Math.min(FILM_CAP, Math.round((frame * 1_000_000) / FPS));
      await playback.frame(now);
      sample(now);
      if (now >= FILM_CAP) break;
    }
  } finally {
    playback.dispose();
  }
  return { length: now, samples, blocks, said, captions, error, missing, heights };
}

/** The sample at or just before `t`. */
function sampleAt(samples: readonly Sample[], t: Micros): Sample | null {
  let found: Sample | null = null;
  for (const s of samples) {
    if (s.at > t) break;
    found = s;
  }
  return found;
}

/** A character's name for the learner: its object id, with dashes as spaces, first letter up. */
const nameOf = (id: string) => {
  const words = id.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The program's `speakLine` blocks, found once for each program. */
const speakBlocks = new WeakMap<Program, ReadonlySet<NodeId>>();
function speakLinesOf(program: Program): ReadonlySet<NodeId> {
  let found = speakBlocks.get(program);
  if (!found) {
    const ids = new Set<NodeId>();
    for (const [id, { node }] of indexProgram(program))
      if (node.kind === 'call' && node.callee.kind === 'story' && node.callee.name === 'speakLine')
        ids.add(id);
    speakBlocks.set(program, (found = ids));
  }
  return found;
}

/**
 * Each caption with the `speakLine` block that spoke it: the block whose run started at the
 * caption's start, taken in order, so a block run twice is matched twice.
 */
function withBlocks(production: Production, done: SceneRun): Spoken[] {
  const speakers = speakLinesOf(production.program);
  const runs = done.blocks.filter((b) => speakers.has(b.node));
  const used = new Set<number>();
  return done.captions.map((c) => {
    const at = runs.findIndex((b, i) => !used.has(i) && b.at === c.start);
    if (at >= 0) used.add(at);
    return { ...c, node: at >= 0 ? runs[at]!.node : null, name: nameOf(c.object) };
  });
}

/** Every script line of the film by id, numbered as "2.3": its scene's place, then its own. */
export function numberedLines(production: Production): ReadonlyMap<LineId, NumberedLine> {
  const lines = new Map<LineId, NumberedLine>();
  production.manifest.runningOrder.forEach((r, s) => {
    production.script
      .filter((l) => l.scene === r.scene)
      .forEach((l, i) => lines.set(l.id, { number: `${s + 1}.${i + 1}`, text: l.text }));
  });
  return lines;
}

/** Compares every frame of one scene with what its run did. */
function judge(production: Production, scene: SceneId, done: SceneRun): Map<FrameId, CheckResult> {
  const sceneNumber = production.manifest.runningOrder.findIndex((r) => r.scene === scene) + 1;
  const frames = production.frames
    .filter((f) => f.scene === scene)
    .sort((a, b) => a.order - b.order);
  const spans = frameSpans(
    { scene, transition: null, start: 0, length: done.length, waits: false },
    frames,
    done.blocks,
  );
  const setup = production.scenes.find((s) => s.id === scene)?.setup;
  const card = production.storyboard.cards.find((c) => c.id === scene);
  const script = production.script.filter((l) => l.scene === scene);
  const numberOf = (f: Frame) => `${sceneNumber}.${f.order + 1}`;
  const spoken = withBlocks(production, done);
  const lines = numberedLines(production);
  const results = new Map<FrameId, CheckResult>();

  for (const frame of frames) {
    const span: FrameSpan = spans.get(frame.id)!;
    // The state just before the frame ends: the last moment that's still this frame's.
    const end = sampleAt(done.samples, Math.max(span.start, span.end - 1));
    const during = done.samples.filter((s) => s.at >= span.start && s.at < span.end);
    let items: CheckItem[];
    if (!end) {
      items = [];
    } else {
      const characters: Seen[] = (setup?.objects ?? []).flatMap((o) => {
        const at = end.characters.get(o.id);
        if (!at) return [];
        const height = done.heights.get(o.id) ?? 1;
        const middle = (t: Transform) => ({
          x: t.position.x,
          y: t.position.y + height / 2,
          z: t.position.z,
        });
        const seenDuring = during.some((s) => {
          const c = s.characters.get(o.id);
          return !!c && c.showing && project(s.camera, s.lens, middle(c.transform)).onScreen;
        });
        return [
          {
            object: o.id,
            name: nameOf(o.id),
            model: o.model,
            transform: at.transform,
            height,
            showing: at.showing,
            seenDuring,
          },
        ];
      });
      items = compareFrame({
        frame,
        sceneNumber,
        frameNumber: numberOf(frame),
        span,
        camera: end.camera,
        lens: end.lens,
        characters,
        script,
        said: done.said,
        spoken,
        lines,
        otherFrames: frames
          .filter((f) => f.id !== frame.id)
          .map((f) => ({ frameNumber: numberOf(f), span: spans.get(f.id)! })),
        error: done.error,
        missing: done.missing,
        cast: card?.cast ?? [],
      });
    }
    results.set(frame.id, { basis: basisFor(production, frame, items), items });
  }
  return results;
}

/**
 * Checks every frame of one scene: plays it on the hidden stage and compares. The results are
 * ready for the production session's `annotate` (S4): no undo step.
 */
export async function checkScene(
  run: CheckRun & { readonly scene: SceneId },
): Promise<Map<FrameId, CheckResult>> {
  const frames = run.production.frames.filter((f) => f.scene === run.scene).length;
  run.onProgress?.(0, frames);
  const done = await runScene(run, run.scene);
  const results = judge(run.production, run.scene, done);
  run.onProgress?.(frames, frames);
  return results;
}

/** Checks one frame: plays its scene, and gives that frame's result. */
export async function checkFrame(
  run: CheckRun & { readonly frame: FrameId },
): Promise<CheckResult> {
  const frame = run.production.frames.find((f) => f.id === run.frame);
  if (!frame) throw new Error(`No frame ${run.frame}.`);
  const results = await checkScene({ ...run, scene: frame.scene });
  return results.get(frame.id)!;
}

/** Checks the whole film, scene after scene in running order, on the one hidden stage. */
export async function checkFilm(run: CheckRun): Promise<Map<FrameId, CheckResult>> {
  const { production } = run;
  const order = production.manifest.runningOrder.map((r) => r.scene);
  const total = production.frames.filter((f) => order.includes(f.scene)).length;
  const all = new Map<FrameId, CheckResult>();
  let done = 0;
  run.onProgress?.(0, total);
  for (const scene of order) {
    const results = judge(production, scene, await runScene(run, scene));
    for (const [id, result] of results) all.set(id, result);
    done += results.size;
    run.onProgress?.(done, total);
  }
  return all;
}

/**
 * The result to hand `annotate`: the previous one, unchanged, when nothing in it changed, so the
 * frame card isn't drawn again for nothing (S4 and S5).
 */
export function sameOrNew(previous: Frame['check'], next: CheckResult): CheckResult {
  if (
    previous &&
    previous.basis === next.basis &&
    JSON.stringify(previous.items) === JSON.stringify(next.items)
  )
    return { basis: previous.basis, items: previous.items };
  return next;
}
