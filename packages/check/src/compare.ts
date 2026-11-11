/**
 * What a frame did against what its storyboard planned (spec 08 sections 9.4 and 9.5): from the
 * scene's state at the frame's end, never from pictures. Each comparison gives an item, passed or
 * a flag, and a few give a note; the tolerances are chosen so a matching frame gives no flags.
 */
import type { NodeId } from '@storystage/ast';
import type { Missing } from '@storystage/playback';
import type {
  CheckItem,
  CheckOutcome,
  Frame,
  LineId,
  PlacedSketch,
  ScriptLine,
} from '@storystage/production';
import type { BackstageId, Micros, StandIn, Transform } from '@storystage/story-api';
import { facing, heightOnPicture, project, type OnPicture, type View } from './geometry.ts';
import type { FrameSpan } from './spans.ts';
import { plural, t } from './strings.ts';

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

/** A speak line spoken in the scene's run: a `say` whose bubble is `caption` (spec 06 section 4.7). */
export interface Spoken {
  /** The `speakLine` block that spoke it, when its run is found. */
  readonly node: NodeId | null;
  /** The speaker's object id, and its name for the learner. */
  readonly object: string;
  readonly name: string;
  readonly text: string;
  /** The script line the block was made from, if any. */
  readonly line: LineId | null;
  readonly start: Micros;
}

/** A dialogue line of the film, by id: its number ("2.3") and words. */
export interface NumberedLine {
  readonly number: string;
  readonly text: string;
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
  /** The speak lines spoken in the scene's run, on the film's clock. */
  readonly spoken: readonly Spoken[];
  /** Every script line of the film by id, numbered by its scene, for speak lines from any scene. */
  readonly lines: ReadonlyMap<LineId, NumberedLine>;
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
              words: t('offCamera.flag', { name }),
              ...base,
            }
          : {
              id: `onScreen:${sketch.id}`,
              kind: 'onScreen',
              outcome: 'flag',
              words: t('onScreen.flag', { name }),
              ...base,
            },
      );
      continue;
    }
    add({
      id: `onScreen:${sketch.id}`,
      kind: 'onScreen',
      outcome: 'passed',
      words: t('onScreen.passed', { name }),
      ...base,
    });

    const wanted = side(sketch.x);
    const got = side(pictured.get(seen)!.x);
    if (wanted && got && wanted !== got)
      add({
        id: `position:${sketch.id}`,
        kind: 'position',
        outcome: 'flag',
        words: t('position.flag', { name, side: t(`side.${got}`), planned: t(`side.${wanted}`) }),
        ...base,
      });
    else if (wanted && got)
      add({
        id: `position:${sketch.id}`,
        kind: 'position',
        outcome: 'passed',
        words: t('position.passed', { name, side: t(`side.${got}`) }),
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
          ? t('facing.now.away')
          : now.view === 'front'
            ? t('facing.now.camera')
            : t(`facing.now.${now.towards ?? 'sideways'}`);
      const plan =
        sketch.facing === 'front'
          ? t('facing.planned.camera')
          : sketch.facing === 'back'
            ? t('facing.planned.away')
            : t(`facing.planned.${sketchTowards ?? 'sideways'}`);
      add({
        id: `facing:${sketch.id}`,
        kind: 'facing',
        outcome: 'flag',
        words: t('facing.flag', { name, now: was, planned: plan }),
        ...base,
      });
    } else
      add({
        id: `facing:${sketch.id}`,
        kind: 'facing',
        outcome: 'passed',
        words: t('facing.passed', { name }),
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
          words: t('order.flag', { left: left.seen.name, right: right.seen.name }),
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
        words: t('onScreen.extra', { name: c.name }),
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
            words: t('shot.closeUp.passed', { name: first.seen.name }),
            sketch: first.sketch.id,
          }
        : {
            id: 'shot',
            kind: 'shot',
            outcome: 'flag',
            words: t('shot.closeUp.flag', { name: first.seen.name }),
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
            words: t('shot.wide.flag', { name: tooClose.seen.name }),
            sketch: tooClose.sketch.id,
          }
        : { id: 'shot', kind: 'shot', outcome: 'passed', words: t('shot.wide.passed') },
    );
  }

  // The lines pinned to the frame.
  run.script.forEach((l, i) => {
    if (l.kind !== 'dialogue' || l.pinnedFrame !== frame.id) return;
    const number = `${run.sceneNumber}.${i + 1}`;
    const base = { id: `line:${l.id}`, kind: 'line' as const, line: l.id };
    const when = run.said.filter((s) => sameWords(s.text, l.text)).map((s) => s.start);
    if (when.some((t) => t >= run.span.start && t < run.span.end))
      add({ ...base, outcome: 'passed', words: t('line.passed', { number }) });
    else if (when.length > 0) {
      const other = run.otherFrames.find((f) =>
        when.some((t) => t >= f.span.start && t < f.span.end),
      );
      add({
        ...base,
        outcome: 'note',
        words: other
          ? t('line.saidIn', { number, frame: other.frameNumber })
          : t('line.saidElsewhere', { number }),
      });
    } else add({ ...base, outcome: 'flag', words: t('line.flag', { number }) });
  });

  // Speak lines spoken in the frame, against the script (spec 06 section 4.1): once a block.
  const pinned = new Set(
    run.script.filter((l) => l.kind === 'dialogue' && l.pinnedFrame === frame.id).map((l) => l.id),
  );
  const spokenHere = new Set<string>();
  for (const s of run.spoken) {
    if (s.start < run.span.start || s.start >= run.span.end) continue;
    const id = `speak:${s.node ?? `${s.object}:${s.line ?? ''}`}`;
    if (spokenHere.has(id)) continue;
    spokenHere.add(id);
    const base = { id, kind: 'line' as const, ...(s.node ? { node: s.node } : {}) };
    const said = (line: LineId, number: string) =>
      // A line pinned to the frame has its own item already.
      pinned.has(line)
        ? null
        : add({
            ...base,
            outcome: 'passed',
            words: t('speak.passed', { name: s.name, number }),
            line,
          });
    if (s.line !== null) {
      const line = run.lines.get(s.line);
      if (!line)
        add({
          ...base,
          outcome: 'note',
          words: t('speak.gone', { name: s.name }),
        });
      else if (sameWords(s.text, line.text)) said(s.line, line.number);
      else
        add({
          ...base,
          outcome: 'flag',
          words: t('speak.changed', { name: s.name, number: line.number }),
          line: s.line,
        });
      continue;
    }
    // Dialogue the script hasn't got is allowed: advice, not a flag.
    const match = run.script.find((l) => l.kind === 'dialogue' && sameWords(l.text, s.text));
    const number = match && run.lines.get(match.id)?.number;
    if (match && number) said(match.id, number);
    else add({ ...base, outcome: 'note', words: t('speak.notInScript', { name: s.name }) });
  }

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
          words: plural('length.flag', Math.round(lasts), { planned }),
        }
      : {
          id: 'length',
          kind: 'length',
          outcome: 'passed',
          words: plural('length.passed', Math.round(lasts)),
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
        words: t('missing.note', { name: m.object }),
      });

  return items.sort((a, b) => ITEM_ORDER.indexOf(a.outcome) - ITEM_ORDER.indexOf(b.outcome));
}
