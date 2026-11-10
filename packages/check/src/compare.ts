/**
 * What a frame did against what its storyboard planned (spec 08 sections 9.4 and 9.5): from the
 * scene's state at the frame's end, never from pictures. Each comparison gives an item, passed or
 * a flag, and a few give a note; the tolerances are chosen so a matching frame gives no flags.
 */
import type { NodeId } from '@storystage/ast';
import type { Missing } from '@storystage/playback';
import type { Frame, LineId, PlacedSketch, ScriptLine } from '@storystage/production';
import type { BackstageId, Micros, StandIn, Transform } from '@storystage/story-api';
import { facing, heightOnPicture, project, type OnPicture, type View } from './geometry.ts';
import type { FrameSpan } from './spans.ts';

// ---- The result's shape, as S4's format 1.3.0 has it (#338) --------------------------------

export type CheckKind =
  | 'onScreen'
  | 'offCamera'
  | 'position'
  | 'order'
  | 'facing'
  | 'shot'
  | 'line'
  | 'length'
  | 'problem'
  | 'missing';
export type CheckOutcome = 'passed' | 'flag' | 'note';

export interface CheckItem {
  /** Stable across runs, and unique in the frame: `kept` points at it. */
  readonly id: string;
  readonly kind: CheckKind;
  readonly outcome: CheckOutcome;
  /** Plain words (9.5). */
  readonly words: string;
  readonly node?: NodeId;
  readonly sketch?: string;
  readonly line?: LineId;
}

/** Flags first, then notes, then passed items, so every view lists them the same way. */
export const ITEM_ORDER: readonly CheckOutcome[] = ['flag', 'note', 'passed'];

// ---- What the runner gives for a frame -------------------------------------------------------

/** A character of the scene's set-up, as the stage had it at the frame's end. */
export interface Seen {
  /** Its object id in the set-up. */
  readonly object: string;
  /** Its name for the learner: the script's, or else the set-up's. */
  readonly name: string;
  readonly model: BackstageId | StandIn;
  readonly transform: Transform;
  /** Its height, metres. */
  readonly height: number;
  /** Showing: its opacity above 0 (the stage's `isVisible`). */
  readonly showing: boolean;
  /** On screen at some moment during the frame. */
  readonly seenDuring: boolean;
}

export interface FrameRun {
  readonly frame: Frame;
  /** The scene's place in the running order, and the frame's number ("2.1"). */
  readonly sceneNumber: number;
  readonly frameNumber: string;
  readonly span: FrameSpan;
  readonly camera: Transform;
  /** The camera's vertical angle, in turns. */
  readonly lens: number;
  readonly characters: readonly Seen[];
  /** The scene's script lines, in order: their place gives "Line 2.3". */
  readonly script: readonly ScriptLine[];
  /** What was said or spoken in the scene's run, on the film's clock. */
  readonly said: readonly { readonly text: string; readonly start: Micros }[];
  /** The scene's other frames, for "said in frame 2.4". */
  readonly otherFrames: readonly { readonly frameNumber: string; readonly span: FrameSpan }[];
  /** The error that stopped the scene's run, if any. */
  readonly error: {
    readonly at: Micros;
    readonly node: NodeId | null;
    readonly words: string;
  } | null;
  readonly missing: readonly Missing[];
  /** The scene card's cast: a sketch of one of them is a character, even with no object for it. */
  readonly cast: readonly (BackstageId | StandIn)[];
}

// ---- The tolerances (9.4) --------------------------------------------------------------------

/** A side of the picture counts when it's this far from the middle. */
const SIDE = 0.15;
/** Two characters closer than this across the picture aren't in an order. */
const ORDER = 0.1;
/** A close-up fills at least this much of the picture's height; a wide shot no more than this. */
const CLOSE_UP = 0.4;
const WIDE = 0.6;
/**
 * Unflipped, a side or three-quarter sketch faces the picture's left, and `flipped` turns it to
 * the right (S5, from the sketch renderer's `VIEWS` in `packages/sketches`).
 */
export const UNFLIPPED_FACES: 'left' | 'right' = 'left';

const VIEWS: readonly View[] = ['front', 'threeQuarter', 'side', 'back'];

const sameModel = (a: BackstageId | StandIn, b: BackstageId | StandIn) =>
  typeof a === 'string' || typeof b === 'string' ? a === b : a.standIn === b.standIn;

/** Words compared as captions compare them: case, spacing and end marks aside. */
function sameWords(a: string, b: string): boolean {
  const plain = (text: string) => {
    const words = text.replace(/\s+/g, ' ').trim().toLowerCase();
    let end = words.length;
    while (end > 0 && '.!?…,;:'.includes(words[end - 1]!)) end--;
    return words.slice(0, end);
  };
  return plain(a) === plain(b);
}

/** A model's name from its id, for a character with no object: "class/Quadruped/red-fox" is "Red fox". */
function nameOf(item: BackstageId | StandIn): string {
  const raw = typeof item === 'string' ? item.slice(item.lastIndexOf('/') + 1) : item.standIn;
  const words = raw.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const side = (x: number) => (x < 0.5 - SIDE ? 'left' : x > 0.5 + SIDE ? 'right' : null);

/** The sketches of characters, each with the set-up object it stands for. */
function match(
  frame: Frame,
  characters: readonly Seen[],
  cast: readonly (BackstageId | StandIn)[],
  pictured: Map<Seen, OnPicture>,
) {
  const pairs: { sketch: PlacedSketch; seen: Seen | null }[] = [];
  const used = new Set<Seen>();
  const models = new Map<string, PlacedSketch[]>();
  for (const s of frame.sketches) {
    // A character: an object of the set-up, or one of the scene's cast. Marks and backdrop
    // sketches are neither.
    if (
      !characters.some((c) => sameModel(c.model, s.item)) &&
      !cast.some((c) => sameModel(c, s.item))
    )
      continue;
    const key = typeof s.item === 'string' ? s.item : `standIn:${s.item.standIn}`;
    models.set(key, [...(models.get(key) ?? []), s]);
  }
  // Where two objects share a model, they're matched to its sketches in left-to-right order.
  for (const sketches of models.values()) {
    const ordered = [...sketches].sort((a, b) => a.x - b.x);
    const objects = characters
      .filter((c) => sameModel(c.model, ordered[0]!.item))
      .sort((a, b) => pictured.get(a)!.x - pictured.get(b)!.x);
    ordered.forEach((s, i) => {
      const seen = objects[i] ?? null;
      if (seen) used.add(seen);
      pairs.push({ sketch: s, seen });
    });
  }
  return { pairs, unsketched: characters.filter((c) => !used.has(c)) };
}

/** Every item for one frame, flags first. */
export function compareFrame(run: FrameRun): CheckItem[] {
  const items: CheckItem[] = [];
  const add = (item: CheckItem) => items.push(item);
  const { frame, camera, lens } = run;

  const middle = (c: Seen) => ({
    x: c.transform.position.x,
    y: c.transform.position.y + c.height / 2,
    z: c.transform.position.z,
  });
  const pictured = new Map(run.characters.map((c) => [c, project(camera, lens, middle(c))]));
  const onScreen = (c: Seen) => c.showing && pictured.get(c)!.onScreen;
  const { pairs, unsketched } = match(frame, run.characters, run.cast, pictured);

  // Who's on screen, where, and which way they face.
  for (const { sketch, seen } of pairs) {
    const name = seen?.name ?? nameOf(sketch.item);
    const base = { sketch: sketch.id };
    if (!seen || !onScreen(seen)) {
      add(
        seen?.seenDuring
          ? {
              id: `onScreen:${sketch.id}`,
              kind: 'offCamera',
              outcome: 'flag',
              words: `${name} walks off camera during this frame`,
              ...base,
            }
          : {
              id: `onScreen:${sketch.id}`,
              kind: 'onScreen',
              outcome: 'flag',
              words: `${name} isn't on screen at the end of this frame`,
              ...base,
            },
      );
      continue;
    }
    add({
      id: `onScreen:${sketch.id}`,
      kind: 'onScreen',
      outcome: 'passed',
      words: `${name} is on screen`,
      ...base,
    });

    const wanted = side(sketch.x);
    const got = side(pictured.get(seen)!.x);
    if (wanted && got && wanted !== got)
      add({
        id: `position:${sketch.id}`,
        kind: 'position',
        outcome: 'flag',
        words: `${name} ends on the ${got}; your sketch has it on the ${wanted}`,
        ...base,
      });
    else if (wanted && got)
      add({
        id: `position:${sketch.id}`,
        kind: 'position',
        outcome: 'passed',
        words: `${name} is on the ${got}, as in your sketch`,
        ...base,
      });

    const now = facing(seen.transform, camera);
    const steps = Math.abs(VIEWS.indexOf(now.view) - VIEWS.indexOf(sketch.facing));
    const sketchTowards =
      sketch.facing === 'side'
        ? sketch.flipped
          ? UNFLIPPED_FACES === 'left'
            ? 'right'
            : 'left'
          : UNFLIPPED_FACES
        : null;
    const wrongWay = now.view === 'side' && sketchTowards !== null && now.towards !== sketchTowards;
    if (steps >= 2 || wrongWay) {
      const was =
        now.view === 'back'
          ? 'faces away'
          : now.view === 'front'
            ? 'faces the camera'
            : `faces ${now.towards ?? 'sideways'}`;
      const plan =
        sketch.facing === 'front'
          ? 'facing the camera'
          : sketch.facing === 'back'
            ? 'facing away'
            : `facing ${sketchTowards ?? 'sideways'}`;
      add({
        id: `facing:${sketch.id}`,
        kind: 'facing',
        outcome: 'flag',
        words: `${name} ${was}; your sketch has it ${plan}`,
        ...base,
      });
    } else
      add({
        id: `facing:${sketch.id}`,
        kind: 'facing',
        outcome: 'passed',
        words: `${name} faces as in your sketch`,
        ...base,
      });
  }

  // The order across the picture, for each pair both on screen.
  const shown = pairs.filter(
    (p): p is { sketch: PlacedSketch; seen: Seen } => !!p.seen && onScreen(p.seen),
  );
  for (let i = 0; i < shown.length; i++)
    for (let j = i + 1; j < shown.length; j++) {
      const [a, b] = [shown[i]!, shown[j]!];
      const across = pictured.get(a.seen)!.x - pictured.get(b.seen)!.x;
      const planned = a.sketch.x - b.sketch.x;
      if (
        Math.abs(across) > ORDER &&
        Math.abs(planned) > ORDER &&
        Math.sign(across) !== Math.sign(planned)
      ) {
        const [left, right] = planned < 0 ? [a, b] : [b, a];
        add({
          id: `order:${left.sketch.id}:${right.sketch.id}`,
          kind: 'order',
          outcome: 'flag',
          words: `${left.seen.name} and ${right.seen.name} are the other way round from your sketch`,
          sketch: left.sketch.id,
        });
      }
    }

  // Characters on screen that the sketch hasn't got.
  for (const c of unsketched)
    if (onScreen(c))
      add({
        id: `extra:${c.object}`,
        kind: 'onScreen',
        outcome: 'note',
        words: `${c.name} is on screen, but not in your sketch`,
      });

  // The shot.
  const first = shown[0];
  if (frame.shot === 'closeUp' && first) {
    const fills = heightOnPicture(first.seen.height, pictured.get(first.seen)!.depth, lens);
    add(
      fills >= CLOSE_UP
        ? {
            id: 'shot',
            kind: 'shot',
            outcome: 'passed',
            words: `The close-up frames ${first.seen.name}`,
            sketch: first.sketch.id,
          }
        : {
            id: 'shot',
            kind: 'shot',
            outcome: 'flag',
            words: `The close-up doesn't fill the picture with ${first.seen.name}`,
            sketch: first.sketch.id,
          },
    );
  } else if (frame.shot === 'wide' && shown.length > 0) {
    const tooClose = shown.find(
      (p) => heightOnPicture(p.seen.height, pictured.get(p.seen)!.depth, lens) > WIDE,
    );
    add(
      tooClose
        ? {
            id: 'shot',
            kind: 'shot',
            outcome: 'flag',
            words: `The wide shot is too close to ${tooClose.seen.name}`,
            sketch: tooClose.sketch.id,
          }
        : { id: 'shot', kind: 'shot', outcome: 'passed', words: 'The wide shot shows everyone' },
    );
  }

  // The lines pinned to the frame.
  run.script.forEach((l, i) => {
    if (l.kind !== 'dialogue' || l.pinnedFrame !== frame.id) return;
    const number = `${run.sceneNumber}.${i + 1}`;
    const base = { id: `line:${l.id}`, kind: 'line' as const, line: l.id };
    const when = run.said.filter((s) => sameWords(s.text, l.text)).map((s) => s.start);
    if (when.some((t) => t >= run.span.start && t < run.span.end))
      add({ ...base, outcome: 'passed', words: `Line ${number} is said` });
    else if (when.length > 0) {
      const other = run.otherFrames.find((f) =>
        when.some((t) => t >= f.span.start && t < f.span.end),
      );
      add({
        ...base,
        outcome: 'note',
        words: other
          ? `Line ${number} is said in frame ${other.frameNumber}`
          : `Line ${number} is said in another frame`,
      });
    } else add({ ...base, outcome: 'flag', words: `Line ${number} is never said` });
  });

  // The frame's length.
  const lasts = (run.span.end - run.span.start) / 1_000_000;
  const planned = frame.lengthSeconds;
  const long = lasts > planned * 1.5 + 1;
  const short = lasts < planned * 0.5 - 1;
  add(
    long || short
      ? {
          id: 'length',
          kind: 'length',
          outcome: 'flag',
          words: `This frame lasts ${Math.round(lasts)} seconds; you planned ${planned}`,
        }
      : {
          id: 'length',
          kind: 'length',
          outcome: 'passed',
          words: `This frame lasts about ${Math.round(lasts)} seconds, as planned`,
        },
  );

  // Problems while it runs.
  if (run.error && run.error.at >= run.span.start && run.error.at < run.span.end)
    add({
      id: 'problem',
      kind: 'problem',
      outcome: 'flag',
      words: run.error.words,
      ...(run.error.node ? { node: run.error.node } : {}),
    });
  for (const m of run.missing)
    if (m.kind === 'model')
      add({
        id: `missing:${m.object}`,
        kind: 'missing',
        outcome: 'note',
        words: `${m.object} can't be found on this device, so it shows as an outline`,
      });

  return items.sort((a, b) => ITEM_ORDER.indexOf(a.outcome) - ITEM_ORDER.indexOf(b.outcome));
}
