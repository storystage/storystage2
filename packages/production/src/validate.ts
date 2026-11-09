/**
 * WP8.4: the shape of each JSON part of a `.storystage` file, checked before anything loads
 * (`docs/spec/15-security.md`, section 3.3, F6). The program has its own schema (`packages/ast`);
 * this covers the manifest, scenes, storyboard and frames. `checkReferences` then checks that
 * they point at each other.
 *
 * A part of this format version, or an older one once migrated, may hold only the fields the
 * types name: nothing else can ride through a save. A newer file opens read-only, so its extra
 * fields are allowed (spec 03, section 1.2: a minor version adds what an older reader can skip).
 */
import { validateManifest as validateBackstage, MANIFEST_VERSION } from '@storystage/backstage';
import { SHOT_TYPES, STORY_CLASSES } from '@storystage/story-api';

export interface ShapeOptions {
  /** True for a newer file, opened read-only: fields this version doesn't know are allowed. */
  readonly allowExtra?: boolean;
}

/**
 * Lengths for the learner's own words that format 1.1.0 added (spec 07, section 6.9). The screens
 * keep to them; a file over them, edited by hand, is refused when it opens.
 */
export const TEXT_LIMITS = {
  /** One scene's retake notes. */
  retakeNotes: 200,
  /** One name in the end credits. */
  creditName: 40,
  /** How many names the end credits hold. */
  creditNames: 40,
} as const;

type Json = Record<string, unknown>;

/** Collects problems with paths, for developers ("frames/f1.json: sketches[0].x: a number"). */
class Shape {
  readonly problems: string[] = [];
  private readonly where: string;
  private readonly options: ShapeOptions;
  constructor(where: string, options: ShapeOptions) {
    this.where = where;
    this.options = options;
  }

  private add(path: string, what: string) {
    this.problems.push(`${this.where}: ${path || '(top)'}: ${what}`);
  }

  object(
    v: unknown,
    path: string,
    keys: readonly string[],
    optional: readonly string[] = [],
  ): v is Json {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      this.add(path, 'should be an object');
      return false;
    }
    for (const k of keys) if (!(k in v)) this.add(path, `is missing ${k}`);
    if (!this.options.allowExtra) {
      const known = new Set([...keys, ...optional]);
      for (const k of Object.keys(v))
        if (!known.has(k)) this.add(path, `has an unknown field ${k}`);
    }
    return true;
  }

  string(v: unknown, path: string, max = Infinity): v is string {
    if (typeof v !== 'string') {
      this.add(path, 'should be text');
      return false;
    }
    if ([...v].length <= max) return true;
    this.add(path, `should be at most ${max} characters`);
    return false;
  }

  number(v: unknown, path: string, min = -Infinity, max = Infinity): v is number {
    if (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) return true;
    this.add(
      path,
      `should be a number${min > -Infinity ? ` from ${min}` : ''}${max < Infinity ? ` to ${max}` : ''}`,
    );
    return false;
  }

  boolean(v: unknown, path: string): v is boolean {
    if (typeof v === 'boolean') return true;
    this.add(path, 'should be true or false');
    return false;
  }

  oneOf(v: unknown, path: string, values: readonly string[]): boolean {
    if (typeof v === 'string' && values.includes(v)) return true;
    this.add(path, `should be one of ${values.join(', ')}`);
    return false;
  }

  stringOrNull(v: unknown, path: string) {
    if (v !== null) this.string(v, path);
  }

  array<T>(v: unknown, path: string, each: (item: unknown, path: string) => T): boolean {
    if (!Array.isArray(v)) {
      this.add(path, 'should be a list');
      return false;
    }
    v.forEach((item, i) => each(item, `${path}[${i}]`));
    return true;
  }

  fail(path: string, what: string) {
    this.add(path, what);
  }
}

const join = (path: string, key: string) => (path ? `${path}.${key}` : key);

function vec3(s: Shape, v: unknown, path: string) {
  if (s.object(v, path, ['x', 'y', 'z']))
    for (const k of ['x', 'y', 'z']) s.number(v[k], join(path, k));
}

function transform(s: Shape, v: unknown, path: string) {
  if (!s.object(v, path, ['position', 'rotation', 'scale'])) return;
  vec3(s, v.position, join(path, 'position'));
  vec3(s, v.scale, join(path, 'scale'));
  const r = v.rotation;
  const at = join(path, 'rotation');
  if (s.object(r, at, ['x', 'y', 'z', 'w']))
    for (const k of ['x', 'y', 'z', 'w']) s.number(r[k], join(at, k));
}

/** A Backstage id (text) or a stand-in (`{ standIn }`). */
/** The largest stand-in box, in metres on each side (format 1.2.0; S6's `StandIn.size`). */
export const STAND_IN_SIZE_MAX = 1000;

/** A Backstage id (text) or a stand-in (`{ standIn, size? }`). */
function modelRef(s: Shape, v: unknown, path: string) {
  if (typeof v === 'string') return;
  if (!s.object(v, path, ['standIn'], ['size'])) return;
  s.string(v.standIn, join(path, 'standIn'));
  if (v.size === undefined) return;
  const at = join(path, 'size');
  if (s.object(v.size, at, ['x', 'y', 'z']))
    for (const k of ['x', 'y', 'z'] as const) {
      const n = v.size[k];
      if (s.number(n, join(at, k), 0, STAND_IN_SIZE_MAX) && n === 0)
        s.fail(join(at, k), 'should be more than 0');
    }
}

function transition(s: Shape, v: unknown, path: string) {
  if (!s.object(v, path, ['kind', 'duration'])) return;
  s.oneOf(v.kind, join(path, 'kind'), ['cut', 'fadeToBlack', 'crossfade']);
  s.number(v.duration, join(path, 'duration'), 0);
}

/** `manifest.json`. */
export function checkManifestShape(v: unknown, options: ShapeOptions = {}): string[] {
  const s = new Shape('manifest.json', options);
  const keys = [
    'format',
    'formatVersion',
    'createdWith',
    'title',
    'origin',
    'runningOrder',
    'audio',
    'models',
  ];
  if (!s.object(v, '', keys, ['credits'])) return s.problems;
  if (v.credits !== undefined && s.object(v.credits, 'credits', ['names'])) {
    const names = v.credits.names;
    if (s.array(names, 'credits.names', (n, p) => s.string(n, p, TEXT_LIMITS.creditName)))
      if ((names as unknown[]).length > TEXT_LIMITS.creditNames)
        s.fail('credits.names', `should hold at most ${TEXT_LIMITS.creditNames} names`);
  }
  if (v.format !== 'storystage') s.fail('format', 'should be storystage');
  s.string(v.formatVersion, 'formatVersion');
  if (s.object(v.createdWith, 'createdWith', ['app', 'version'])) {
    if (v.createdWith.app !== 'StoryStage') s.fail('createdWith.app', 'should be StoryStage');
    s.string(v.createdWith.version, 'createdWith.version');
  }
  s.string(v.title, 'title');
  s.oneOf(v.origin, 'origin', ['storystage', 'alice']);
  s.array(v.runningOrder, 'runningOrder', (e, p) => {
    if (!s.object(e, p, ['scene', 'transition'])) return;
    s.string(e.scene, join(p, 'scene'));
    transition(s, e.transition, join(p, 'transition'));
  });
  s.array(v.audio, 'audio', (e, p) => {
    if (!s.object(e, p, ['file', 'scene', 'label'])) return;
    s.string(e.file, join(p, 'file'));
    s.stringOrNull(e.scene, join(p, 'scene'));
    s.string(e.label, join(p, 'label'));
  });
  s.array(v.models, 'models', (e, p) => {
    if (!s.object(e, p, ['folder', 'item'])) return;
    s.string(e.folder, join(p, 'folder'));
    // A packed model's record is a Backstage item, checked by Backstage's own rules.
    const checked = validateBackstage({ manifestVersion: MANIFEST_VERSION, items: [e.item] });
    if (!checked.ok) for (const problem of checked.errors) s.fail(join(p, 'item'), problem);
  });
  return s.problems;
}

/** `scenes/<id>.json`: a `Scene`, with its `SceneSetup`. */
export function checkSceneShape(v: unknown, where: string, options: ShapeOptions = {}): string[] {
  const s = new Shape(where, options);
  if (!s.object(v, '', ['id', 'setup', 'method'])) return s.problems;
  s.string(v.id, 'id');
  s.string(v.method, 'method');
  const setup = v.setup;
  if (!s.object(setup, 'setup', ['backdrop', 'objects', 'camera', 'markers'])) return s.problems;
  const b = setup.backdrop;
  if (s.object(b, 'setup.backdrop', [], ['ground', 'sky', 'lighting', 'fog'])) {
    for (const k of ['ground', 'sky', 'lighting'] as const)
      if (b[k] !== undefined) s.string(b[k], `setup.backdrop.${k}`);
    if (b.fog !== undefined) s.number(b.fog, 'setup.backdrop.fog', 0, 1);
  }
  s.array(setup.objects, 'setup.objects', (o, p) => {
    if (!s.object(o, p, ['id', 'model', 'class', 'transform'], ['opacity', 'paint', 'vehicle']))
      return;
    s.string(o.id, join(p, 'id'));
    modelRef(s, o.model, join(p, 'model'));
    s.oneOf(o.class, join(p, 'class'), STORY_CLASSES);
    transform(s, o.transform, join(p, 'transform'));
    if (o.opacity !== undefined) s.number(o.opacity, join(p, 'opacity'), 0, 1);
    if (o.paint !== undefined) s.string(o.paint, join(p, 'paint'));
    if (o.vehicle !== undefined) s.stringOrNull(o.vehicle, join(p, 'vehicle'));
  });
  if (s.object(setup.camera, 'setup.camera', ['transform'], ['fieldOfViewDegrees'])) {
    transform(s, setup.camera.transform, 'setup.camera.transform');
    if (setup.camera.fieldOfViewDegrees !== undefined)
      s.number(setup.camera.fieldOfViewDegrees, 'setup.camera.fieldOfViewDegrees', 1, 179);
  }
  s.array(setup.markers, 'setup.markers', (m, p) => {
    if (!s.object(m, p, ['id', 'transform'])) return;
    s.string(m.id, join(p, 'id'));
    transform(s, m.transform, join(p, 'transform'));
  });
  return s.problems;
}

/** `storyboard.json`. */
export function checkStoryboardShape(v: unknown, options: ShapeOptions = {}): string[] {
  const s = new Shape('storyboard.json', options);
  if (!s.object(v, '', ['logline', 'synopsis', 'arc', 'cards'])) return s.problems;
  s.string(v.logline, 'logline');
  s.string(v.synopsis, 'synopsis');
  if (s.object(v.arc, 'arc', ['template', 'parts'])) {
    const t = v.arc.template;
    if (typeof t === 'string') s.oneOf(t, 'arc.template', ['free', 'threePart', 'fivePart']);
    else if (s.object(t, 'arc.template', ['curriculum']))
      s.string(t.curriculum, 'arc.template.curriculum');
    s.array(v.arc.parts, 'arc.parts', (part, p) => s.string(part, p));
  }
  s.array(v.cards, 'cards', (c, p) => {
    if (!s.object(c, p, ['id', 'heading', 'cast', 'arcPart'], ['retakeNotes'])) return;
    if (c.retakeNotes !== undefined)
      s.string(c.retakeNotes, join(p, 'retakeNotes'), TEXT_LIMITS.retakeNotes);
    s.string(c.id, join(p, 'id'));
    s.string(c.heading, join(p, 'heading'));
    s.array(c.cast, join(p, 'cast'), (m, q) => modelRef(s, m, q));
    s.stringOrNull(c.arcPart, join(p, 'arcPart'));
  });
  return s.problems;
}

const FACINGS = ['front', 'threeQuarter', 'side', 'back'] as const;

/** `frames/<id>.json`. */
export function checkFrameShape(v: unknown, where: string, options: ShapeOptions = {}): string[] {
  const s = new Shape(where, options);
  const keys = ['id', 'scene', 'order', 'caption', 'shot', 'lengthSeconds', 'sketches', 'links'];
  if (!s.object(v, '', keys)) return s.problems;
  s.string(v.id, 'id');
  s.string(v.scene, 'scene');
  s.number(v.order, 'order', 0);
  s.string(v.caption, 'caption');
  s.oneOf(v.shot, 'shot', SHOT_TYPES);
  s.number(v.lengthSeconds, 'lengthSeconds', 0);
  s.array(v.sketches, 'sketches', (k, p) => {
    const keys = ['id', 'item', 'facing', 'pose', 'x', 'y', 'scale', 'flipped', 'layer'];
    if (!s.object(k, p, keys)) return;
    s.string(k.id, join(p, 'id'));
    modelRef(s, k.item, join(p, 'item'));
    s.oneOf(k.facing, join(p, 'facing'), FACINGS);
    s.stringOrNull(k.pose, join(p, 'pose'));
    for (const n of ['x', 'y', 'scale', 'layer'] as const) s.number(k[n], join(p, n));
    s.boolean(k.flipped, join(p, 'flipped'));
  });
  s.array(v.links, 'links', (l, p) => s.string(l, p));
  return s.problems;
}
