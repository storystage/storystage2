/**
 * What each block looks like, as plain data (`14-editors.md` section 3i.1): its words, its slots
 * and its fields, in order. `definitions.ts` builds Blockly blocks from these, and `mapping.ts`
 * fills their slots, so the two can't disagree about a slot's name.
 *
 * There is one block type for each Story API entry name (an entry with the same name on two
 * classes has the same parameters on both) and one for each node kind of spec 01 section 1.
 * Words come from the Story API's strings and this package's own, never from code.
 */
import { ARITHMETIC_OPS, COMPARE_OPS, LOGIC_OPS, type Statement } from '@storystage/ast';
import {
  DETAILS,
  ENTRIES,
  ENUMS,
  STORY_WORDS,
  findEvent,
  type ApiEntry,
  type EnumName,
  type TypeName,
} from '@storystage/story-api';
import { inputCheck, outputCheck, targetCheck } from './checks.ts';
import blockWords from './strings/en-GB.json' with { type: 'json' };

/** One part of a block's row, left to right. */
export type Part =
  | { readonly kind: 'words'; readonly text: string }
  /** A name the program gives (a variable's, a method's), shown as words. */
  | { readonly kind: 'label'; readonly name: string }
  | { readonly kind: 'value'; readonly input: string; readonly check: string[] | null }
  | { readonly kind: 'statements'; readonly input: string }
  | { readonly kind: 'number'; readonly field: string; readonly whole: boolean }
  | { readonly kind: 'text'; readonly field: string }
  | { readonly kind: 'choice'; readonly field: string; readonly options: [string, string][] };

export interface Shape {
  readonly type: string;
  /** A statement joins a list; a value plugs into a slot; a header holds a method's body. */
  readonly role: 'statement' | 'value' | 'header';
  /** For a value: what it fits (`checks.ts`). */
  readonly output?: string[] | null;
  readonly parts: readonly Part[];
}

const WORDS = blockWords as Readonly<Record<string, string>>;
const STORY = STORY_WORDS as Readonly<Record<string, string>>;

// ---- Block type names ------------------------------------------------------------------------

/** Blockly type names: letters, digits and `_`. */
export const storyStatementType = (name: string) => `ss_story_${name}`;
export const storyValueType = (name: string) => `ss_storyfn_${name}`;
export const enumType = (name: string) => `ss_enum_${name}`;
export const nodeType = (kind: string) => `ss_${kind}`;
export const USER_CALL = 'ss_usercall';
export const USER_FUNCTION = 'ss_userfn';
export const METHOD = 'ss_method';
export const LISTENER = 'ss_listener';

/** Slot names on blocks: a call's target, a parameter, a detail. */
export const TARGET = 'TARGET';
export const argInput = (param: string) => `ARG_${param}`;
export const detailInput = (detail: string) => `DETAIL_${detail}`;
export const itemInput = (index: number) => `ITEM_${index}`;

// ---- Words to parts --------------------------------------------------------------------------

/**
 * A row from words with `{placeholders}`: each placeholder becomes the part `slot` gives for it,
 * and the words between stay words.
 */
export function partsFrom(template: string, slot: (name: string) => Part): Part[] {
  const parts: Part[] = [];
  for (const piece of template.split(/(\{[a-zA-Z]+\})/)) {
    if (piece === '') continue;
    const placeholder = /^\{([a-zA-Z]+)\}$/.exec(piece);
    if (placeholder) parts.push(slot(placeholder[1]!));
    else if (piece.trim() !== '') parts.push({ kind: 'words', text: piece.trim() });
  }
  return parts;
}

const word = (key: string): string => {
  const text = WORDS[key];
  if (text === undefined) throw new Error(`No block words for "${key}"`);
  return text;
};

// ---- Story API blocks ------------------------------------------------------------------------

/** The first entry of each name: same-named entries share their parameters (see above). */
const BY_NAME = new Map<string, ApiEntry>();
for (const e of ENTRIES) if (!BY_NAME.has(e.name)) BY_NAME.set(e.name, e);

/** Every Story API entry name, in the metadata's order. */
export const ENTRY_NAMES: readonly string[] = [...BY_NAME.keys()];

export const entryNamed = (name: string): ApiEntry | undefined => BY_NAME.get(name);

/** The words for a detail and its slot: "how long {value}". */
function detailParts(detail: string): Part[] {
  const def = DETAILS[detail as keyof typeof DETAILS];
  return partsFrom(word('block.detail'), (name) =>
    name === 'detail'
      ? { kind: 'words', text: STORY[`detail.${detail}`] ?? detail }
      : { kind: 'value', input: detailInput(detail), check: def ? inputCheck(def.type) : null },
  );
}

/** A Story API call: its target, its words with a slot for each parameter, then its details. */
export function storyShape(name: string, details: readonly string[] = []): Shape {
  const entry = BY_NAME.get(name);
  if (!entry) throw new Error(`No Story API entry called ${name}`);
  const template = STORY[`entry.${entry.on}.${entry.name}`] ?? entry.name;
  const params = new Map(entry.params.map((p) => [p.name, p]));
  const parts: Part[] = [
    { kind: 'value', input: TARGET, check: targetCheck(name) },
    ...partsFrom(template, (param) => {
      const def = params.get(param);
      return { kind: 'value', input: argInput(param), check: def ? inputCheck(def.type) : null };
    }),
    // A parameter the words don't mention still gets its slot, at the end.
    ...entry.params
      .filter((p) => !template.includes(`{${p.name}}`))
      .map((p): Part => ({ kind: 'value', input: argInput(p.name), check: inputCheck(p.type) })),
    ...details.flatMap(detailParts),
  ];
  return entry.kind === 'procedure'
    ? { type: storyStatementType(name), role: 'statement', parts }
    : { type: storyValueType(name), role: 'value', output: outputCheck(entry.returns), parts };
}

/** A call to the learner's own procedure or function: its name, then a slot per parameter. */
export function userCallShape(
  role: 'statement' | 'value',
  params: readonly { id: string; name: string }[],
  details: readonly string[] = [],
): Shape {
  return {
    type: role === 'statement' ? USER_CALL : USER_FUNCTION,
    role,
    output: role === 'value' ? null : undefined,
    parts: [
      { kind: 'value', input: TARGET, check: null },
      { kind: 'label', name: 'method' },
      ...params.flatMap((p): Part[] => [
        { kind: 'words', text: p.name },
        { kind: 'value', input: argInput(p.id), check: null },
      ]),
      ...details.flatMap(detailParts),
    ],
  };
}

// ---- Headers ---------------------------------------------------------------------------------

export const methodShape = (): Shape => ({
  type: METHOD,
  role: 'header',
  parts: [
    { kind: 'label', name: 'name' },
    { kind: 'statements', input: 'BODY' },
  ],
});

/** A listener: the event's words, with a slot for each argument and detail, then its body. */
export function listenerShape(event: string, details: readonly string[] = []): Shape {
  const def = findEvent(event);
  const template = STORY[`event.${event}`] ?? event;
  return {
    type: LISTENER,
    role: 'header',
    parts: [
      { kind: 'words', text: template },
      ...(def?.args ?? []).map((a): Part => ({
        kind: 'value',
        input: argInput(a.name),
        check: inputCheck(a.type),
      })),
      ...details.flatMap(detailParts),
      { kind: 'statements', input: 'BODY' },
    ],
  };
}

// ---- Statements ------------------------------------------------------------------------------

const BOOLEAN = inputCheck('Boolean');
const WHOLE = inputCheck('WholeNumber');

/** The block for a statement kind other than a call (calls take `storyShape` or `userCallShape`). */
export function statementShape(
  kind: Exclude<Statement['kind'], 'call'>,
  extra: { hasValue?: boolean; constant?: boolean } = {},
): Shape {
  const type = nodeType(kind);
  const row = (key: string, slots: Record<string, Part>): Part[] =>
    partsFrom(word(key), (name) => slots[name] ?? { kind: 'label', name });
  const value = (input: string, check: string[] | null = null): Part => ({
    kind: 'value',
    input,
    check,
  });
  const body: Part = { kind: 'statements', input: 'BODY' };
  switch (kind) {
    case 'doInOrder':
    case 'doTogether':
      return { type, role: 'statement', parts: [...row(`block.${kind}`, {}), body] };
    case 'count':
      return {
        type,
        role: 'statement',
        parts: [...row('block.count', { times: value('TIMES', WHOLE) }), body],
      };
    case 'while':
      return {
        type,
        role: 'statement',
        parts: [...row('block.while', { condition: value('CONDITION', BOOLEAN) }), body],
      };
    case 'forEach':
    case 'eachTogether':
      return {
        type,
        role: 'statement',
        parts: [...row(`block.${kind}`, { items: value('ITEMS') }), body],
      };
    case 'if':
      return {
        type,
        role: 'statement',
        parts: [
          ...row('block.if', { condition: value('CONDITION', BOOLEAN) }),
          { kind: 'statements', input: 'THEN' },
          { kind: 'words', text: word('block.else') },
          { kind: 'statements', input: 'ELSE' },
        ],
      };
    case 'local':
      return {
        type,
        role: 'statement',
        parts: row(extra.constant ? 'block.constant' : 'block.local', { value: value('VALUE') }),
      };
    case 'assign':
      return {
        type,
        role: 'statement',
        parts: row('block.assign', { target: value('TARGET'), value: value('VALUE') }),
      };
    case 'comment':
      return {
        type,
        role: 'statement',
        parts: [
          { kind: 'words', text: word('block.comment') },
          { kind: 'text', field: 'TEXT' },
        ],
      };
    case 'return':
      return {
        type,
        role: 'statement',
        parts:
          extra.hasValue === false
            ? row('block.returnNothing', {})
            : row('block.return', { value: value('VALUE') }),
      };
  }
}

// ---- Expressions -----------------------------------------------------------------------------

const options = (ops: readonly string[]): [string, string][] =>
  ops.map((op) => [word(`block.op.${op}`), op]);

/** The block for an expression kind other than a function call or an enum value. */
export function expressionShape(
  kind: string,
  extra: { count?: number; of?: TypeName | null } = {},
): Shape {
  const type = nodeType(kind);
  const value = (input: string, check: string[] | null = null): Part => ({
    kind: 'value',
    input,
    check,
  });
  const v = (output: TypeName | null, parts: Part[]): Shape => ({
    type,
    role: 'value',
    output: outputCheck(output),
    parts,
  });
  const row = (key: string, slots: Record<string, Part>) =>
    partsFrom(word(key), (name) => slots[name] ?? { kind: 'label', name });
  switch (kind) {
    case 'number':
      return v('Number', [{ kind: 'number', field: 'NUM', whole: false }]);
    case 'wholeNumber':
      return v('WholeNumber', [{ kind: 'number', field: 'NUM', whole: true }]);
    case 'boolean':
      return v('Boolean', [
        {
          kind: 'choice',
          field: 'BOOL',
          options: [
            [word('block.true'), 'true'],
            [word('block.false'), 'false'],
          ],
        },
      ]);
    case 'text':
      return v('Text', [{ kind: 'text', field: 'TEXT' }]);
    case 'none':
      return v(null, [{ kind: 'words', text: word('block.none') }]);
    case 'this':
      return v(null, [{ kind: 'words', text: word('block.this') }]);
    case 'fieldRef':
      return v(null, row('block.fieldRef', { target: value('TARGET') }));
    case 'variableRef':
      return v(null, [{ kind: 'label', name: 'variable' }]);
    case 'arithmetic':
      return v(null, [
        value('LEFT'),
        { kind: 'choice', field: 'OP', options: options(ARITHMETIC_OPS) },
        value('RIGHT'),
      ]);
    case 'compare':
      return v('Boolean', [
        value('LEFT'),
        { kind: 'choice', field: 'OP', options: options(COMPARE_OPS) },
        value('RIGHT'),
      ]);
    case 'logic':
      return v('Boolean', [
        value('LEFT', BOOLEAN),
        { kind: 'choice', field: 'OP', options: options(LOGIC_OPS) },
        value('RIGHT', BOOLEAN),
      ]);
    case 'not':
      return v('Boolean', row('block.not', { value: value('VALUE', BOOLEAN) }));
    case 'join':
      return v('Text', row('block.join', { left: value('LEFT'), right: value('RIGHT') }));
    case 'arrayOf': {
      const of = extra.of ?? null;
      const items = Array.from({ length: extra.count ?? 0 }, (_, i) =>
        value(itemInput(i), of ? inputCheck(of) : null),
      );
      return v(of ? (`${of}[]` as TypeName) : null, [
        { kind: 'words', text: word('block.arrayOf') },
        ...items,
      ]);
    }
    case 'arrayItem':
      return v(
        null,
        row('block.arrayItem', { index: value('INDEX', WHOLE), array: value('ARRAY') }),
      );
    case 'arrayLength':
      return v('WholeNumber', row('block.arrayLength', { array: value('ARRAY') }));
    default:
      throw new Error(`No block for an expression of kind ${kind}`);
  }
}

/** A value of an enumeration: a choice of its values, in their words. */
export function enumShape(name: EnumName): Shape {
  return {
    type: enumType(name),
    role: 'value',
    output: outputCheck(name),
    parts: [
      {
        kind: 'choice',
        field: 'VALUE',
        options: ENUMS[name].map((v) => [STORY[`value.${name}.${v}`] ?? v, v] as [string, string]),
      },
    ],
  };
}

/** Every enumeration's name. */
export const ENUM_NAMES = Object.keys(ENUMS) as EnumName[];

/** The statement kinds with a block of their own (calls are Story API or user blocks). */
export const STATEMENT_KINDS = [
  'doInOrder',
  'doTogether',
  'count',
  'while',
  'forEach',
  'eachTogether',
  'if',
  'local',
  'assign',
  'comment',
  'return',
] as const satisfies readonly Exclude<Statement['kind'], 'call'>[];

/** The expression kinds with a block of their own (enum values and function calls have theirs). */
export const EXPRESSION_KINDS = [
  'number',
  'wholeNumber',
  'boolean',
  'text',
  'none',
  'this',
  'fieldRef',
  'variableRef',
  'arithmetic',
  'compare',
  'logic',
  'not',
  'join',
  'arrayOf',
  'arrayItem',
  'arrayLength',
] as const;
