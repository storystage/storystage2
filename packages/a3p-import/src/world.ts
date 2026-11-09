/**
 * An Alice world's scene, objects and start (spec 19, sections 3 and 4; decision 0069).
 *
 * From the decoded graph: which type is the scene; each scene field's object, with its Story API
 * class and its model from Backstage, or a labelled stand-in; the camera, markers and ground; and
 * `performGeneratedSetUp`'s calls turned into the scene's set-up. Calls the set-up can't hold are
 * handed back to be kept as code (`asCode`). Alice's world turns half a turn about Y on the way
 * in, so its forward (-Z) is StoryStage's (+Z).
 */
import {
  CLASS_MAP,
  ENUMS,
  IDENTITY,
  STORY_CLASSES,
  type BackstageId,
  type Quat,
  type SceneObjectSetup,
  type SceneSetup,
  type StoryClass,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import { listProp, nodeProp, textProp, type AliceNode, type AliceValue } from './decode.ts';
import { words, type ImportGap } from './gaps.ts';
import { SIMS2_MODELS } from './sims.ts';

export interface WorldOptions {
  /** Backstage's id for an Alice gallery key (`Prop/MangoTree`) and variant, or null. */
  readonly findModel?: (key: string, variant: string) => BackstageId | null;
  /** A Backstage model's height at scale 1, in metres (`defaultSize.height`). */
  readonly modelHeight?: (id: BackstageId) => number | null;
  /** Backstage's ground for each of Alice's `SurfaceAppearance` names (`ALICE_GROUNDS`). */
  readonly grounds?: Readonly<Record<string, BackstageId>>;
}

/** A scene field: an object, the camera, the ground or a marker. */
export interface WorldField {
  readonly name: string;
  readonly alice: AliceNode;
  /** The Story API class its Alice class becomes. */
  readonly storyClass: StoryClass;
  /** The learner's own class, kept (decision 0069, 1), or null for the Story API class. */
  readonly keptClass: AliceNode | null;
}

export interface WorldSetUp {
  readonly sceneName: string;
  readonly sceneType: AliceNode;
  readonly setup: SceneSetup;
  readonly fields: readonly WorldField[];
  /** Calls from Alice's set-up that the set-up can't hold, to keep as code (spec 19, 4.4). */
  readonly asCode: readonly AliceNode[];
  /** Alice's size, in metres, for each object whose model has no size to scale by yet. */
  readonly sizes: ReadonlyMap<string, Vec3>;
  readonly gaps: readonly ImportGap[];
}

const STORY = 'org.lgna.story.';

const simpleName = (javaName: string) => javaName.slice(javaName.lastIndexOf('.') + 1);

/** The Alice class a type is, or ends in: `SBiped` for `class Alice extends SBiped`. */
export function aliceClassOf(type: AliceNode | null): string | null {
  for (let t = type; t; t = nodeProp(t, 'superType')) {
    if (t.java?.kind === 'type') return simpleName(t.java.name);
    if (t.type !== 'NamedUserType') return null;
  }
  return null;
}

/** Whether the learner wrote anything in a type: a method or field Alice didn't generate. */
export const isLearnerMade = (type: AliceNode): boolean =>
  [...listProp(type, 'methods'), ...listProp(type, 'fields')].some(
    (m) => textProp(m, 'managementLevel') === 'NONE' && !isResourceSetter(m),
  );

/** Half a turn about Y (spec 19, 4.5): Alice's forward is -Z, StoryStage's is +Z. */
export const turnPosition = (p: Vec3): Vec3 => ({ x: negate(p.x), y: p.y, z: negate(p.z) });
/** `h q h⁻¹` for the half turn `h`: the axis turns with the world, the angle stays. */
export const turnRotation = (q: Quat): Quat => ({ x: negate(q.x), y: q.y, z: negate(q.z), w: q.w });
/** `-v`, but never `-0`, which a saved file can't keep: what's imported is what's saved. */
function negate(v: number): number {
  return v === 0 ? 0 : -v;
}

/** The numbers an Alice value object is made from: `new Position(1, 0, 2)`. */
function numbersOf(e: AliceNode | null, javaClass: string): number[] | null {
  if (!e || e.type !== 'InstanceCreation') return null;
  const constructor = nodeProp(e, 'constructor');
  if (
    constructor?.java?.kind !== 'constructor' ||
    constructor.java.declaringClass !== STORY + javaClass
  )
    return null;
  const values = listProp(e, 'requiredArguments').map((a) => numberOf(nodeProp(a, 'expression')));
  return values.every((v): v is number => v !== null) ? values : null;
}

function numberOf(e: AliceNode | null): number | null {
  if (!e) return null;
  const v: AliceValue | undefined = e.props['value'];
  if ((e.type === 'DoubleLiteral' || e.type === 'IntegerLiteral') && typeof v === 'number')
    return v;
  return null;
}

/** A colour: `Color.RED` is `red`, `new Color(r, g, b)` is `#rrggbb`. */
function paintOf(e: AliceNode | null): string | null {
  if (!e) return null;
  const field = e.type === 'FieldAccess' ? nodeProp(e, 'field') : null;
  if (field?.java?.kind === 'field' && field.java.declaringClass === STORY + 'Color') {
    const name = field.java.name.toLowerCase();
    return (ENUMS.Color as readonly string[]).includes(name) ? name : null;
  }
  const rgb = numbersOf(e, 'Color');
  if (rgb && rgb.length >= 3) {
    const hex = rgb
      .slice(0, 3)
      .map((c) =>
        Math.round(Math.min(1, Math.max(0, c)) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
    return `#${hex}`;
  }
  return null;
}

/** An Alice enum value by name: `SurfaceAppearance.MOON` is `MOON`. */
function enumName(e: AliceNode | null): string | null {
  const field = e?.type === 'FieldAccess' ? nodeProp(e, 'field') : null;
  return field?.java?.kind === 'field' ? field.java.name : null;
}

/** A gallery resource named in a list of arguments: `MangoTreeResource.DEFAULT`. */
function resourceIn(
  args: readonly AliceNode[],
): { key: string; name: string; variant: string } | null {
  for (const argument of args) {
    const field = nodeProp(nodeProp(argument, 'expression') ?? argument, 'field');
    if (field?.java?.kind !== 'field') continue;
    const match = /^org\.lgna\.story\.resources\.([a-z]+)\.([A-Za-z0-9]+)Resource$/.exec(
      field.java.declaringClass,
    );
    if (!match) continue;
    const folder = match[1]!.charAt(0).toUpperCase() + match[1]!.slice(1);
    return { key: `${folder}/${match[2]}`, name: match[2]!, variant: field.java.name };
  }
  return null;
}

/**
 * The resource a gallery object is made from. Alice passes it where the object is created
 * (`new Alice(AliceResource.DEFAULT)`), or, from Alice 3.3, in its class's constructor
 * (`ZumaRock() { super(ZumaRockResource.DEFAULT) }`), so the constructors are followed up.
 */
function resourceOf(
  initializer: AliceNode | null,
): { key: string; name: string; variant: string } | null {
  if (!initializer || initializer.type !== 'InstanceCreation') return null;
  const direct = resourceIn(listProp(initializer, 'requiredArguments'));
  if (direct) return direct;
  const seen = new Set<AliceNode>();
  for (
    let constructor = nodeProp(initializer, 'constructor');
    constructor && !seen.has(constructor);
    constructor = nodeProp(
      nodeProp(nodeProp(constructor, 'body') ?? constructor, 'constructorInvocationStatement') ??
        constructor,
      'constructor',
    )
  ) {
    seen.add(constructor);
    const invocation = nodeProp(
      nodeProp(constructor, 'body') ?? constructor,
      'constructorInvocationStatement',
    );
    if (!invocation) return null;
    const found = resourceIn(listProp(invocation, 'requiredArguments'));
    if (found) return found;
  }
  return null;
}

/**
 * Alice's way to change a gallery model's variant: a `set…Resource` method that only calls
 * `setJointedModelResource`. The starter projects mark it as the learner's, but it's Alice's.
 */
function isResourceSetter(member: AliceNode): boolean {
  if (member.type !== 'UserMethod' || !/^set\w+Resource$/.test(textProp(member, 'name') ?? ''))
    return false;
  const statements = listProp(nodeProp(member, 'body') ?? member, 'statements');
  return statements.every((s) => {
    const method = nodeProp(nodeProp(s, 'expression') ?? s, 'method');
    return method?.java?.kind === 'method' && method.java.name === 'setJointedModelResource';
  });
}

interface ObjectState {
  vehicle: string | null;
  position: Vec3 | null;
  rotation: Quat | null;
  size: Vec3 | null;
  paint: string | null;
  opacity: number | null;
}

/** The scene, its objects and its start, from Alice's decoded `Program`. */
export function importSetUp(program: AliceNode, options: WorldOptions = {}): WorldSetUp {
  const gaps: ImportGap[] = [];
  const gap = (g: ImportGap) => gaps.push(g);

  const sceneField = listProp(program, 'fields').find(
    (f) => aliceClassOf(nodeProp(f, 'valueType')) === 'SScene',
  );
  const sceneType = sceneField ? nodeProp(sceneField, 'valueType') : null;
  if (!sceneType) throw new Error('An Alice world without a scene');
  const sceneName = textProp(sceneType, 'name') ?? 'Scene';
  const where = `${sceneName}, set-up`;

  // ---- Fields ----
  const fields: WorldField[] = [];
  const objects = new Map<string, { field: WorldField; model: SceneObjectSetup['model'] }>();
  const markerNames = new Set<string>();
  /** Models already reported: the report names each once (spec 19, 4.2). */
  const reported = new Set<string>();
  let cameraName: string | null = null;
  let groundName: string | null = null;

  for (const f of listProp(sceneType, 'fields')) {
    const name = textProp(f, 'name') ?? '';
    const type = nodeProp(f, 'valueType');
    const aliceClass = aliceClassOf(type);
    const apiClass = aliceClass ? CLASS_MAP[aliceClass] : undefined;
    if (apiClass === 'Camera') cameraName = name;
    else if (apiClass === 'Ground') groundName = name;
    else if (apiClass === 'Marker') {
      markerNames.add(name);
      continue;
    }
    if (!apiClass || !(STORY_CLASSES as readonly string[]).includes(apiClass)) {
      gap({
        kind: 'class',
        what: `${words(name)}, Alice's ${aliceClass ?? 'unknown thing'}`,
        where,
        why: 'StoryStage has no kind of object like it, so it was left out.',
      });
      continue;
    }
    const storyClass = apiClass as StoryClass;
    const keptClass = type?.type === 'NamedUserType' && isLearnerMade(type) ? type : null;
    const field: WorldField = { name, alice: f, storyClass, keptClass };
    fields.push(field);
    if (storyClass === 'Camera' || storyClass === 'Ground' || storyClass === 'Scene') continue;

    // The object's model: Backstage's, or a labelled stand-in (decision 0069, 3).
    const resource = resourceOf(nodeProp(f, 'initializer'));
    const shape =
      aliceClass && CLASS_MAP[aliceClass] === 'Prop' && !resource ? aliceClass.slice(1) : null;
    const key = resource?.key ?? (shape ? `Prop/${shape}` : null);
    const label = words(resource?.name ?? shape ?? name);
    const found = key ? (options.findModel?.(key, resource?.variant ?? 'DEFAULT') ?? null) : null;
    if (!found && !reported.has(key ?? label)) {
      reported.add(key ?? label);
      gap({
        kind: 'model',
        what: `the ${label}`,
        where,
        why:
          key && SIMS2_MODELS.has(key)
            ? 'It’s one of the Sims 2 models in Alice’s gallery, which StoryStage will never have, so a labelled stand-in takes its place.'
            : 'Backstage doesn’t have this model yet, so a labelled stand-in takes its place until it does.',
      });
    }
    objects.set(name, {
      field,
      model: found ?? { standIn: label.charAt(0).toUpperCase() + label.slice(1) },
    });
  }

  // ---- performGeneratedSetUp ----
  const state = new Map<string, ObjectState>();
  const markers = new Map<string, ObjectState>();
  const stateIn = (map: Map<string, ObjectState>, name: string) => {
    let s = map.get(name);
    if (!s) {
      s = { vehicle: null, position: null, rotation: null, size: null, paint: null, opacity: null };
      map.set(name, s);
    }
    return s;
  };
  const asCode: AliceNode[] = [];
  let groundAppearance: string | null = null;

  const setUp = listProp(sceneType, 'methods').find(
    (m) => textProp(m, 'name') === 'performGeneratedSetUp',
  );
  const statements = setUp ? listProp(nodeProp(setUp, 'body')!, 'statements') : [];
  for (const statement of statements) {
    const call =
      statement.type === 'ExpressionStatement' ? nodeProp(statement, 'expression') : null;
    const method = call?.type === 'MethodInvocation' ? nodeProp(call, 'method') : null;
    // Alice's own "DO NOT EDIT" note on its generated method isn't the learner's.
    if (statement.type === 'Comment') continue;
    if (!call || method?.java?.kind !== 'method') {
      asCode.push(statement);
      continue;
    }
    const name = method.java.name;
    const target = nodeProp(call, 'expression');
    const onField =
      target?.type === 'FieldAccess' ? textProp(nodeProp(target, 'field') ?? target, 'name') : null;
    const onScene = target?.type === 'ThisExpression';
    const argument = (i: number) =>
      nodeProp(listProp(call, 'requiredArguments')[i] ?? call, 'expression');
    const isMarker = onField !== null && markerNames.has(onField);
    const s = onField ? stateIn(isMarker ? markers : state, onField) : null;

    if (name === 'setName') continue;
    if (s && name === 'setVehicle') {
      const v = argument(0);
      s.vehicle = v?.type === 'FieldAccess' ? textProp(nodeProp(v, 'field') ?? v, 'name') : null;
      continue;
    }
    if (s && name === 'setPositionRelativeToVehicle') {
      const p = numbersOf(argument(0), 'Position');
      if (p) {
        s.position = turnPosition({ x: p[0]!, y: p[1]!, z: p[2]! });
        continue;
      }
    }
    if (s && name === 'setOrientationRelativeToVehicle') {
      const q = numbersOf(argument(0), 'Orientation');
      if (q && q.length === 4) {
        s.rotation = turnRotation({ x: q[0]!, y: q[1]!, z: q[2]!, w: q[3]! });
        continue;
      }
    }
    if (s && name === 'setSize') {
      const z = numbersOf(argument(0), 'Size');
      if (z) {
        s.size = { x: z[0]!, y: z[1]!, z: z[2]! };
        continue;
      }
    }
    if (s && onField === groundName && name === 'setPaint') {
      groundAppearance = enumName(argument(0));
      continue;
    }
    if (s && onField === groundName && (name === 'setOpacity' || name === 'setVehicle')) {
      const opacity = numberOf(argument(0));
      if (name === 'setOpacity' && opacity !== null && opacity !== 1)
        gap({
          kind: 'setUp',
          what: 'the ground’s opacity',
          where,
          why: 'The ground is always solid in StoryStage.',
        });
      continue;
    }
    if (s && name === 'setPaint') {
      const paint = paintOf(argument(0));
      if (paint) {
        s.paint = paint;
        continue;
      }
    }
    if (s && name === 'setOpacity') {
      const opacity = numberOf(argument(0));
      if (opacity !== null) {
        s.opacity = opacity;
        continue;
      }
    }
    if (isMarker && name === 'setColorId') continue;
    // The scene's sky, light and fog are blocks at the start of the script (spec 19, 4.4).
    if (onScene) {
      asCode.push(statement);
      continue;
    }
    asCode.push(statement);
    gap({
      kind: 'setUp',
      what: `${onField ? words(onField) : onScene ? 'the scene' : 'a joint or part'}: Alice's ${name}`,
      where,
      why: 'The scene’s set-up can’t hold it, so it’s a block at the start of the scene instead.',
    });
  }

  // ---- The set-up ----
  const transformOf = (s: ObjectState | undefined, scale: Vec3 = IDENTITY.scale): Transform => ({
    position: s?.position ?? IDENTITY.position,
    rotation: s?.rotation ?? IDENTITY.rotation,
    scale,
  });

  const objectSetups: SceneObjectSetup[] = [];
  const unsized = new Map<string, Vec3>();
  for (const [name, { field, model }] of objects) {
    const s = state.get(name);
    let scale: Vec3 = IDENTITY.scale;
    if (s?.size) {
      const height = typeof model === 'string' ? (options.modelHeight?.(model) ?? null) : null;
      if (height && height > 0) {
        // One scale, from the height (S4: `defaultSize` is the height only).
        const k = s.size.y / height;
        scale = { x: k, y: k, z: k };
      } else {
        unsized.set(name, s.size);
      }
    }
    const vehicle =
      s?.vehicle && s.vehicle !== groundName && objects.has(s.vehicle) ? s.vehicle : null;
    objectSetups.push({
      id: name as SceneObjectSetup['id'],
      model,
      class: field.storyClass,
      transform: transformOf(s, scale),
      ...(s?.opacity !== null && s?.opacity !== undefined && s.opacity !== 1
        ? { opacity: s.opacity }
        : {}),
      ...(s?.paint ? { paint: s.paint } : {}),
      ...(vehicle ? { vehicle: vehicle as SceneObjectSetup['id'] } : {}),
    });
  }

  // A stand-in has no size of its own yet (spec 19, "Needs": `StandIn.size`), so each Alice size
  // is kept in `sizes` for then, and reported once.
  if (unsized.size > 0)
    gap({
      kind: 'setUp',
      what: unsized.size === 1 ? 'one object’s size' : `${unsized.size} objects’ sizes`,
      where,
      why: 'Their models aren’t in Backstage yet, so they start at their usual size; their sizes in Alice are kept for when the models arrive.',
    });

  const ground = groundAppearance ? options.grounds?.[groundAppearance] : undefined;
  if (groundAppearance && !ground)
    gap({
      kind: 'setUp',
      what: `the ground, ${words(groundAppearance)}`,
      where,
      why: 'Backstage doesn’t have this ground yet, so the scene has the usual ground.',
    });

  const setup: SceneSetup = {
    backdrop: ground ? { ground } : {},
    objects: objectSetups,
    camera: { transform: transformOf(cameraName ? state.get(cameraName) : undefined) },
    markers: [...markers].map(([id, s]) => ({ id, transform: transformOf(s) })),
  };
  return { sceneName, sceneType, setup, fields, asCode, sizes: unsized, gaps };
}
