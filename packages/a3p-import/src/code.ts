/**
 * An Alice world's code as the StoryStage program (spec 19, sections 3, 5 and 6; decision 0069).
 *
 * The scene becomes a class extending `Scene`, with a field for the camera and each object, its
 * script method (`myFirstMethod`), the learner's other methods and its listeners. A class the
 * learner wrote in is kept. Calls go through the Story API's `alice` lists; a block StoryStage left
 * out, or doesn't know, leaves a note in its place saying what it was and why (0069, 2). Values,
 * details, events and the event's values come across by name. Everything that couldn't is in the
 * gaps, in plain words.
 */
import { mintId, SCHEMA_VERSION, type NodeId } from '@storystage/ast';
import type {
  Call,
  Expression,
  FieldDecl,
  ListenerDecl,
  MethodDecl,
  ParameterDecl,
  Program,
  Statement,
  TypeDecl,
  TypeRef,
} from '@storystage/ast';
import { jointFromAlice, skeletonOf, type Skeleton } from '@storystage/backstage';
import {
  CLASS_MAP,
  COLOR_BYTES,
  DETAILS,
  DROPPED,
  DROPPED_VALUES,
  ENTRIES,
  ENUMS,
  EVENTS,
  type ApiEntry,
  type ColorName,
  type EventDef,
} from '@storystage/story-api';
import { word } from '@storystage/story-api/editing';
import { listProp, nodeProp, nodesOf, textProp, type AliceNode } from './decode.ts';
import { words, type ImportGap } from './gaps.ts';
import { aliceClassOf, isLearnerMade, type WorldSetUp } from './world.ts';

/** `SMovableTurnable.move`: Alice's member as the catalog's `alice` lists name it. */
const memberOf = (declaringClass: string, name: string) =>
  `${declaringClass.slice(declaringClass.lastIndexOf('.') + 1)}.${name}`;

const ENTRY_BY_ALICE = new Map<string, ApiEntry>();
for (const entry of ENTRIES)
  for (const member of entry.alice)
    if (!ENTRY_BY_ALICE.has(member)) ENTRY_BY_ALICE.set(member, entry);

const EVENT_BY_ALICE = new Map<string, EventDef>();
const GIVEN_BY_ALICE = new Map<string, string>();
for (const event of EVENTS) {
  for (const member of event.alice) EVENT_BY_ALICE.set(member, event);
  for (const value of event.gives)
    for (const member of value.alice ?? []) GIVEN_BY_ALICE.set(member, value.name);
}

/** Why StoryStage left out each of Alice's members (`dropped.ts`), by `Class.member` or `Class.*`. */
const DROPPED_WHY = new Map<string, string>();
for (const group of DROPPED) for (const member of group.members) DROPPED_WHY.set(member, group.why);
const droppedWhy = (member: string) =>
  DROPPED_WHY.get(member) ?? DROPPED_WHY.get(`${member.split('.')[0]}.*`) ?? null;

/** `LEFT_OF` is `leftOf`, `BEE_LINE` is `beeLine`. */
const camel = (constant: string) =>
  constant.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

/** Methods of Alice's scene that are its plumbing, not the learner's (spec 19, 3.3). */
const SCENE_PLUMBING = new Set([
  'performGeneratedSetUp',
  'performCustomSetup',
  'initializeEventListeners',
  'handleActiveChanged',
  'myFirstMethod',
]);

const ARITHMETIC: Readonly<
  Record<string, 'add' | 'subtract' | 'multiply' | 'divide' | 'remainder'>
> = {
  PLUS: 'add',
  MINUS: 'subtract',
  TIMES: 'multiply',
  REAL_DIVIDE: 'divide',
  INTEGER_DIVIDE: 'divide',
  REMAINDER: 'remainder',
};
const COMPARE: Readonly<
  Record<string, 'equal' | 'notEqual' | 'less' | 'lessOrEqual' | 'greater' | 'greaterOrEqual'>
> = {
  EQUALS: 'equal',
  NOT_EQUALS: 'notEqual',
  LESS: 'less',
  LESS_EQUALS: 'lessOrEqual',
  GREATER: 'greater',
  GREATER_EQUALS: 'greaterOrEqual',
};

export interface BuiltProgram {
  readonly program: Program;
  /** The scene's class and its script method (`Scene.method`, `03-production-format.md`). */
  readonly sceneType: NodeId;
  readonly sceneMethod: NodeId;
  readonly gaps: readonly ImportGap[];
}

/** The program for an Alice world whose scene and start `importSetUp` has read. */
export function buildProgram(aliceProgram: AliceNode, world: WorldSetUp): BuiltProgram {
  const taken = new Set<string>();
  const mint = (): NodeId => {
    const id = mintId(taken);
    taken.add(id);
    return id;
  };
  const gaps: ImportGap[] = [];
  /** Our id for each Alice declaration: types, fields, methods, parameters, locals. */
  const ids = new Map<AliceNode, NodeId>();
  /** Event values a listener's handler gets, by the lambda's event parameter. */
  const eventParams = new Map<AliceNode, Map<string, NodeId>>();
  let where = world.sceneName;

  const gap = (g: Omit<ImportGap, 'where'>) => gaps.push({ ...g, where });

  // ---- Types ----
  const scene = world.sceneType;
  const kept = new Set<AliceNode>(world.fields.flatMap((f) => (f.keptClass ? [f.keptClass] : [])));
  // Other classes the learner wrote, anywhere in the world (spec 19, 3.5).
  for (const n of nodesOf(aliceProgram))
    if (
      n.type === 'NamedUserType' &&
      n !== aliceProgram &&
      n !== scene &&
      isLearnerMade(n) &&
      aliceClassOf(n) !== 'SScene'
    )
      kept.add(n);
  for (const t of kept) ids.set(t, mint());
  const sceneTypeId = mint();
  ids.set(scene, sceneTypeId);

  /** A Story API or program type for an Alice type. */
  const typeOf = (t: AliceNode | null): TypeRef => {
    if (!t) return { kind: 'story', name: 'Thing' };
    if (t.type === 'NamedUserType') {
      const id = ids.get(t);
      if (id) return { kind: 'user', type: id };
      const cls = aliceClassOf(t);
      return { kind: 'story', name: (cls && CLASS_MAP[cls]) || 'Thing' };
    }
    const name = t.java?.kind === 'type' ? t.java.name : '';
    if (name.startsWith('[')) {
      const inner = name.replace(/^\[L?/, '').replace(/;$/, '');
      return {
        kind: 'array',
        of: typeOf({ type: 'JavaType', key: null, props: {}, java: { kind: 'type', name: inner } }),
      };
    }
    switch (name) {
      case 'java.lang.Double':
      case 'java.lang.Number':
      case 'java.lang.Float':
        return { kind: 'story', name: 'Number' };
      case 'java.lang.Integer':
        return { kind: 'story', name: 'WholeNumber' };
      case 'java.lang.Boolean':
        return { kind: 'story', name: 'Boolean' };
      case 'java.lang.String':
        return { kind: 'story', name: 'Text' };
    }
    const simple = name.slice(name.lastIndexOf('.') + 1).replace(/^.*\$/, '');
    const cls = CLASS_MAP[simple];
    if (cls) return { kind: 'story', name: cls };
    if (simple in ENUMS) return { kind: 'story', name: simple };
    return { kind: 'story', name: 'Thing' };
  };

  // ---- Fields ----
  // The scene's: the camera and each object (the ground is the backdrop, markers are the set-up's).
  const objectIds = new Set(world.setup.objects.map((o) => o.id as string));
  const sceneFields: FieldDecl[] = [];
  for (const f of world.fields) {
    if (f.storyClass !== 'Camera' && !objectIds.has(f.name)) continue;
    const id = mint();
    ids.set(f.alice, id);
    sceneFields.push({
      id,
      kind: 'field',
      name: f.name,
      type: f.keptClass
        ? { kind: 'user', type: ids.get(f.keptClass)! }
        : { kind: 'story', name: f.storyClass },
      initial: null,
    });
  }
  if (!sceneFields.some((f) => f.name === 'camera'))
    sceneFields.unshift({
      id: mint(),
      kind: 'field',
      name: 'camera',
      type: { kind: 'story', name: 'Camera' },
      initial: null,
    });

  // Methods get their ids first: a call may come before the method it calls.
  const learnerMethods = (t: AliceNode, isScene: boolean) =>
    listProp(t, 'methods').filter((m) =>
      isScene
        ? !SCENE_PLUMBING.has(textProp(m, 'name') ?? '') &&
          textProp(m, 'managementLevel') === 'NONE'
        : textProp(m, 'managementLevel') === 'NONE',
    );
  const methodsOf = new Map<AliceNode, AliceNode[]>();
  for (const t of [scene, ...kept]) {
    const ms = learnerMethods(t, t === scene).filter(
      (m) => !/^set\w+Resource$/.test(textProp(m, 'name') ?? ''),
    );
    methodsOf.set(t, ms);
    for (const m of ms) ids.set(m, mint());
  }
  const sceneMethodNode = listProp(scene, 'methods').find(
    (m) => textProp(m, 'name') === 'myFirstMethod',
  );
  const sceneMethodId = mint();
  if (sceneMethodNode) ids.set(sceneMethodNode, sceneMethodId);

  // Parameters too, before any body: a call passes its values by the parameters' ids.
  const paramsOf = new Map<AliceNode, ParameterDecl[]>();
  const makeParams = (m: AliceNode): ParameterDecl[] =>
    listProp(m, 'requiredParameters').map((p) => {
      const id = mint();
      ids.set(p, id);
      return {
        id,
        kind: 'parameter',
        name: textProp(p, 'name') ?? 'value',
        type: typeOf(nodeProp(p, 'valueType')),
        default: null,
      };
    });
  for (const ms of methodsOf.values()) for (const m of ms) paramsOf.set(m, makeParams(m));
  if (sceneMethodNode) paramsOf.set(sceneMethodNode, makeParams(sceneMethodNode));

  // ---- Expressions ----
  const describe = (e: AliceNode | null): string => {
    if (!e) return 'something';
    if (e.type === 'ThisExpression') return 'this';
    if (e.type === 'FieldAccess') {
      const f = nodeProp(e, 'field');
      return f?.java?.kind === 'field'
        ? words(f.java.name)
        : words(textProp(f ?? e, 'name') ?? 'something');
    }
    if (e.type === 'ParameterAccess' || e.type === 'LocalAccess')
      return words(
        textProp(nodeProp(e, e.type === 'ParameterAccess' ? 'parameter' : 'local') ?? e, 'name') ??
          'something',
      );
    if (e.type === 'MethodInvocation') {
      // A joint: "the sled's handle".
      const m = nodeProp(e, 'method');
      const name = m?.java?.kind === 'method' ? m.java.name : (textProp(m ?? e, 'name') ?? '');
      return `${describe(nodeProp(e, 'expression'))}’s ${words(name.replace(/^get/, ''))}`;
    }
    return 'something';
  };

  /** The joint map's skeleton for whatever an expression is, for Alice's joint names. */
  const skeletonFor = (e: AliceNode | null): Skeleton => {
    const field = e?.type === 'FieldAccess' ? nodeProp(e, 'field') : null;
    const cls = world.fields.find((f) => f.alice === field)?.storyClass;
    return (cls && skeletonOf(cls)) ?? 'biped';
  };

  /** `getJoint` with a joint from the joint map, on `target` (spec 19, 5.2). */
  const jointCall = (target: Expression, alice: string, skeleton: Skeleton): Expression => ({
    id: mint(),
    kind: 'functionCall',
    target,
    callee: { kind: 'story', name: 'getJoint' },
    args: {
      joint: { id: mint(), kind: 'enum', type: 'JointId', value: jointFromAlice(skeleton, alice) },
    },
    details: {},
  });

  /** "LeftFlap" as Alice's joint name, "LEFT_FLAP". */
  const upperSnake = (name: string) => name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

  /** A colour Alice made from numbers, as the nearest of the Story API's colours. */
  const nearestColor = (e: AliceNode): Expression | null => {
    const constructor = nodeProp(e, 'constructor');
    if (
      constructor?.java?.kind !== 'constructor' ||
      !constructor.java.declaringClass.endsWith('.Color')
    )
      return null;
    const rgb = listProp(e, 'requiredArguments').map(
      (a) => nodeProp(a, 'expression')?.props['value'],
    );
    if (rgb.length < 3 || rgb.slice(0, 3).some((x) => typeof x !== 'number')) return null;
    const bytes = (rgb.slice(0, 3) as number[]).map((x) =>
      Math.round(Math.min(1, Math.max(0, x)) * 255),
    );
    let best: ColorName = 'white';
    let distance = Infinity;
    for (const [name, c] of Object.entries(COLOR_BYTES) as [ColorName, readonly number[]][]) {
      const d = c.reduce((sum, v, i) => sum + (v - bytes[i]!) ** 2, 0);
      if (d < distance) [best, distance] = [name, d];
    }
    if (distance > 0)
      gap({
        kind: 'value',
        what: `a colour Alice mixed (${bytes.join(', ')})`,
        // The colour's name as learners see it in the blocks (en-GB: "dark grey").
        why: `StoryStage names its colours, so the nearest, ${word(`value.Color.${best}`)}, takes its place.`,
      });
    return { id: mint(), kind: 'enum', type: 'Color', value: best };
  };

  /** An Alice enum or colour constant as a Story API value, or null with a gap. */
  const constant = (declaringClass: string, name: string): Expression | null => {
    const type = declaringClass.slice(declaringClass.lastIndexOf('.') + 1).replace(/^.*\$/, '');
    const values = (ENUMS as Readonly<Record<string, readonly string[]>>)[type];
    const value = camel(name);
    if (values?.includes(value)) return { id: mint(), kind: 'enum', type, value };
    const dropped = DROPPED_VALUES[type];
    gap({
      kind: 'value',
      what: `${words(type)} ${words(name)}`,
      why:
        dropped === 'rest' || dropped?.includes(name)
          ? 'StoryStage leaves this value out, so the block has its usual value instead.'
          : 'StoryStage doesn’t know this value, so the block has its usual value instead.',
    });
    return null;
  };

  const expression = (e: AliceNode | null): Expression | null => {
    if (!e) return null;
    const p = e.props;
    switch (e.type) {
      case 'DoubleLiteral':
        return typeof p['value'] === 'number'
          ? { id: mint(), kind: 'number', value: p['value'] }
          : null;
      case 'IntegerLiteral':
        return typeof p['value'] === 'number'
          ? { id: mint(), kind: 'wholeNumber', value: p['value'] }
          : null;
      case 'StringLiteral':
        return {
          id: mint(),
          kind: 'text',
          value: typeof p['value'] === 'string' ? p['value'] : '',
        };
      case 'BooleanLiteral':
        return { id: mint(), kind: 'boolean', value: p['value'] === true };
      case 'NullLiteral':
        return { id: mint(), kind: 'none' };
      case 'ThisExpression':
        return { id: mint(), kind: 'this' };
      case 'FieldAccess': {
        const field = nodeProp(e, 'field');
        if (field?.java?.kind === 'field')
          return constant(field.java.declaringClass, field.java.name);
        const id = field ? ids.get(field) : undefined;
        const target = expression(nodeProp(e, 'expression'));
        return id && target ? { id: mint(), kind: 'fieldRef', target, field: id } : null;
      }
      case 'ParameterAccess':
      case 'LocalAccess': {
        const id = ids.get(nodeProp(e, e.type === 'ParameterAccess' ? 'parameter' : 'local') ?? e);
        return id ? { id: mint(), kind: 'variableRef', variable: id } : null;
      }
      case 'MethodInvocation': {
        // An event's value: `event.getModelAtMouseLocation()` is the handler's `model`.
        const target = nodeProp(e, 'expression');
        const method = nodeProp(e, 'method');
        const param = target?.type === 'ParameterAccess' ? nodeProp(target, 'parameter') : null;
        if (param && method?.java?.kind === 'method' && eventParams.has(param)) {
          const given = GIVEN_BY_ALICE.get(memberOf(method.java.declaringClass, method.java.name));
          const id = given ? eventParams.get(param)!.get(given) : undefined;
          return id ? { id: mint(), kind: 'variableRef', variable: id } : null;
        }
        // Joints (spec 19, 5.2): `getJoint(LEFT_ELBOW)`, `getJointArray(TAIL)`, and Alice's
        // generated getters such as `getHandle`, all through the joint map.
        const on = expression(target);
        if (on && method?.java?.kind === 'method' && /^getJoint(Array)?$/.test(method.java.name)) {
          const argument = nodeProp(listProp(e, 'requiredArguments')[0] ?? e, 'expression');
          const id =
            argument?.type === 'FieldAccess' ? nodeProp(argument, 'field')?.java : undefined;
          if (id?.kind === 'field' && method.java.name === 'getJoint')
            return jointCall(on, id.name, skeletonFor(target));
          const chain = id?.kind === 'field' ? /TAIL|NECK/.exec(id.name)?.[0] : undefined;
          if (chain)
            return {
              id: mint(),
              kind: 'functionCall',
              target: on,
              callee: { kind: 'story', name: 'getJointChain' },
              args: {
                chain: { id: mint(), kind: 'enum', type: 'JointChain', value: chain.toLowerCase() },
              },
              details: {},
            };
        }
        if (on && method?.type === 'UserMethod' && !ids.has(method)) {
          const name = textProp(method, 'name') ?? '';
          const returns = nodeProp(method, 'returnType')?.java;
          if (
            /^get[A-Z]/.test(name) &&
            returns?.kind === 'type' &&
            returns.name.endsWith('.SJoint')
          )
            return jointCall(on, upperSnake(name.slice(3)), skeletonFor(target));
        }
        const call = invocation(e);
        return call && !('note' in call) ? { ...call, kind: 'functionCall' } : null;
      }
      case 'ArithmeticInfixExpression':
      case 'RelationalInfixExpression':
      case 'ConditionalInfixExpression': {
        const op = typeof p['operator'] === 'string' ? p['operator'] : '';
        const left = expression(nodeProp(e, 'leftOperand'));
        const right = expression(nodeProp(e, 'rightOperand'));
        if (!left || !right) return null;
        if (e.type === 'ArithmeticInfixExpression' && ARITHMETIC[op])
          return { id: mint(), kind: 'arithmetic', op: ARITHMETIC[op], left, right };
        if (e.type === 'RelationalInfixExpression' && COMPARE[op])
          return { id: mint(), kind: 'compare', op: COMPARE[op], left, right };
        if (e.type === 'ConditionalInfixExpression' && (op === 'AND' || op === 'OR'))
          return { id: mint(), kind: 'logic', op: op === 'AND' ? 'and' : 'or', left, right };
        return null;
      }
      case 'LogicalComplement': {
        const value = expression(nodeProp(e, 'operand'));
        return value ? { id: mint(), kind: 'not', value } : null;
      }
      case 'StringConcatenation': {
        const left = expression(nodeProp(e, 'leftOperand'));
        const right = expression(nodeProp(e, 'rightOperand'));
        return left && right ? { id: mint(), kind: 'join', left, right } : null;
      }
      case 'ArrayInstanceCreation': {
        const type = typeOf(nodeProp(e, 'arrayType'));
        const items = listProp(e, 'expressions').map(expression);
        if (items.some((x) => !x)) return null;
        return {
          id: mint(),
          kind: 'arrayOf',
          of: type.kind === 'array' ? type.of : type,
          items: items as Expression[],
        };
      }
      case 'ArrayAccess': {
        const array = expression(nodeProp(e, 'array'));
        const index = expression(nodeProp(e, 'index'));
        return array && index ? { id: mint(), kind: 'arrayItem', array, index } : null;
      }
      case 'InstanceCreation':
        // Alice's only value made with `new` that the Story API takes as a value: a colour.
        return nearestColor(e);
      case 'ArrayLength': {
        const array = expression(nodeProp(e, 'array'));
        return array ? { id: mint(), kind: 'arrayLength', array } : null;
      }
      default:
        return null;
    }
  };

  // ---- Calls ----
  /** A call, or a note saying what it was and why it couldn't come across (0069, 2). */
  const invocation = (e: AliceNode): Call | { note: string } | null => {
    const method = nodeProp(e, 'method');
    const target = expression(nodeProp(e, 'expression'));
    const what = `${describe(nodeProp(e, 'expression'))} ${words(method?.java?.kind === 'method' ? method.java.name : (textProp(method ?? e, 'name') ?? 'block'))}`;
    if (!target) {
      gap({
        kind: 'block',
        what,
        why: 'What it acted on isn’t in StoryStage, so a note takes its place.',
      });
      return { note: `In Alice: ${what}. What it acted on isn’t in StoryStage.` };
    }
    const required = listProp(e, 'requiredArguments');
    const keyed = listProp(e, 'keyedArguments');

    if (method && method.type === 'UserMethod') {
      const id = ids.get(method);
      if (!id) {
        gap({
          kind: 'block',
          what,
          why: 'It called a method of Alice’s that StoryStage doesn’t keep, so a note takes its place.',
        });
        return { note: `In Alice: ${what}. StoryStage doesn’t keep the method it called.` };
      }
      const args: Record<string, Expression> = {};
      for (const a of required) {
        const param = nodeProp(a, 'parameter');
        const pid = param ? ids.get(param) : undefined;
        const value = expression(nodeProp(a, 'expression'));
        if (pid && value) args[pid] = value;
      }
      return {
        id: mint(),
        kind: 'call',
        target,
        callee: { kind: 'user', method: id },
        args,
        details: {},
      };
    }

    if (method?.java?.kind !== 'method') return null;
    const member = memberOf(method.java.declaringClass, method.java.name);
    const entry = ENTRY_BY_ALICE.get(member);
    if (!entry) {
      const why = droppedWhy(member);
      gap({
        kind: why ? 'block' : 'unknown',
        what,
        why: why
          ? `StoryStage leaves this block out. ${why}`
          : 'StoryStage doesn’t know this Alice block, so a note takes its place.',
      });
      return {
        note: why
          ? `In Alice: ${what}. StoryStage leaves this out. ${why}`
          : `In Alice: ${what}. StoryStage doesn’t know this Alice block.`,
      };
    }
    const args: Record<string, Expression> = {};
    required.forEach((a, i) => {
      const param = nodeProp(a, 'parameter');
      const index = param?.index ?? i;
      const def = entry.params[index];
      const value = expression(nodeProp(a, 'expression'));
      if (def && value) args[def.name] = value;
      else if (def)
        gap({
          kind: 'value',
          what: `${what}, ${words(def.name)}`,
          why: 'Its value couldn’t come across, so it needs choosing again.',
        });
      else
        gap({
          kind: 'value',
          what,
          why: 'It had a value StoryStage’s block doesn’t take, which was left out.',
        });
    });
    const details: Record<string, Expression> = {};
    for (const k of keyed) {
      // A detail is a call of Alice's detail factory: `Move.duration(2)`.
      const factory = nodeProp(k, 'expression');
      const name = nodeProp(factory ?? k, 'method')?.java;
      const detail = name?.kind === 'method' ? name.name : '';
      const value = expression(
        nodeProp(listProp(factory ?? k, 'requiredArguments')[0] ?? k, 'expression'),
      );
      if (entry.details.includes(detail) && detail in DETAILS && value) details[detail] = value;
      else
        gap({
          kind: 'value',
          what: `${what}, ${words(detail || 'a detail')}`,
          why: 'StoryStage’s block doesn’t take this detail, so it was left out.',
        });
    }
    return {
      id: mint(),
      kind: 'call',
      target,
      callee: { kind: 'story', name: entry.name },
      args,
      details,
    };
  };

  // ---- Statements ----
  const note = (text: string, enabled: boolean): Statement => ({
    id: mint(),
    kind: 'comment',
    text,
    ...(enabled ? {} : { enabled: false as const }),
  });

  const body = (block: AliceNode | null): Statement[] =>
    statements(block ? listProp(block, 'statements') : []);

  const local = (l: AliceNode | null) => {
    const id = mint();
    if (l) ids.set(l, id);
    return {
      id,
      name: textProp(l ?? ({ props: {} } as AliceNode), 'name') ?? 'item',
      type: typeOf(nodeProp(l ?? ({ props: {} } as AliceNode), 'valueType')),
    };
  };

  const statement = (s: AliceNode): Statement | null => {
    const enabled = s.props['isEnabled'] !== false;
    const on = <T extends Statement>(x: T): T => (enabled ? x : { ...x, enabled: false });
    switch (s.type) {
      case 'ExpressionStatement': {
        const e = nodeProp(s, 'expression');
        if (e?.type === 'AssignmentExpression') {
          const target = expression(nodeProp(e, 'leftHandSide'));
          const value = expression(nodeProp(e, 'rightHandSide'));
          if (target && value && e.props['operator'] === 'ASSIGN')
            return on({ id: mint(), kind: 'assign', target, value });
          break;
        }
        if (e?.type === 'MethodInvocation') {
          const call = invocation(e);
          if (call && 'note' in call) return note(call.note, enabled);
          if (call) return on(call);
        }
        break;
      }
      case 'LocalDeclarationStatement': {
        const l = nodeProp(s, 'local');
        const value = expression(nodeProp(s, 'initializer'));
        const { id, name, type } = local(l);
        if (value)
          return on({
            id,
            kind: 'local',
            name,
            type,
            value,
            ...(l?.props['isFinal'] === true ? { constant: true as const } : {}),
          });
        break;
      }
      case 'ConditionalStatement': {
        const pairs = listProp(s, 'booleanExpressionBodyPairs');
        let otherwise = body(nodeProp(s, 'elseBody'));
        for (let i = pairs.length - 1; i >= 0; i--) {
          const condition = expression(nodeProp(pairs[i]!, 'expression'));
          if (!condition) return note('In Alice: an if whose test StoryStage can’t read.', enabled);
          const branch: Statement = {
            id: mint(),
            kind: 'if',
            condition,
            then: body(nodeProp(pairs[i]!, 'body')),
            else: otherwise,
          };
          otherwise = [branch];
        }
        return otherwise.length === 1 ? on(otherwise[0]!) : null;
      }
      case 'CountLoop': {
        const times = expression(nodeProp(s, 'count'));
        if (times) return on({ id: mint(), kind: 'count', times, body: body(nodeProp(s, 'body')) });
        break;
      }
      case 'WhileLoop': {
        const condition = expression(nodeProp(s, 'conditional'));
        if (condition)
          return on({ id: mint(), kind: 'while', condition, body: body(nodeProp(s, 'body')) });
        break;
      }
      case 'ForEachInArrayLoop':
      case 'EachInArrayTogether': {
        const l = local(nodeProp(s, 'item'));
        const items = expression(nodeProp(s, 'array'));
        if (items)
          return on({
            id: mint(),
            kind: s.type === 'ForEachInArrayLoop' ? 'forEach' : 'eachTogether',
            item: { id: l.id, kind: 'loopItem', name: l.name, type: l.type },
            items,
            body: body(nodeProp(s, 'body')),
          });
        break;
      }
      case 'DoTogether':
      case 'DoInOrder':
        return on({
          id: mint(),
          kind: s.type === 'DoTogether' ? 'doTogether' : 'doInOrder',
          body: body(nodeProp(s, 'body')),
        });
      case 'BlockStatement':
        return on({ id: mint(), kind: 'doInOrder', body: body(s) });
      case 'ReturnStatement':
        return on({ id: mint(), kind: 'return', value: expression(nodeProp(s, 'expression')) });
      case 'Comment':
        return on({ id: mint(), kind: 'comment', text: textProp(s, 'text') ?? '' });
      default:
        gap({
          kind: 'unknown',
          what: `Alice’s ${words(s.type)}`,
          why: 'StoryStage doesn’t know this kind of block, so a note takes its place.',
        });
        return note(
          `In Alice: ${words(s.type)}. StoryStage doesn’t know this kind of block.`,
          enabled,
        );
    }
    gap({
      kind: 'block',
      what: `Alice’s ${words(s.type)}`,
      why: 'Part of it couldn’t come across, so a note takes its place.',
    });
    return note(`In Alice: ${words(s.type)}. Part of it couldn’t come across.`, enabled);
  };

  const statements = (list: readonly AliceNode[]): Statement[] =>
    list.map(statement).filter((s): s is Statement => s !== null);

  // ---- Methods ----
  const parameters = (m: AliceNode): ParameterDecl[] => paramsOf.get(m) ?? makeParams(m);

  const methodDecl = (
    m: AliceNode,
    id: NodeId,
    owner: string,
    prefix: Statement[] = [],
  ): MethodDecl => {
    const name = textProp(m, 'name') ?? 'method';
    where = `${owner}.${name}`;
    const params = parameters(m);
    const returnType = nodeProp(m, 'returnType');
    const returns =
      !returnType || (returnType.java?.kind === 'type' && returnType.java.name === 'void')
        ? null
        : typeOf(returnType);
    return {
      id,
      kind: 'method',
      name,
      returns,
      params,
      body: [...prefix, ...body(nodeProp(m, 'body'))],
    };
  };

  // The script: the set-up kept as code, `performCustomSetup`, then `myFirstMethod` (spec 19, 3.2–3.3, 4.4).
  where = `${world.sceneName}, set-up`;
  // `importSetUp` has already reported each of these, so only what's new about a value is kept.
  const reportedBefore = gaps.length;
  const startCode = statements(world.asCode);
  for (let i = gaps.length - 1; i >= reportedBefore; i--)
    if (gaps[i]!.kind === 'block' || gaps[i]!.kind === 'unknown') gaps.splice(i, 1);
  const custom = listProp(scene, 'methods').find(
    (m) => textProp(m, 'name') === 'performCustomSetup',
  );
  where = `${world.sceneName}.performCustomSetup`;
  const customCode = custom ? body(nodeProp(custom, 'body')) : [];
  // The script's body is mapped once, below, after the set-up's code.
  const script: MethodDecl = {
    id: sceneMethodId,
    kind: 'method',
    name: 'myFirstMethod',
    returns: null,
    params: sceneMethodNode ? parameters(sceneMethodNode) : [],
    body: [],
  };
  where = `${world.sceneName}.myFirstMethod`;
  const scriptBody = sceneMethodNode ? body(nodeProp(sceneMethodNode, 'body')) : [];
  const sceneMethods: MethodDecl[] = [
    { ...script, body: [...startCode, ...customCode, ...scriptBody] },
  ];
  for (const m of methodsOf.get(scene) ?? [])
    sceneMethods.push(methodDecl(m, ids.get(m)!, world.sceneName));

  // ---- Listeners (spec 19, section 6) ----
  where = `${world.sceneName}.initializeEventListeners`;
  const listeners: ListenerDecl[] = [];
  const init = listProp(scene, 'methods').find(
    (m) => textProp(m, 'name') === 'initializeEventListeners',
  );
  for (const s of init ? listProp(nodeProp(init, 'body')!, 'statements') : []) {
    const call = nodeProp(s, 'expression');
    const method = call ? nodeProp(call, 'method') : null;
    if (method?.java?.kind !== 'method') continue;
    const member = memberOf(method.java.declaringClass, method.java.name);
    const event = EVENT_BY_ALICE.get(member);
    const required = listProp(call!, 'requiredArguments').map((a) => nodeProp(a, 'expression'));
    const lambda = nodeProp(required.find((x) => x?.type === 'LambdaExpression') ?? s, 'value');
    if (!event || !lambda) {
      gap({
        kind: 'event',
        what: words(method.java.name),
        why: 'StoryStage has no event like it, so it was left out.',
      });
      continue;
    }
    const params: ParameterDecl[] = event.gives.map((g) => ({
      id: mint(),
      kind: 'parameter',
      name: g.name,
      type: { kind: 'story', name: g.type },
      default: null,
    }));
    const handlerParam = listProp(lambda, 'requiredParameters')[0];
    if (handlerParam) eventParams.set(handlerParam, new Map(params.map((p) => [p.name, p.id])));
    const args: Record<string, Expression> = {};
    required
      .filter((x) => x?.type !== 'LambdaExpression')
      .forEach((x, i) => {
        const def = event.args[i];
        const value = expression(x);
        if (def && value) args[def.name] = value;
      });
    const handler = body(nodeProp(lambda, 'body'));
    // Alice's starter worlds start the script when the scene starts; StoryStage does that anyway.
    const onlyStartsScript =
      event.name === 'sceneStart' &&
      handler.length === 1 &&
      handler[0]!.kind === 'call' &&
      handler[0]!.callee.kind === 'user' &&
      handler[0]!.callee.method === sceneMethodId;
    if (onlyStartsScript) continue;
    listeners.push({
      id: mint(),
      kind: 'listener',
      event: event.name,
      args,
      details: {},
      params,
      body: handler,
    });
  }

  // ---- Kept classes ----
  const keptTypes: TypeDecl[] = [...kept].map((t) => {
    where = textProp(t, 'name') ?? 'a class';
    const fields: FieldDecl[] = listProp(t, 'fields')
      .filter((f) => textProp(f, 'managementLevel') === 'NONE')
      .map((f) => {
        const id = mint();
        ids.set(f, id);
        return {
          id,
          kind: 'field',
          name: textProp(f, 'name') ?? 'field',
          type: typeOf(nodeProp(f, 'valueType')),
          initial: expression(nodeProp(f, 'initializer')),
        };
      });
    const cls = aliceClassOf(t);
    return {
      id: ids.get(t)!,
      kind: 'type',
      name: textProp(t, 'name') ?? 'Class',
      extends: { kind: 'story', name: (cls && CLASS_MAP[cls]) || 'Thing' },
      fields,
      methods: (methodsOf.get(t) ?? []).map((m) =>
        methodDecl(m, ids.get(m)!, textProp(t, 'name') ?? 'a class'),
      ),
      listeners: [],
    };
  });

  const sceneDecl: TypeDecl = {
    id: sceneTypeId,
    kind: 'type',
    name: world.sceneName,
    extends: { kind: 'story', name: 'Scene' },
    fields: sceneFields,
    methods: sceneMethods,
    listeners,
  };
  return {
    program: { schemaVersion: SCHEMA_VERSION, types: [sceneDecl, ...keptTypes] },
    sceneType: sceneTypeId,
    sceneMethod: sceneMethodId,
    gaps,
  };
}
