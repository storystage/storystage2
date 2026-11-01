/**
 * WP4.2: reading the metadata. Lookups for the editors, the type rules for the program check,
 * and the text form the Prompter's system prompt uses (spec 04, section 3).
 */
import { DETAILS } from './details.ts';
import { ENTRIES } from './entries.ts';
import { EVENTS } from './events.ts';
import { CLASS_PARENTS, ENUMS } from './types.ts';
import type {
  ApiClass,
  ApiEntry,
  EnumName,
  EventDef,
  ParamDef,
  NumberRange,
  TypeName,
} from './types.ts';

export const API_CLASSES = Object.keys(CLASS_PARENTS) as readonly ApiClass[];

/** A class and its parents, the class itself first. */
export function classChain(cls: ApiClass): readonly ApiClass[] {
  const chain: ApiClass[] = [];
  for (let c: ApiClass | null = cls; c; c = CLASS_PARENTS[c]) chain.push(c);
  return chain;
}

export const isKindOf = (cls: ApiClass, ancestor: ApiClass) => classChain(cls).includes(ancestor);

/** What a class can do: its own entries, then its parents', nearest first. */
export function entriesOf(cls: ApiClass): readonly ApiEntry[] {
  const seen = new Set<string>();
  const entries: ApiEntry[] = [];
  for (const c of classChain(cls)) {
    for (const entry of ENTRIES) {
      if (entry.on === c && !seen.has(entry.name)) {
        seen.add(entry.name);
        entries.push(entry);
      }
    }
  }
  return entries;
}

export const findEntry = (cls: ApiClass, name: string): ApiEntry | undefined =>
  entriesOf(cls).find((e) => e.name === name);

export const findEvent = (name: string): EventDef | undefined =>
  EVENTS.find((e) => e.name === name);

export const isEnumName = (name: string): name is EnumName => name in ENUMS;

export function enumValues(name: EnumName): readonly string[] {
  return ENUMS[name];
}

const classOfType = (type: string): ApiClass | null => {
  if (type === 'TextModel') return 'Text';
  if (type === 'Text') return null;
  return type in CLASS_PARENTS ? (type as ApiClass) : null;
};

const isList = (type: TypeName) => type.endsWith('[]');
const itemOf = (type: TypeName) => type.slice(0, -2) as TypeName;

/** Whether a value of type `value` can go where `wanted` is asked for. */
export function fits(value: TypeName, wanted: TypeName): boolean {
  if (value === wanted) return true;
  if (isList(value) || isList(wanted)) {
    return isList(value) && isList(wanted) && fits(itemOf(value), itemOf(wanted));
  }
  if (value === 'WholeNumber' && wanted === 'Number') return true;
  if (value === 'Color' && wanted === 'Paint') return true;
  const valueClass = classOfType(value);
  const wantedClass = classOfType(wanted);
  return valueClass !== null && wantedClass !== null && isKindOf(valueClass, wantedClass);
}

/** Whether a number is within a parameter's limits. The runtime checks this when a block runs. */
export function inRange(value: number, range: NumberRange): boolean {
  if (range === 'portion') return value >= 0 && value <= 1;
  return range === 'positive' ? value > 0 : value >= 0;
}

export const CALL_PROBLEM_CODES = [
  'unknown_block',
  'missing_value',
  'unknown_value',
  'wrong_type',
] as const;
export type CallProblemCode = (typeof CALL_PROBLEM_CODES)[number];

/** A call that doesn't fit. As with `StageError`, the words are chosen from the code elsewhere. */
export interface CallProblem {
  readonly code: CallProblemCode;
  /** The parameter or detail it's about. */
  readonly name?: string;
}

export interface CallToCheck {
  readonly on: ApiClass;
  readonly name: string;
  /** Parameter name to the value's type, or `null` where the type can't be known yet. */
  readonly args: Readonly<Record<string, TypeName | null>>;
  readonly details?: Readonly<Record<string, TypeName | null>>;
}

/**
 * Checks one call against the metadata. The check on a whole program (spec 01, section 4.5)
 * walks the program and calls this; S2's `check` hook is where it plugs in.
 */
export function checkCall(call: CallToCheck): readonly CallProblem[] {
  const entry = findEntry(call.on, call.name);
  if (!entry) return [{ code: 'unknown_block' }];
  const problems: CallProblem[] = [];

  const fit = (name: string, given: TypeName | null, wanted: TypeName) => {
    if (given !== null && !fits(given, wanted)) problems.push({ code: 'wrong_type', name });
  };
  for (const { name, type } of entry.params) {
    const given = call.args[name];
    if (given === undefined) problems.push({ code: 'missing_value', name });
    else fit(name, given, type);
  }
  const params = new Set(entry.params.map((p) => p.name));
  for (const name of Object.keys(call.args)) {
    if (!params.has(name)) problems.push({ code: 'unknown_value', name });
  }
  for (const [name, given] of Object.entries(call.details ?? {})) {
    const detail = DETAILS[name];
    if (!detail || !entry.details.includes(name)) problems.push({ code: 'unknown_value', name });
    else fit(name, given, detail.type);
  }
  return problems;
}

const signature = (params: readonly ParamDef[]) =>
  params.map((p) => `${p.name}: ${p.type}`).join(', ');

function entryLine(entry: ApiEntry): string {
  const details = entry.details.map((d) => `${d}?`).join(', ');
  const inside = [signature(entry.params), details].filter(Boolean).join('; ');
  const returns = entry.kind === 'function' ? ` -> ${entry.returns}` : '';
  return `  ${entry.kind === 'function' ? 'func' : 'proc'} ${entry.name}(${inside})${returns}`;
}

/** Every block as compact text for the system prompt. It must stay under 40,000 tokens. */
export function catalogText(): string {
  const lines: string[] = [
    'Each line is a block, with its parameters and, after a semicolon, optional details.',
    'A class has its own blocks and those of the classes it extends.',
  ];
  for (const cls of API_CLASSES) {
    const own = ENTRIES.filter((e) => e.on === cls);
    const parent = CLASS_PARENTS[cls];
    lines.push('', parent ? `class ${cls} extends ${parent}` : `class ${cls}`);
    lines.push(...own.map(entryLine));
  }
  lines.push('', 'Events');
  for (const event of EVENTS) {
    const gives = event.gives.length > 0 ? ` gives ${signature(event.gives)}` : '';
    lines.push(`  ${event.name}(${signature(event.args)})${gives}`);
  }
  lines.push('', 'Values');
  for (const [name, values] of Object.entries(ENUMS)) {
    lines.push(`  ${name}: ${values.join(', ')}`);
  }
  return `${lines.join('\n')}\n`;
}
