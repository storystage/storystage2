/**
 * What the Prompter reads about the open production (`docs/spec/04-prompter.md` sections 2.1 to
 * 2.3 and 2.6, WP13.3): the production and the storyboard, each as data for its own tag. Both
 * keep to their token budgets, trimming the way section 2.6 says, and neither holds a picture.
 */
import {
  STATEMENT_KINDS,
  indexProgram,
  programText,
  type NodeId,
  type Program,
} from '@storystage/ast';
import type { Frame, PlacedSketch, Production, SceneId, ScriptLine } from '@storystage/production';
import type { SceneObjectSetup, SceneSetup, Transform } from '@storystage/story-api';
import type { Json, JsonObject } from './transport.ts';

/** Section 2.1. Tokens are estimated at three characters each, which overcounts on purpose. */
export const PROGRAM_TOKEN_BUDGET = 20_000;
export const STORYBOARD_TOKEN_BUDGET = 8_000;
export const estimateTokens = (text: string) => Math.ceil(text.length / 3);

const round = (n: number) => Math.round(n * 100) / 100 + 0;

// ---- The program as text, with ids --------------------------------------------------------------

const MARKED: ReadonlySet<string> = new Set([
  'type',
  'field',
  'method',
  'listener',
  ...STATEMENT_KINDS,
]);

/**
 * The program as text (section 2.2), each line that starts a declaration or statement ending
 * with `  # [id]`. Methods not in `full` keep their first line, and their body becomes one line;
 * with `full` left out, every method is shown whole.
 */
export function programWithIds(program: Program, full?: ReadonlySet<NodeId>): string {
  const view = programText(program);
  const index = indexProgram(program);
  const lines = view.text.split('\n');
  const starts: number[] = [];
  let at = 0;
  for (const line of lines) {
    starts.push(at);
    at += line.length + 1;
  }
  const lineOf = (offset: number) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const ids: (NodeId | null)[] = lines.map(() => null);
  const hidden = new Map<number, number>();
  // Outermost first, so an inner node starting on the same line wins.
  for (const span of view.spans) {
    const node = index.get(span.node)?.node;
    if (!node || !MARKED.has(node.kind)) continue;
    const first = lineOf(span.start);
    ids[first] = span.node;
    if (node.kind === 'method' && full && !full.has(span.node)) {
      const last = lineOf(Math.max(span.start, span.end - 1));
      if (last > first) hidden.set(first + 1, last);
    }
  }

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const end = hidden.get(i);
    if (end !== undefined) {
      const indent = /^\s*/.exec(lines[i]!)![0];
      const n = end - i + 1;
      out.push(`${indent}... ${n} ${n === 1 ? 'line' : 'lines'} not shown`);
      i = end;
      continue;
    }
    const id = ids[i];
    out.push(id && lines[i]!.trim() !== '' ? `${lines[i]}  # [${id}]` : lines[i]!);
  }
  return out.join('\n');
}

// ---- The production -------------------------------------------------------------------------

const isIdentity = (t: Transform['rotation']) => t.x === 0 && t.y === 0 && t.z === 0 && t.w === 1;
const isOne = (s: Transform['scale']) => s.x === 1 && s.y === 1 && s.z === 1;

function placement(t: Transform): JsonObject {
  return {
    position: [round(t.position.x), round(t.position.y), round(t.position.z)],
    ...(isIdentity(t.rotation)
      ? {}
      : {
          rotation: [
            round(t.rotation.x),
            round(t.rotation.y),
            round(t.rotation.z),
            round(t.rotation.w),
          ],
        }),
    ...(isOne(t.scale) ? {} : { scale: [round(t.scale.x), round(t.scale.y), round(t.scale.z)] }),
  };
}

function object(o: SceneObjectSetup): JsonObject {
  return {
    id: o.id,
    model: o.model as Json,
    class: o.class,
    ...placement(o.transform),
    ...(o.opacity !== undefined && o.opacity !== 1 ? { opacity: round(o.opacity) } : {}),
    ...(o.paint !== undefined ? { paint: o.paint } : {}),
    ...(o.vehicle ? { vehicle: o.vehicle } : {}),
  };
}

function setupData(setup: SceneSetup): JsonObject {
  const { camera } = setup;
  return {
    backdrop: setup.backdrop as JsonObject,
    objects: setup.objects.map(object),
    camera: {
      ...placement(camera.transform),
      ...(camera.fieldOfViewDegrees !== undefined
        ? { fieldOfView: round(camera.fieldOfViewDegrees) }
        : {}),
    },
    markers: setup.markers.map((m) => ({ id: m.id, ...placement(m.transform) })),
  };
}

export interface ContextPlace {
  /** The scene the learner is in. */
  readonly scene: SceneId;
  /** The method open in the editor, if any. */
  readonly open?: NodeId | null;
}

/** `<production_data>` (section 2.6). */
export function productionData(p: Production, { scene, open = null }: ContextPlace): JsonObject {
  const current = p.scenes.find((s) => s.id === scene);
  const whole = programWithIds(p.program);
  const program =
    estimateTokens(whole) <= PROGRAM_TOKEN_BUDGET
      ? whole
      : programWithIds(
          p.program,
          new Set([open, current?.method].filter((id): id is NodeId => id != null)),
        );
  const methods = new Map(p.scenes.map((s) => [s.id, s.method]));
  return {
    scene,
    scenes: p.manifest.runningOrder.map(({ scene: id }) => ({
      id,
      method: methods.get(id) ?? null,
    })),
    setup: current ? setupData(current.setup) : null,
    imported: p.manifest.models.map(({ item }) => ({
      id: item.id,
      name: item.displayName,
      section: item.section,
      class: item.class,
      ...(item.description ? { description: item.description } : {}),
    })),
    program,
    ...(open ? { open } : {}),
  };
}

// ---- The storyboard -------------------------------------------------------------------------

function line(l: ScriptLine): JsonObject {
  return {
    id: l.id,
    scene: l.scene,
    kind: l.kind,
    ...(l.kind === 'dialogue' && l.character !== null ? { character: l.character } : {}),
    text: l.text,
    ...(l.pinnedFrame ? { frame: l.pinnedFrame } : {}),
  };
}

function sketch(s: PlacedSketch): JsonObject {
  return {
    id: s.id,
    item: s.item as Json,
    facing: s.facing,
    x: round(s.x),
    y: round(s.y),
    ...(s.pose !== null ? { pose: s.pose } : {}),
    ...(s.scale !== 1 ? { scale: round(s.scale) } : {}),
    ...(s.flipped ? { flipped: true } : {}),
    ...(s.layer !== 0 ? { layer: s.layer } : {}),
  };
}

function frame(f: Frame, withSketches: boolean): JsonObject {
  return {
    id: f.id,
    scene: f.scene,
    order: f.order,
    caption: f.caption,
    shot: f.shot,
    seconds: round(f.lengthSeconds),
    links: [...f.links],
    ...(withSketches ? { sketches: f.sketches.map(sketch) } : {}),
  };
}

function storyboard(p: Production, keep: (scene: SceneId) => boolean): JsonObject {
  const position = new Map(p.manifest.runningOrder.map((r, i) => [r.scene, i]));
  const frames = [...p.frames].sort(
    (a, b) =>
      (position.get(a.scene) ?? Infinity) - (position.get(b.scene) ?? Infinity) ||
      a.order - b.order,
  );
  const { logline, synopsis, arc, cards } = p.storyboard;
  return {
    logline,
    synopsis,
    arc: arc as unknown as Json,
    cards: cards as unknown as Json,
    script: p.script.filter((l) => keep(l.scene)).map(line),
    frames: frames.map((f) => frame(f, keep(f.scene))),
  };
}

/** `<storyboard_data>` (section 2.6). */
export function storyboardData(p: Production, { scene }: ContextPlace): JsonObject {
  const whole = storyboard(p, () => true);
  return estimateTokens(JSON.stringify(whole)) <= STORYBOARD_TOKEN_BUDGET
    ? whole
    : storyboard(p, (s) => s === scene);
}
