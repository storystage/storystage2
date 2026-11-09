/**
 * For the tests: decoded Alice graphs in Alice's own shapes (spec 19, section 2), built directly,
 * so a test says what an Alice world holds without writing its XML.
 */
import type { AliceNode, AliceValue } from './decode.ts';

export const n = (
  type: string,
  props: Record<string, AliceValue> = {},
  extra: Partial<AliceNode> = {},
) => ({ type, key: null, props, ...extra }) as AliceNode;

export const javaType = (name: string) =>
  n(
    'JavaType',
    {},
    { java: { kind: 'type', name: name.includes('.') ? name : `org.lgna.story.${name}` } },
  );

export const userType = (
  name: string,
  superType: AliceNode,
  more: { methods?: AliceNode[]; fields?: AliceNode[] } = {},
) =>
  n('NamedUserType', {
    name,
    superType,
    methods: more.methods ?? [],
    fields: more.fields ?? [],
    constructors: [],
  });

export const field = (
  name: string,
  valueType: AliceNode,
  initializer: AliceNode | null = null,
  level = 'MANAGED',
) => n('UserField', { name, valueType, initializer, managementLevel: level });

export const param = (name: string, valueType: AliceNode) =>
  n('UserParameter', { name, valueType });

export const method = (
  name: string,
  statements: AliceNode[],
  more: { level?: string; params?: AliceNode[]; returns?: AliceNode } = {},
) =>
  n('UserMethod', {
    name,
    managementLevel: more.level ?? 'NONE',
    requiredParameters: more.params ?? [],
    returnType: more.returns ?? javaType('void'),
    body: n('BlockStatement', { statements }),
  });

export const arg = (expression: AliceNode, parameter?: AliceNode) =>
  n('SimpleArgument', { expression, ...(parameter ? { parameter } : {}) });

export const javaMethod = (cls: string, name: string) =>
  n(
    'JavaMethod',
    {},
    { java: { kind: 'method', name, declaringClass: `org.lgna.story.${cls}`, parameters: [] } },
  );

export const self = () => n('ThisExpression');
export const on = (f: AliceNode) => n('FieldAccess', { expression: self(), field: f });
export const num = (value: number) => n('DoubleLiteral', { value });
export const whole = (value: number) => n('IntegerLiteral', { value });
export const text = (value: string) => n('StringLiteral', { value });

/** Alice's call of one of its own methods, with details as keyed arguments. */
export const invoke = (
  target: AliceNode,
  method: AliceNode,
  args: AliceNode[] = [],
  keyed: [cls: string, detail: string, value: AliceNode][] = [],
) =>
  n('MethodInvocation', {
    expression: target,
    method,
    requiredArguments: args.map((a) => arg(a)),
    keyedArguments: keyed.map(([cls, detail, value]) =>
      n('JavaKeyedArgument', {
        expression: n('MethodInvocation', {
          method: javaMethod(cls, detail),
          requiredArguments: [arg(value)],
        }),
      }),
    ),
  });

export const statement = (expression: AliceNode, enabled = true) =>
  n('ExpressionStatement', { expression, isEnabled: enabled });

export const constant = (cls: string, name: string) =>
  n('FieldAccess', {
    expression: n('TypeExpression'),
    field: n(
      'JavaField',
      {},
      { java: { kind: 'field', name, declaringClass: `org.lgna.story.${cls}` } },
    ),
  });

export const resource = (folder: string, name: string, variant = 'DEFAULT') =>
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

export const create = (...args: AliceNode[]) =>
  n('InstanceCreation', {
    constructor: n('NamedUserConstructor', {}),
    requiredArguments: args.map((a) => arg(a)),
  });

export const color = (r: number, g: number, b: number) =>
  n('InstanceCreation', {
    constructor: n(
      'JavaConstructor',
      {},
      { java: { kind: 'constructor', declaringClass: 'org.lgna.story.Color', parameters: [] } },
    ),
    requiredArguments: [r, g, b].map((v) => arg(num(v))),
  });

/** One of Alice's value objects made from numbers: `new Size(1, 2, 3)`. */
export const make = (cls: string, ...values: number[]) =>
  n('InstanceCreation', {
    constructor: n(
      'JavaConstructor',
      {},
      { java: { kind: 'constructor', declaringClass: `org.lgna.story.${cls}`, parameters: [] } },
    ),
    requiredArguments: values.map((v) => arg(num(v))),
  });

/** A world: Program holding a scene with these fields, set-up and methods. */
export function world(
  fields: AliceNode[],
  setUp: AliceNode[],
  methods: AliceNode[] = [],
): AliceNode {
  const scene = userType('Scene', javaType('SScene'), {
    fields,
    methods: [method('performGeneratedSetUp', setUp, { level: 'MANAGED' }), ...methods],
  });
  return userType('Program', javaType('SProgram'), { fields: [field('myScene', scene)] });
}
