/**
 * Spec 14, section 2.3: the menu that asks for one value, as Alice's cascading menus do, with
 * only values that fit. After a drop, `emptySlots` says what to ask, in order; Escape at any
 * point cancels the whole drop, which is the editor's business.
 */
import type { AstNode, Expression, NodeId, Program, TypeRef } from '@storystage/ast';
import {
  entriesOf,
  findEntry,
  findEvent,
  inRange,
  isEnumName,
  isKindOf,
} from '../catalog/catalog.ts';
import { DETAILS } from '../catalog/details.ts';
import { BOOLEAN, NUMBER, storyType, WHOLE } from '../catalog/program-types.ts';
import { indexOf, typesOf } from './cache.ts';
import { ENUMS } from '../catalog/types.ts';
import type { NumberRange, ParamDef } from '../catalog/types.ts';
import type { ValuePlace } from './drop.ts';
import { describer, word, type WordsOptions } from './words.ts';

export type Ask = 'number' | 'wholeNumber' | 'text';

export interface Choice {
  readonly words: string;
  /** The value it puts in the slot. Absent when it asks (`ask`) or opens a submenu. */
  readonly value?: Expression;
  /** Asks the learner to type a value, checked by `answer`. */
  readonly ask?: Ask;
  readonly choices?: readonly Choice[];
  /** The one to offer first. */
  readonly suggested?: true;
}

export interface CascadeOptions extends WordsOptions {
  /** A jointed object's joints, from its model in the manifest (spec 02, section 5). */
  readonly jointsOf?: (field: NodeId) => readonly { readonly id: string; readonly words: string }[];
  /** Backstage surfaces, sounds, scenes and clips, written as text (spec 02, section 3a). */
  readonly references?: (type: 'Paint' | 'Audio' | 'SceneId' | 'AnimationClip') => readonly {
    readonly value: string;
    readonly words: string;
  }[];
}

const typeRef = (name: string): TypeRef =>
  name.endsWith('[]') ? { kind: 'array', of: typeRef(name.slice(0, -2)) } : storyType(name);

/** Alice's common numbers, and the one each starts on. */
const NUMBERS = [0.25, 0.5, 1, 2, 5, 10];
const WHOLE_NUMBERS = [1, 2, 3, 5, 10];
const SUGGESTED_VALUES: Readonly<Record<string, string>> = {
  MoveDirection: 'forward',
  TurnDirection: 'left',
  RollDirection: 'left',
  AnimationStyle: 'beginAndEndGently',
};

interface Context {
  readonly node: AstNode;
  readonly self: TypeRef;
  readonly param?: ParamDef;
}

/** The type a value slot wants, or null if it can't be known. */
export function wantedAt(program: Program, place: ValuePlace): TypeRef | null {
  return contextOf(program, place)?.wanted ?? null;
}

function contextOf(
  program: Program,
  place: ValuePlace,
): (Context & { wanted: TypeRef | null }) | null {
  const index = indexOf(program);
  const node = index.get(place.node)?.node;
  if (!node) return null;
  const describe = describer(program);
  const { types } = describe;
  const owner = describe.ownerOf(node.id);
  const self: TypeRef = owner ? { kind: 'user', type: owner } : storyType('Scene');
  const ofParams = (params: readonly ParamDef[], name?: string) =>
    params.find((p) => p.name === name);

  const at = (wanted: TypeRef | null, param?: ParamDef) => ({
    node,
    self,
    wanted,
    ...(param ? { param } : {}),
  });
  switch (node.kind) {
    case 'call':
    case 'functionCall': {
      if (place.slot === 'details' && place.param) {
        const detail = DETAILS[place.param];
        return at(detail ? typeRef(detail.type) : null);
      }
      if (place.slot !== 'args') return at(null);
      if (node.callee.kind === 'user') {
        const method = types.methods.get(node.callee.method)?.method;
        return at(method?.params.find((p) => p.id === place.param)?.type ?? null);
      }
      const cls = types.classOf(types.typeOf(node.target, self));
      const param = ofParams(
        findEntry(cls ?? 'Thing', node.callee.name)?.params ?? [],
        place.param,
      );
      return at(param ? typeRef(param.type) : null, param);
    }
    case 'listener': {
      const event = findEvent(node.event);
      if (place.slot === 'details' && place.param) {
        const detail = DETAILS[place.param];
        return at(detail ? typeRef(detail.type) : null);
      }
      const param = ofParams(event?.args ?? [], place.param);
      return at(param ? typeRef(param.type) : null, param);
    }
    case 'count':
      return at(WHOLE);
    case 'while':
    case 'if':
      return at(BOOLEAN);
    case 'forEach':
    case 'eachTogether':
      return at({ kind: 'array', of: node.item.type });
    case 'local':
      return at(node.type);
    case 'field':
    case 'parameter':
      return at(node.type);
    case 'assign':
      return at(place.slot === 'value' ? types.typeOf(node.target, self) : null);
    case 'arithmetic':
      return at(NUMBER);
    case 'compare':
      return at(node.op === 'equal' || node.op === 'notEqual' ? null : NUMBER);
    case 'logic':
    case 'not':
      return at(BOOLEAN);
    case 'arrayItem':
      return at(place.slot === 'index' ? WHOLE : null);
    case 'return': {
      for (let up = index.get(node.id); up; up = up.parent ? index.get(up.parent) : undefined)
        if (up.node.kind === 'method') return at(up.node.returns);
      return at(null);
    }
    default:
      return at(null);
  }
}

/** The variables a value at `node` can see: earlier locals, loop items and parameters. */
export function scopeAt(
  program: Program,
  node: NodeId,
): readonly { id: NodeId; name: string; type: TypeRef; assignable: boolean }[] {
  const index = indexOf(program);
  const found: { id: NodeId; name: string; type: TypeRef; assignable: boolean }[] = [];
  for (let at = index.get(node); at?.parent;) {
    const up = index.get(at.parent);
    if (!up) break;
    const holder = up.node as unknown as Record<string, unknown>;
    if (
      (at.slot === 'body' || at.slot === 'then' || at.slot === 'else') &&
      typeof at.key === 'number'
    ) {
      for (const s of (holder[at.slot] as AstNode[]).slice(0, at.key))
        if (s.kind === 'local')
          found.push({ id: s.id, name: s.name, type: s.type, assignable: s.constant !== true });
    }
    if ((up.node.kind === 'forEach' || up.node.kind === 'eachTogether') && at.slot === 'body')
      found.push({
        id: up.node.item.id,
        name: up.node.item.name,
        type: up.node.item.type,
        assignable: false,
      });
    if (up.node.kind === 'method' || up.node.kind === 'listener')
      for (const p of up.node.params)
        found.push({ id: p.id, name: p.name, type: p.type, assignable: true });
    at = up;
  }
  return found;
}

/** The menu for one value slot. Every value in it fits the slot. */
export function cascadeFor(
  program: Program,
  place: ValuePlace,
  mint: () => NodeId,
  options: CascadeOptions = {},
): readonly Choice[] {
  const context = contextOf(program, place);
  if (!context?.wanted) return [];
  const { wanted, self, node } = context;
  const describe = describer(program, options);
  const { types } = describe;
  const selfId = self.kind === 'user' ? self.type : null;
  const scene = selfId ? types.types.get(selfId) : undefined;
  const thisValue = (): Expression => ({ id: mint(), kind: 'this' });
  const fieldValue = (field: NodeId): Expression => ({
    id: mint(),
    kind: 'fieldRef',
    target: thisValue(),
    field,
  });

  const variables = scopeAt(program, place.node)
    .filter((v) => types.typeFits(v.type, wanted))
    .map((v): Choice => ({
      words: v.name,
      value: { id: mint(), kind: 'variableRef', variable: v.id },
    }));

  const suggestedNumber = () => {
    const turning =
      node.kind === 'call' &&
      node.callee.kind === 'story' &&
      ['turn', 'roll'].includes(node.callee.name);
    return turning && place.param === 'amount' ? 0.25 : 1;
  };

  if (wanted.kind === 'array') {
    return [
      ...variables,
      {
        words: word('cascade.newList'),
        value: { id: mint(), kind: 'arrayOf', of: wanted.of, items: [] },
      },
    ];
  }

  const name = wanted.kind === 'story' ? wanted.name : null;
  if (name === 'JointId') {
    const target = (node.kind === 'call' || node.kind === 'functionCall') && node.target;
    const joints =
      target && target.kind === 'fieldRef' ? (options.jointsOf?.(target.field) ?? []) : [];
    return joints.map((j) => ({
      words: j.words,
      value: { id: mint(), kind: 'enum', type: 'JointId', value: j.id },
    }));
  }
  if (name && isEnumName(name)) {
    const suggested = SUGGESTED_VALUES[name];
    return [
      ...ENUMS[name].map((v): Choice => ({
        words: word(`value.${name}.${v}`),
        value: { id: mint(), kind: 'enum', type: name, value: v },
        ...(v === suggested ? { suggested: true as const } : {}),
      })),
      ...variables,
    ];
  }
  if (name === 'Number' || name === 'WholeNumber') {
    const whole = name === 'WholeNumber';
    const start = whole ? 1 : suggestedNumber();
    return [
      ...(whole ? WHOLE_NUMBERS : NUMBERS).map((n): Choice => ({
        words: String(n),
        value: { id: mint(), kind: whole ? 'wholeNumber' : 'number', value: n },
        ...(n === start ? { suggested: true as const } : {}),
      })),
      {
        words: word(whole ? 'cascade.otherWholeNumber' : 'cascade.otherNumber'),
        ask: whole ? 'wholeNumber' : 'number',
      },
      ...variables,
    ];
  }
  if (name === 'Text') return [{ words: word('cascade.otherWords'), ask: 'text' }, ...variables];
  if (name === 'Boolean') {
    const objects: Choice[] = [];
    for (const field of scene?.fields ?? []) {
      const cls = types.classOf(field.type);
      if (!cls) continue;
      const questions = entriesOf(cls)
        .filter((e) => e.kind === 'function' && e.returns === 'Boolean')
        .map((e): Choice => {
          const value: Expression = {
            id: mint(),
            kind: 'functionCall',
            target: fieldValue(field.id),
            callee: { kind: 'story', name: e.name },
            args: Object.fromEntries(
              e.params.map((p) => [p.name, { id: mint(), kind: 'none' } as Expression]),
            ),
            details: {},
          };
          return { words: describe.inside(value, selfId!), value };
        });
      if (questions.length > 0) objects.push({ words: field.name, choices: questions });
    }
    return [
      {
        words: word('words.true'),
        value: { id: mint(), kind: 'boolean', value: true },
        suggested: true,
      },
      { words: word('words.false'), value: { id: mint(), kind: 'boolean', value: false } },
      ...objects,
      ...variables,
    ];
  }
  if (name === 'Paint' || name === 'Audio' || name === 'SceneId' || name === 'AnimationClip') {
    const colours =
      name === 'Paint'
        ? ENUMS.Color.map((c): Choice => ({
            words: word(`value.Color.${c}`),
            value: { id: mint(), kind: 'enum', type: 'Color', value: c },
          }))
        : [];
    const references = (options.references?.(name) ?? []).map((r): Choice => ({
      words: r.words,
      value: { id: mint(), kind: 'text', value: r.value },
    }));
    return [...colours, ...references, ...variables];
  }

  const wantedClass = types.classOf(wanted);
  if (!wantedClass) return variables;
  const objects: Choice[] = [];
  for (const field of scene?.fields ?? []) {
    const fieldClass = types.classOf(field.type);
    const fitsWhole = types.typeFits(field.type, wanted);
    const joints =
      fieldClass && isKindOf(fieldClass, 'JointedModel') && isKindOf('Joint', wantedClass)
        ? (options.jointsOf?.(field.id) ?? []).map((j): Choice => ({
            words: j.words,
            value: {
              id: mint(),
              kind: 'functionCall',
              target: fieldValue(field.id),
              callee: { kind: 'story', name: 'getJoint' },
              args: { joint: { id: mint(), kind: 'enum', type: 'JointId', value: j.id } },
              details: {},
            },
          }))
        : [];
    if (!fitsWhole && joints.length === 0) continue;
    objects.push({
      words: field.name,
      ...(fitsWhole ? { value: fieldValue(field.id) } : {}),
      ...(joints.length > 0 ? { choices: joints } : {}),
    });
  }
  const self_ =
    scene && types.typeFits(self, wanted)
      ? [{ words: describe.inside(thisValue(), scene.id), value: thisValue() }]
      : [];
  return [...objects, ...self_, ...variables];
}

/** The value slots of a new block still waiting for a value, in the order to ask them. */
export function emptySlots(node: AstNode): readonly ValuePlace[] {
  if (node.kind !== 'call' && node.kind !== 'functionCall') {
    const holder = node as unknown as Record<string, Expression | undefined>;
    return ['times', 'condition', 'items', 'value']
      .filter((slot) => holder[slot]?.kind === 'none')
      .map((slot) => ({ kind: 'value', node: node.id, slot }));
  }
  return Object.entries(node.args)
    .filter(([, v]) => v.kind === 'none')
    .map(([param]) => ({ kind: 'value', node: node.id, slot: 'args', param }));
}

/** The details a block hasn't been given yet, for "add detail ▾". */
export function detailsToAdd(
  program: Program,
  node: NodeId,
): readonly { name: string; words: string }[] {
  const found = indexOf(program).get(node)?.node;
  if (!found) return [];
  const types = typesOf(program);
  let offered: readonly string[] = [];
  if ((found.kind === 'call' || found.kind === 'functionCall') && found.callee.kind === 'story') {
    const owner = describer(program).ownerOf(found.id);
    const self: TypeRef = owner ? { kind: 'user', type: owner } : storyType('Scene');
    const cls = types.classOf(types.typeOf(found.target, self));
    offered = (cls && findEntry(cls, found.callee.name)?.details) ?? [];
  } else if (found.kind === 'listener') {
    offered = findEvent(found.event)?.details ?? [];
  }
  const given = 'details' in found ? Object.keys(found.details) : [];
  return offered
    .filter((d) => !given.includes(d) && !DETAILS[d]?.fromScript)
    .map((name) => ({ name, words: word(`detail.${name}`) }));
}

export type Answer =
  | { readonly ok: true; readonly value: Expression }
  | { readonly ok: false; readonly reason: string };

/** A value the learner typed for "Other number…" or "Other words…", checked against its limit. */
export function answer(ask: Ask, text: string, mint: () => NodeId, range?: NumberRange): Answer {
  if (ask === 'text') return { ok: true, value: { id: mint(), kind: 'text', value: text } };
  const n = Number(text.trim().replace(',', '.'));
  if (text.trim() === '' || !Number.isFinite(n))
    return { ok: false, reason: word('answer.notANumber') };
  if (ask === 'wholeNumber' && !Number.isInteger(n))
    return { ok: false, reason: word('answer.notWhole') };
  if (range && !inRange(n, range)) return { ok: false, reason: word(`answer.${range}`) };
  return {
    ok: true,
    value: { id: mint(), kind: ask === 'wholeNumber' ? 'wholeNumber' : 'number', value: n },
  };
}

/** The limit on the value at `place`, if its parameter or detail has one. */
export function rangeAt(program: Program, place: ValuePlace): NumberRange | undefined {
  if (place.slot === 'details' && place.param) return DETAILS[place.param]?.range;
  return contextOf(program, place)?.param?.range;
}
