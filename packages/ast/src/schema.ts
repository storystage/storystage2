/**
 * The JSON schema for a program, and the small interpreter that checks it in the app
 * (`docs/spec/01-ast.md`, section 2). Ajv would generate code, which a strict content security
 * policy forbids, so it runs only in the tests, to keep the two in agreement.
 */
import { NODE_ID_PATTERN } from './ids.ts';
import {
  ARITHMETIC_OPS,
  COMPARE_OPS,
  EXPRESSION_KINDS,
  LOGIC_OPS,
  STATEMENT_KINDS,
} from './nodes.ts';

interface Schema {
  readonly $ref?: string;
  readonly type?: string;
  readonly const?: unknown;
  readonly enum?: readonly unknown[];
  readonly pattern?: string;
  readonly maxLength?: number;
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
  readonly additionalProperties?: boolean | Schema;
  readonly propertyNames?: Schema;
  readonly items?: Schema;
  readonly oneOf?: readonly Schema[];
}

const MAX_TEXT = 10_000;
const MAX_NAME = 60;
/**
 * Levels of JSON, as in `docs/spec/15-security.md` section 3.1. The walkers recurse, so a hostile
 * file mustn't be able to exhaust the stack.
 */
export const MAX_DEPTH = 256;

const ref = (name: string): Schema => ({ $ref: `#/$defs/${name}` });
const orNull = (name: string): Schema => ({ oneOf: [{ type: 'null' }, ref(name)] });
const listOf = (name: string): Schema => ({ type: 'array', items: ref(name) });
const EXPRESSION = ref('expression');
const NAME = ref('name');
const TYPE_REF = ref('typeRef');
const STATEMENTS = listOf('statement');

function node(
  kind: string,
  properties: Readonly<Record<string, Schema>>,
  optional: readonly string[] = [],
): Schema {
  return {
    type: 'object',
    required: ['id', 'kind', ...Object.keys(properties).filter((k) => !optional.includes(k))],
    additionalProperties: false,
    properties: { id: ref('id'), kind: { const: kind }, copiedFrom: ref('id'), ...properties },
  };
}

const statement = (
  kind: string,
  properties: Readonly<Record<string, Schema>>,
  optional: readonly string[] = [],
): Schema => node(kind, { enabled: { const: false }, ...properties }, ['enabled', ...optional]);

const value = (kind: string, type: string): Schema => node(kind, { value: { type } });
const loop = (kind: string): Schema =>
  statement(kind, { item: ref('loopItem'), items: EXPRESSION, body: STATEMENTS });
const CALL_PARTS = {
  target: EXPRESSION,
  callee: ref('callee'),
  args: ref('args'),
  details: ref('args'),
};
const binary = (kind: string, ops: readonly string[]): Schema =>
  node(kind, { op: { enum: ops }, left: EXPRESSION, right: EXPRESSION });

const unionOf = (kinds: readonly string[]): Schema => ({ oneOf: kinds.map(ref) });
const typed = (kind: string, properties: Readonly<Record<string, Schema>>): Schema => ({
  type: 'object',
  required: ['kind', ...Object.keys(properties)],
  additionalProperties: false,
  properties: { kind: { const: kind }, ...properties },
});

export const PROGRAM_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://storystage.github.io/storystage2/schema/program.json',
  title: 'StoryStage program',
  type: 'object',
  required: ['schemaVersion', 'types'],
  additionalProperties: false,
  properties: {
    schemaVersion: { type: 'string', pattern: '^[0-9]+\\.[0-9]+\\.[0-9]+$' },
    types: listOf('type'),
  },
  $defs: {
    id: { type: 'string', pattern: NODE_ID_PATTERN },
    name: { type: 'string', pattern: '^\\p{L}[\\p{L}\\p{N}_]*$', maxLength: MAX_NAME },
    textValue: { type: 'string', maxLength: MAX_TEXT },

    typeRef: unionOf(['storyType', 'userType', 'arrayType']),
    storyType: typed('story', { name: NAME }),
    userType: typed('user', { type: ref('id') }),
    arrayType: typed('array', { of: TYPE_REF }),
    orNoType: orNull('typeRef'),

    callee: unionOf(['storyCallee', 'userCallee']),
    storyCallee: typed('story', { name: NAME }),
    userCallee: typed('user', { method: ref('id') }),
    args: { type: 'object', propertyNames: NAME, additionalProperties: EXPRESSION },

    type: node('type', {
      name: NAME,
      extends: TYPE_REF,
      fields: listOf('field'),
      methods: listOf('method'),
      listeners: listOf('listener'),
    }),
    field: node('field', { name: NAME, type: TYPE_REF, initial: orNull('expression') }),
    method: node('method', {
      name: NAME,
      returns: orNull('typeRef'),
      params: listOf('parameter'),
      body: STATEMENTS,
    }),
    parameter: node('parameter', { name: NAME, type: TYPE_REF, default: orNull('expression') }),
    listener: node('listener', {
      event: NAME,
      args: ref('args'),
      params: listOf('parameter'),
      body: STATEMENTS,
    }),
    loopItem: node('loopItem', { name: NAME, type: TYPE_REF }),

    statement: unionOf(STATEMENT_KINDS),
    doInOrder: statement('doInOrder', { body: STATEMENTS }),
    doTogether: statement('doTogether', { body: STATEMENTS }),
    count: statement('count', { times: EXPRESSION, body: STATEMENTS }),
    while: statement('while', { condition: EXPRESSION, body: STATEMENTS }),
    forEach: loop('forEach'),
    eachTogether: loop('eachTogether'),
    if: statement('if', { condition: EXPRESSION, then: STATEMENTS, else: STATEMENTS }),
    local: statement(
      'local',
      { name: NAME, type: TYPE_REF, value: EXPRESSION, constant: { const: true } },
      ['constant'],
    ),
    assign: statement('assign', { target: EXPRESSION, value: EXPRESSION }),
    comment: statement('comment', { text: ref('textValue') }),
    call: statement('call', CALL_PARTS),
    return: statement('return', { value: orNull('expression') }),

    expression: unionOf(EXPRESSION_KINDS),
    number: value('number', 'number'),
    wholeNumber: value('wholeNumber', 'integer'),
    boolean: value('boolean', 'boolean'),
    text: node('text', { value: ref('textValue') }),
    enum: node('enum', { type: NAME, value: NAME }),
    none: node('none', {}),
    this: node('this', {}),
    fieldRef: node('fieldRef', { target: EXPRESSION, field: ref('id') }),
    variableRef: node('variableRef', { variable: ref('id') }),
    functionCall: node('functionCall', CALL_PARTS),
    arithmetic: binary('arithmetic', ARITHMETIC_OPS),
    compare: binary('compare', COMPARE_OPS),
    logic: binary('logic', LOGIC_OPS),
    not: node('not', { value: EXPRESSION }),
    join: node('join', { left: EXPRESSION, right: EXPRESSION }),
    arrayOf: node('arrayOf', { of: TYPE_REF, items: listOf('expression') }),
    arrayItem: node('arrayItem', { array: EXPRESSION, index: EXPRESSION }),
    arrayLength: node('arrayLength', { array: EXPRESSION }),
  },
} as const;

// ---- The interpreter -------------------------------------------------------------------------

export interface SchemaProblem {
  /** A JSON pointer to the value. */
  readonly at: string;
  readonly message: string;
  /** Over a length limit, so too big rather than the wrong shape. */
  readonly tooLong?: true;
}

const MAX_PROBLEMS = 20;
const DEFS: Readonly<Record<string, Schema>> = PROGRAM_SCHEMA.$defs;

const resolve = (schema: Schema): Schema =>
  schema.$ref === undefined ? schema : DEFS[schema.$ref.slice('#/$defs/'.length)]!;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const TYPE_CHECKS: Readonly<Record<string, (v: unknown) => boolean>> = {
  array: Array.isArray,
  boolean: (v) => typeof v === 'boolean',
  integer: Number.isInteger,
  null: (v) => v === null,
  number: Number.isFinite,
  object: isObject,
  string: (v) => typeof v === 'string',
};

const codePoints = (s: string): number => [...s].length;

const patterns = new Map<string, RegExp>();
function matches(pattern: string, text: string): boolean {
  let regexp = patterns.get(pattern);
  if (!regexp) patterns.set(pattern, (regexp = new RegExp(pattern, 'u')));
  return regexp.test(text);
}

/**
 * For a `oneOf` of objects told apart by `kind`, the one to check: this is what `oneOf` means
 * when the kinds differ, without checking all of them at every level of a deep program.
 */
const unions = new Map<readonly Schema[], ReadonlyMap<string, Schema> | null>();
function unionByKind(oneOf: readonly Schema[]): ReadonlyMap<string, Schema> | null {
  let union = unions.get(oneOf);
  if (union === undefined) {
    const kinds = oneOf.map((branch) => resolve(branch).properties?.kind?.const);
    union = kinds.every((k) => typeof k === 'string')
      ? new Map(kinds.map((k, i) => [k as string, resolve(oneOf[i]!)]))
      : null;
    unions.set(oneOf, union);
  }
  return union;
}

function check(
  value: unknown,
  ref: Schema,
  at: string,
  lenient: boolean,
  problems: SchemaProblem[],
): void {
  if (problems.length >= MAX_PROBLEMS) return;
  const schema = resolve(ref);
  const fail = (message: string) => problems.push({ at, message });

  if (schema.oneOf) {
    const union = unionByKind(schema.oneOf);
    if (union) {
      const kind = isObject(value) ? value.kind : undefined;
      const branch = typeof kind === 'string' ? union.get(kind) : undefined;
      if (branch) check(value, branch, at, lenient, problems);
      else if (!(lenient && typeof kind === 'string')) fail(`has no known kind (${String(kind)})`);
      return;
    }
    const results = schema.oneOf.map((branch) => {
      const found: SchemaProblem[] = [];
      check(value, branch, at, lenient, found);
      return found;
    });
    if (results.filter((r) => r.length === 0).length !== 1) problems.push(...results.at(-1)!);
    return;
  }

  if (schema.type && !TYPE_CHECKS[schema.type]!(value)) {
    fail(`should be ${schema.type}`);
    return;
  }
  if ('const' in schema && value !== schema.const) fail(`should be ${String(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value))
    fail(`should be one of ${schema.enum.join(', ')}`);

  if (typeof value === 'string') {
    if (schema.pattern !== undefined && !matches(schema.pattern, value))
      fail(`doesn't match ${schema.pattern}`);
    if (
      schema.maxLength !== undefined &&
      value.length > schema.maxLength &&
      codePoints(value) > schema.maxLength
    )
      problems.push({ at, message: `is longer than ${schema.maxLength}`, tooLong: true });
  }

  if (isObject(value)) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) fail(`has no ${key}`);
    const properties = schema.properties ?? {};
    for (const key of Object.keys(value)) {
      const inner = `${at}/${key}`;
      if (schema.propertyNames) check(key, schema.propertyNames, inner, lenient, problems);
      if (Object.hasOwn(properties, key))
        check(value[key], properties[key]!, inner, lenient, problems);
      else if (schema.additionalProperties === false) {
        if (!lenient) problems.push({ at: inner, message: 'is not allowed here' });
      } else if (typeof schema.additionalProperties === 'object')
        check(value[key], schema.additionalProperties, inner, lenient, problems);
    }
  }

  if (Array.isArray(value) && schema.items)
    value.forEach((item, i) => check(item, schema.items!, `${at}/${i}`, lenient, problems));
}

/** How deep some JSON goes, without recursion, so any depth can be measured safely. */
export function isTooDeep(root: unknown, limit: number = MAX_DEPTH): boolean {
  const stack: { readonly value: object; readonly depth: number }[] = [];
  const push = (value: unknown, depth: number) => {
    if (typeof value === 'object' && value !== null) stack.push({ value, depth });
  };
  push(root, 1);
  while (stack.length > 0) {
    const { value, depth } = stack.pop()!;
    if (depth > limit) return true;
    for (const child of Object.values(value)) push(child, depth + 1);
  }
  return false;
}

/**
 * Checks a value's shape. `lenient` skips unknown kinds and properties, for a file from a newer
 * version (spec section 7). Stops after a few problems.
 */
export function validateSchema(value: unknown, lenient = false): SchemaProblem[] {
  const problems: SchemaProblem[] = [];
  check(value, PROGRAM_SCHEMA as Schema, '', lenient, problems);
  return problems;
}
