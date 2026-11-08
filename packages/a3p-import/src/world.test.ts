import { backstageId, type Quat, type Vec3 } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { AliceNode, AliceValue } from './decode.ts';
import { importSetUp, turnPosition, turnRotation } from './world.ts';

// Spec 19, sections 3 and 4, on small decoded worlds built in Alice's shapes.

const n = (type: string, props: Record<string, AliceValue> = {}, extra: Partial<AliceNode> = {}) =>
  ({ type, key: null, props, ...extra }) as AliceNode;
const javaType = (name: string) =>
  n('JavaType', {}, { java: { kind: 'type', name: `org.lgna.story.${name}` } });
const userType = (
  name: string,
  superType: AliceNode,
  more: { methods?: AliceNode[]; fields?: AliceNode[]; constructors?: AliceNode[] } = {},
) =>
  n('NamedUserType', {
    name,
    superType,
    methods: more.methods ?? [],
    fields: more.fields ?? [],
    constructors: more.constructors ?? [],
  });
const field = (name: string, valueType: AliceNode, initializer: AliceNode | null = null) =>
  n('UserField', { name, valueType, initializer, managementLevel: 'MANAGED' });
const method = (name: string, statements: AliceNode[], managementLevel = 'NONE') =>
  n('UserMethod', {
    name,
    managementLevel,
    body: n('BlockStatement', { statements }),
    requiredParameters: [],
  });
const arg = (expression: AliceNode) => n('SimpleArgument', { expression });
const javaMethod = (cls: string, name: string) =>
  n(
    'JavaMethod',
    {},
    {
      java: { kind: 'method', name, declaringClass: `org.lgna.story.${cls}`, parameters: [] },
    },
  );
const on = (f: AliceNode) => n('FieldAccess', { expression: n('ThisExpression'), field: f });
const call = (target: AliceNode, cls: string, name: string, ...args: AliceNode[]) =>
  n('ExpressionStatement', {
    expression: n('MethodInvocation', {
      expression: target,
      method: javaMethod(cls, name),
      requiredArguments: args.map(arg),
      keyedArguments: [],
    }),
    isEnabled: true,
  });
const make = (cls: string, ...values: number[]) =>
  n('InstanceCreation', {
    constructor: n(
      'JavaConstructor',
      {},
      {
        java: { kind: 'constructor', declaringClass: `org.lgna.story.${cls}`, parameters: [] },
      },
    ),
    requiredArguments: values.map((value) => arg(n('DoubleLiteral', { value }))),
  });
const resource = (folder: string, name: string, variant = 'DEFAULT') =>
  n('FieldAccess', {
    expression: n('TypeExpression'),
    field: n(
      'JavaField',
      {},
      {
        java: {
          kind: 'field',
          name: variant,
          declaringClass: `org.lgna.story.resources.${folder}.${name}Resource`,
        },
      },
    ),
  });
const constant = (cls: string, name: string) =>
  n('FieldAccess', {
    field: n(
      'JavaField',
      {},
      {
        java: { kind: 'field', name, declaringClass: `org.lgna.story.${cls}` },
      },
    ),
  });
/** `new X(resource)`, Alice before 3.3. */
const create = (_type: AliceNode, ...args: AliceNode[]) =>
  n('InstanceCreation', {
    constructor: n('NamedUserConstructor', {}),
    requiredArguments: args.map(arg),
  });

/** A world: Program holding a scene with these fields and this generated set-up. */
function world(fields: AliceNode[], setUp: AliceNode[], methods: AliceNode[] = []): AliceNode {
  const scene = userType('Scene', javaType('SScene'), {
    fields,
    methods: [method('performGeneratedSetUp', setUp, 'MANAGED'), ...methods],
  });
  return userType('Program', javaType('SProgram'), { fields: [field('myScene', scene)] });
}

const camera = field('camera', javaType('SCamera'));
const ground = field('ground', javaType('SGround'));
const catClass = userType('Cat', javaType('SQuadruped'));
const cat = field('cat', catClass, create(catClass, resource('quadruped', 'AbyssinianCat')));

const near = (a: Vec3 | Quat, b: Vec3 | Quat) =>
  Object.entries(b).forEach(([k, v]) =>
    expect((a as unknown as Record<string, number>)[k]).toBeCloseTo(v as number, 6),
  );

describe('importSetUp: objects and models (spec 19, 4.1–4.3)', () => {
  it('makes each gallery field an object of its Story API class, with Backstage’s model', () => {
    const w = importSetUp(world([camera, ground, cat], []), {
      findModel: (key) =>
        key === 'Quadruped/AbyssinianCat' ? backstageId('Quadruped/Cat/AbyssinianCat') : null,
    });
    expect(w.sceneName).toBe('Scene');
    expect(w.setup.objects).toEqual([
      expect.objectContaining({
        id: 'cat',
        class: 'Quadruped',
        model: 'Quadruped/Cat/AbyssinianCat',
      }),
    ]);
    expect(w.fields.map((f) => [f.name, f.storyClass, f.keptClass])).toEqual([
      ['camera', 'Camera', null],
      ['ground', 'Ground', null],
      ['cat', 'Quadruped', null],
    ]);
    expect(w.gaps).toEqual([]);
  });

  it('gives a model Backstage hasn’t got a labelled stand-in, reported once per model', () => {
    const cat2 = field('cat2', catClass, create(catClass, resource('quadruped', 'AbyssinianCat')));
    const w = importSetUp(world([cat, cat2], []));
    expect(w.setup.objects.map((o) => o.model)).toEqual([
      { standIn: 'Abyssinian cat' },
      { standIn: 'Abyssinian cat' },
    ]);
    expect(w.gaps).toEqual([
      expect.objectContaining({ kind: 'model', what: 'the abyssinian cat' }),
    ]);
  });

  it('finds the model in the class’s constructor, as Alice 3.3 writes it', () => {
    const superCall = n('SuperConstructorInvocationStatement', {
      constructor: n('NamedUserConstructor', {}),
      requiredArguments: [arg(resource('prop', 'ZumaRock'))],
    });
    const constructor = n('NamedUserConstructor', {
      body: n('ConstructorBlockStatement', { constructorInvocationStatement: superCall }),
    });
    const rockType = userType('ZumaRock', userType('Prop', javaType('SProp')));
    const rock = field(
      'rock',
      rockType,
      n('InstanceCreation', { constructor, requiredArguments: [] }),
    );
    const w = importSetUp(world([rock], []));
    expect(w.setup.objects[0]).toMatchObject({ class: 'Prop', model: { standIn: 'Zuma rock' } });
  });

  it('says a Sims 2 model will never come', () => {
    const glider = field(
      'glider',
      userType('HangGlider', javaType('STransport')),
      create(catClass, resource('aircraft', 'HangGlider')),
    );
    const w = importSetUp(world([glider], []));
    expect(w.gaps[0]?.why).toMatch(/Sims 2/);
  });

  it('keeps a class the learner wrote in, and lets an empty or resource-only one go (0069, 1)', () => {
    const resourceSetter = method('setCatResource', [
      call(
        n('ThisExpression'),
        'SJointedModel',
        'setJointedModelResource',
        resource('quadruped', 'AbyssinianCat'),
      ),
    ]);
    const plain = userType('Cat', javaType('SQuadruped'), { methods: [resourceSetter] });
    const own = userType('Dog', javaType('SQuadruped'), { methods: [method('wagTail', [])] });
    const w = importSetUp(
      world(
        [
          field('cat', plain, create(plain, resource('quadruped', 'AbyssinianCat'))),
          field('dog', own),
        ],
        [],
      ),
    );
    expect(w.fields.map((f) => [f.name, f.keptClass?.props['name'] ?? null])).toEqual([
      ['cat', null],
      ['dog', 'Dog'],
    ]);
  });

  it('leaves out, and reports, an object StoryStage has no kind of', () => {
    const sun = field('sun', javaType('SSun'));
    const w = importSetUp(world([sun], []));
    expect(w.setup.objects).toEqual([]);
    expect(w.gaps).toEqual([expect.objectContaining({ kind: 'class', what: "sun, Alice's SSun" })]);
  });
});

describe('importSetUp: the generated set-up (spec 19, 4.4)', () => {
  const setUp = [
    call(on(cat), 'SModel', 'setVehicle', on(ground)),
    call(on(cat), 'SMovableTurnable', 'setPositionRelativeToVehicle', make('Position', 1, 0, -2)),
    call(
      on(cat),
      'STurnable',
      'setOrientationRelativeToVehicle',
      make('Orientation', 0, 0.7071068, 0, 0.7071068),
    ),
    call(on(cat), 'SModel', 'setPaint', constant('Color', 'RED')),
    call(on(cat), 'SModel', 'setOpacity', n('DoubleLiteral', { value: 0.5 })),
    call(on(cat), 'SThing', 'setName', n('StringLiteral', { value: 'cat' })),
    call(on(camera), 'SMovableTurnable', 'setPositionRelativeToVehicle', make('Position', 0, 1, 8)),
    call(on(ground), 'SGround', 'setPaint', constant('SGround$SurfaceAppearance', 'MOON')),
    call(n('ThisExpression'), 'SScene', 'setAtmosphereColor', constant('Color', 'BLACK')),
    call(on(cat), 'SBiped', 'straightenOutJoints'),
  ];

  it('puts positions, turns, paint, opacity and the camera into the set-up', () => {
    const w = importSetUp(world([camera, ground, cat], setUp), {
      grounds: { MOON: backstageId('Ground/Moon') },
    });
    const [object] = w.setup.objects;
    near(object!.transform.position, { x: -1, y: 0, z: 2 });
    near(object!.transform.rotation, turnRotation({ x: 0, y: 0.7071068, z: 0, w: 0.7071068 }));
    expect(object).toMatchObject({ paint: 'red', opacity: 0.5 });
    // Riding on the ground is riding on the scene.
    expect(object!.vehicle).toBeUndefined();
    near(w.setup.camera.transform.position, { x: 0, y: 1, z: -8 });
    expect(w.setup.backdrop).toEqual({ ground: 'Ground/Moon' });
  });

  it('keeps the sky and anything else as code, and reports only what the set-up couldn’t hold', () => {
    const w = importSetUp(world([camera, ground, cat], setUp));
    expect(w.asCode.map((s) => (s.props['expression'] as AliceNode).props['method'])).toHaveLength(
      2,
    );
    const what = w.gaps.map((g) => g.what);
    expect(what).toContain("cat: Alice's straightenOutJoints");
    expect(what).toContain('the ground, moon');
    expect(what.some((x) => x.includes('setAtmosphereColor'))).toBe(false);
  });

  it('scales by Backstage’s height, else keeps Alice’s size for later and says so once', () => {
    const sized = [call(on(cat), 'SModel', 'setSize', make('Size', 0.5, 0.6, 1.2))];
    const withModel = importSetUp(world([cat], sized), {
      findModel: () => backstageId('Quadruped/Cat/AbyssinianCat'),
      modelHeight: () => 0.3,
    });
    near(withModel.setup.objects[0]!.transform.scale, { x: 2, y: 2, z: 2 });
    const standIn = importSetUp(world([cat], sized));
    expect(standIn.sizes.get('cat')).toEqual({ x: 0.5, y: 0.6, z: 1.2 });
    expect(standIn.gaps.filter((g) => g.what.includes('size'))).toHaveLength(1);
  });
});

describe('the half turn (spec 19, 4.5)', () => {
  it('keeps in front of the camera what was in front of it in Alice', () => {
    // Alice: the camera at z = 10 looks along -Z, at an object at the origin.
    const camera = turnPosition({ x: 0, y: 0, z: 10 });
    const object = turnPosition({ x: 0, y: 0, z: 0 });
    // StoryStage: the camera, unturned, looks along +Z, so the object must be at a larger z.
    expect(object.z - camera.z).toBeGreaterThan(0);
  });

  it('turns an orientation with the world, keeping its angle', () => {
    // A quarter turn left about Y stays a quarter turn about Y.
    near(turnRotation({ x: 0, y: 0.7071068, z: 0, w: 0.7071068 }), {
      x: 0,
      y: 0.7071068,
      z: 0,
      w: 0.7071068,
    });
    // About X it changes sign, as the X axis does.
    near(turnRotation({ x: 0.7071068, y: 0, z: 0, w: 0.7071068 }), {
      x: -0.7071068,
      y: 0,
      z: 0,
      w: 0.7071068,
    });
  });
});
