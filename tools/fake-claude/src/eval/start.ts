/**
 * Opens an evaluation start (`docs/eval/productions/*.json`) as a real production, the way a
 * learner's film would be when the request is made (`docs/eval/README.md`, "Running a request").
 * The JSON form came before the `.storystage` format; this builds the same film with the
 * production's own steps (`addScene`, `addObject`), so the Prompter sees what it would in the
 * studio. Ids come from a fixed seed, so every run starts from the same film.
 */
import {
  idMinter,
  indexProgram,
  newProgram,
  type EditOperation,
  type Expression,
  type NodeId,
  type Statement,
  type TypeDecl,
} from '@storystage/ast';
import type { BackstageItem } from '@storystage/backstage';
import {
  FORMAT_VERSION,
  addObject,
  addScene,
  applyProgramEdits,
  frameId,
  lineId,
  type Frame,
  type PackedModel,
  type Production,
  type SceneId,
} from '@storystage/production';
import { toValue, type Json, type SceneObjects } from '@storystage/prompter';
import {
  classOfType,
  findEntry,
  type ApiClass,
  type BackstageId,
  type StandIn,
  type StoryClass,
} from '@storystage/story-api';
import type { EvalProduction } from '../eval.ts';

/** The film, the scene the request is made in, and each frame's saved check (11.6). */
export interface OpenedStart {
  readonly production: Production;
  /** `""` for a film with no scenes yet, such as a blank story. */
  readonly scene: SceneId;
  readonly checks: ReadonlyMap<string, Json>;
}

type Item = BackstageId | StandIn;
type StartScene = NonNullable<EvalProduction['scenes']>[number] & {
  readonly cast?: readonly Item[];
  readonly arcPart?: string | null;
};
type StartObject = EvalProduction['objects'][number];

/** A fixed sequence, so node ids are the same on every run (mulberry32). */
export function seeded(seed = 13): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const IDENTITY = { x: 0, y: 0, z: 0, w: 1 };
const ONE = { x: 1, y: 1, z: 1 };
const same = (a: Item | string, b: Item | string) => JSON.stringify(a) === JSON.stringify(b);

/** A class-imported model, so a name the class chose reaches the Prompter as the studio's would. */
function imported(id: string, cls: StoryClass, displayName: string): PackedModel {
  const item: BackstageItem = {
    id: id as BackstageId,
    section: 'props',
    class: cls,
    displayName,
    themes: [],
    files: { model: 'model.glb', thumbnail: 'thumbnail.webp' },
    joints: 'prop-only',
    defaultSize: { height: 1 },
    budget: { triangles: 1000, textureMaxPx: 0 },
    licence: 'CC0-1.0',
    credit: 'Evaluation start',
    origin: 'imported',
    sketches: [],
  };
  return { folder: id.toLowerCase().replace(/[^a-z0-9]+/g, '-'), item };
}

function emptyFilm(title: string, random: () => number): Production {
  return {
    manifest: {
      format: 'storystage',
      formatVersion: FORMAT_VERSION,
      createdWith: { app: 'StoryStage', version: '0.0.0' },
      title,
      origin: 'storystage',
      runningOrder: [],
      audio: [],
      models: [],
    },
    program: { ...newProgram(random), types: [] },
    scenes: [],
    storyboard: {
      logline: '',
      synopsis: '',
      arc: { template: 'free', parts: [] },
      cards: [],
    },
    script: [],
    frames: [],
  };
}

/** Splits `a, "b, c", 2` at the commas outside quotes. */
function splitArgs(text: string): string[] {
  const out: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    if (ch === ',' && !quoted) {
      out.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** One line of a start's program: `// a comment`, or `object.procedure(arg, …)`. */
function statementFor(
  line: string,
  type: TypeDecl,
  classOf: (name: string) => ApiClass | null,
  mint: () => NodeId,
): Statement {
  const comment = /^\/\/\s?(.*)$/.exec(line);
  if (comment) return { id: mint(), kind: 'comment', text: comment[1]! };
  const call = /^(\w+)\.(\w+)\((.*)\)$/.exec(line);
  if (!call) throw new Error(`Can't read this start's line: ${line}`);
  const [, target, procedure, rest] = call as unknown as [string, string, string, string];
  const cls = classOf(target);
  const entry = cls ? findEntry(cls, procedure) : undefined;
  if (!cls || !entry || entry.kind !== 'procedure')
    throw new Error(`${target}.${procedure} isn't in the Story API.`);
  const scene: SceneObjects = {
    type,
    classOf: (field) => (field.type.kind === 'story' ? classOfType(field.type.name) : null),
  };
  const field = type.fields.find((f) => f.name === target)!;
  const args: Record<string, Expression> = {};
  splitArgs(rest).forEach((raw, i) => {
    const param = entry.params[i];
    if (!param) throw new Error(`${line}: too many arguments.`);
    const text = /^"(.*)"$/.exec(raw)?.[1] ?? raw;
    // Enum constants are written as Alice wrote them (`LEFT`); the Story API's are lower case.
    const value = /^[A-Z_]+$/.test(text) ? text.toLowerCase() : text;
    const converted = toValue(value, param.type, scene, mint);
    if (!converted.ok) throw new Error(`${line}: ${converted.message}`);
    args[param.name] = converted.expression;
  });
  return {
    id: mint(),
    kind: 'call',
    target: {
      id: mint(),
      kind: 'fieldRef',
      target: { id: mint(), kind: 'this' },
      field: field.id,
    },
    callee: { kind: 'story', name: procedure },
    args,
    details: {},
  };
}

/** The scene a request is made in: the scene of a frame it names, else the first with frames. */
function sceneFor(start: EvalProduction, request: string): string | undefined {
  const named = /\bf\d+-\d+\b/.exec(request)?.[0];
  const frame = start.frames?.find((f) => f.id === named) ?? start.frames?.[0];
  return frame?.scene ?? start.scenes?.[0]?.id;
}

export function openStart(start: EvalProduction, request = ''): OpenedStart {
  const random = seeded();
  let p = emptyFilm(start.title, random);
  const story = start.storyboard as
    (EvalProduction['storyboard'] & { arc?: Production['storyboard']['arc'] }) | undefined;

  // Scenes need a logline and synopsis first (10.1): give them for the steps, then the start's own.
  const scenes: readonly StartScene[] = (start.scenes as readonly StartScene[] | undefined) ?? [
    { id: 's1', heading: start.title },
  ];
  const ids = new Map<string, SceneId>();
  for (const scene of scenes) {
    const ready = { ...p, storyboard: { ...p.storyboard, logline: 'x', synopsis: 'x' } };
    const added = addScene(ready, { heading: scene.heading, label: 'Add scene' }, random);
    if (!added.ok) throw new Error(`Can't add scene ${scene.id}.`);
    p = { ...added.step.production, storyboard: { ...added.step.production.storyboard } };
    ids.set(scene.id, p.scenes.at(-1)!.id);
  }
  p = {
    ...p,
    storyboard: {
      ...p.storyboard,
      logline: story?.logline ?? '',
      synopsis: story?.synopsis ?? '',
      arc: story?.arc ?? p.storyboard.arc,
      cards: p.storyboard.cards.map((card) => {
        const own = scenes.find((s) => ids.get(s.id) === card.id);
        return { ...card, cast: [...(own?.cast ?? [])], arcPart: own?.arcPart ?? null };
      }),
    },
  };

  // Objects go in each scene whose cast has them, or in every scene if no cast names them.
  const named = (
    start as { imported?: readonly { id: string; class: StoryClass; displayName: string }[] }
  ).imported;
  const models: PackedModel[] = (named ?? []).map((m) => imported(m.id, m.class, m.displayName));
  const inCast = (o: StartObject) => scenes.some((s) => s.cast?.some((c) => same(c, o.item)));
  for (const object of start.objects) {
    let model: Item = object.item as BackstageId;
    if (object.displayName) {
      const packed = imported(
        `class/${object.class}/${object.name}`,
        object.class,
        object.displayName,
      );
      models.push(packed);
      model = packed.item.id;
    }
    for (const scene of scenes) {
      if (inCast(object) && !scene.cast?.some((c) => same(c, object.item))) continue;
      const added = addObject(
        p,
        ids.get(scene.id)!,
        {
          model,
          class: object.class,
          name: object.name,
          transform: { position: object.position, rotation: IDENTITY, scale: ONE },
        },
        `Add ${object.name}`,
        random,
      );
      if (!added.ok) throw new Error(`Can't add ${object.name}.`);
      p = added.step.production;
    }
  }
  p = { ...p, manifest: { ...p.manifest, models } };

  // The program's lines go in the request's scene's method.
  const current = ids.get(sceneFor(start, request) ?? '') ?? p.scenes[0]?.id ?? ('' as SceneId);
  if (start.program.length > 0) {
    const scene = p.scenes.find((s) => s.id === current)!;
    const index = indexProgram(p.program);
    const type = index.get(index.get(scene.method)!.parent!)!.node as TypeDecl;
    const classOf = (name: string) => {
      const field = type.fields.find((f) => f.name === name);
      return field?.type.kind === 'story' ? classOfType(field.type.name) : null;
    };
    const mint = idMinter(p.program, random);
    const edits: EditOperation[] = start.program.map((line, i) => ({
      kind: 'insert',
      label: 'Start',
      parent: scene.method,
      slot: 'body',
      index: i,
      node: statementFor(line, type, classOf, mint),
    }));
    const applied = applyProgramEdits(p, edits);
    if ('code' in applied) throw new Error(`The start's program can't be built: ${applied.code}.`);
    p = { ...p, program: applied.program };
  }

  // The script and the frames, with the scenes' new ids.
  const frames: Frame[] = (start.frames ?? []).map((f) => {
    const full = f as typeof f & {
      order?: number;
      lengthSeconds?: number;
      sketches?: readonly { id: string; item: Item; facing: string; x: number; y: number }[];
    };
    return {
      id: frameId(f.id),
      scene: ids.get(f.scene)!,
      order: full.order ?? 0,
      caption: f.caption,
      shot: f.shot,
      lengthSeconds: full.lengthSeconds ?? 3,
      sketches: (full.sketches ?? []).map((k) => ({
        id: k.id,
        item: k.item,
        facing: k.facing as Frame['sketches'][number]['facing'],
        pose: null,
        x: k.x,
        y: k.y,
        scale: 1,
        flipped: false,
        layer: 0,
      })),
      links: [],
    };
  });
  const script = (start.script ?? []).map((l) => {
    const full = l as typeof l & { kind?: 'action' | 'dialogue'; character?: string | null };
    return {
      id: lineId(l.id),
      scene: ids.get(l.scene)!,
      kind: full.kind ?? 'action',
      character: full.character ?? null,
      text: l.text,
      pinnedFrame: l.pinnedFrame === null ? null : frameId(l.pinnedFrame),
    };
  });
  p = { ...p, frames, script };

  const saved = (start as { checkResults?: Readonly<Record<string, readonly string[]>> })
    .checkResults;
  const checks = new Map<string, Json>(
    Object.entries(saved ?? {}).map(([frame, flags]) => [frame, { flags: [...flags] }]),
  );
  return { production: p, scene: current, checks };
}
