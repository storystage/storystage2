/**
 * Spec 14, sections 2.4 and 3f: any statement or value in plain words, from the Story API's
 * phrases ("cat move forward 1"). The tile editor's rows, both editors' screen-reader names and
 * the undo labels all read from here, so they say the same thing.
 */
import type { AstNode, Expression, NodeId, Program, Statement, TypeRef } from '@storystage/ast';
import { findEntry } from '../catalog/catalog.ts';
import type { ProgramTypes } from '../catalog/program-types.ts';
import { indexOf, perProgram, typesOf } from './cache.ts';
import strings from '../strings/en-GB.json' with { type: 'json' };

const all = strings as Readonly<Record<string, string>>;

/** The words for a key in the strings file. */
export const word = (key: string): string => all[key] ?? key;

/** `{name}` in a phrase filled from `values`; a missing value is "???". */
export const fill = (phrase: string, values: Readonly<Record<string, string>>): string =>
  phrase.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? word('words.empty'));

/** `leftLowerArm` as "left lower arm", for a joint with no words of its own. */
export const splitWords = (id: string): string =>
  id.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();

export interface WordsOptions {
  /** The joint map's word for a joint ("left elbow"); without it, the id is split into words. */
  readonly jointWord?: (joint: string) => string;
}

const numberWords = (value: number): string => String(Number(value.toFixed(6)));

const BINARY = new Set(['arithmetic', 'compare', 'logic', 'join']);

export interface Describer {
  /** Words for a statement or value anywhere in the program. */
  (node: AstNode): string;
  /** Words for a statement or value not yet in the program, inside the type `self`. */
  inside(node: AstNode, self: NodeId): string;
  /** A block's short name, without its values: "cat move", "do together". */
  short(node: AstNode): string;
  /** The type a node is inside, or null for one not in the program. */
  ownerOf(id: NodeId): NodeId | null;
  readonly types: ProgramTypes;
}

/**
 * Plain words for the nodes of one program. Without options, the same program always gets the
 * same describer, so asking for one per row costs nothing (spec 14, 3h).
 */
export function describer(program: Program, options: WordsOptions = {}): Describer {
  return options.jointWord ? describe(program, options) : plain(program);
}

const plain = perProgram((program) => describe(program, {}));

function describe(program: Program, options: WordsOptions): Describer {
  const index = indexOf(program);
  const types = typesOf(program);
  const joint = (id: string) => options.jointWord?.(id) ?? splitWords(id);

  /** The type a node is inside, so `this` can be read. */
  const ownerOf = (id: NodeId): NodeId | null => {
    for (let at = index.get(id); at; at = at.parent ? index.get(at.parent) : undefined)
      if (at.node.kind === 'type') return at.node.id;
    return null;
  };
  const nameOf = (id: NodeId) => {
    const node = index.get(id)?.node;
    return node && 'name' in node ? node.name : word('words.empty');
  };
  const isScene = (self: TypeRef) => types.classOf(self) === 'Scene';

  function value(e: Expression, self: TypeRef): string {
    const part = (x: Expression) => {
      const text = value(x, self);
      return BINARY.has(x.kind) ? `(${text})` : text;
    };
    switch (e.kind) {
      case 'number':
      case 'wholeNumber':
        return numberWords(e.value);
      case 'boolean':
        return word(e.value ? 'words.true' : 'words.false');
      case 'text':
        return e.value;
      case 'enum':
        return e.type === 'JointId' ? joint(e.value) : word(`value.${e.type}.${e.value}`);
      case 'none':
        return word('words.empty');
      case 'this':
        return word(isScene(self) ? 'words.scene' : 'words.this');
      case 'fieldRef': {
        const field = types.fields.get(e.field)?.name ?? word('words.empty');
        return e.target.kind === 'this'
          ? field
          : fill(word('words.of'), { owner: value(e.target, self), part: field });
      }
      case 'variableRef':
        return nameOf(e.variable);
      case 'functionCall':
        return call(e, self);
      case 'arithmetic':
      case 'compare':
      case 'logic':
        return fill(word(`words.${e.op}`), { left: part(e.left), right: part(e.right) });
      case 'join':
        return fill(word('words.join'), { left: part(e.left), right: part(e.right) });
      case 'not':
        return fill(word('words.not'), { value: part(e.value) });
      case 'arrayOf':
        return e.items.length === 0
          ? word('words.emptyList')
          : fill(word('words.list'), { items: e.items.map(part).join(', ') });
      case 'arrayItem':
        return fill(word('words.item'), { index: part(e.index), list: part(e.array) });
      case 'arrayLength':
        return fill(word('words.length'), { list: part(e.array) });
    }
  }

  function call(
    node: (Statement & { kind: 'call' }) | (Expression & { kind: 'functionCall' }),
    self: TypeRef,
  ) {
    const target = value(node.target, self);
    const given = (args: typeof node.args) =>
      Object.fromEntries(Object.entries(args).map(([k, v]) => [k, value(v, self)]));
    if (node.callee.kind === 'user') {
      const method = types.methods.get(node.callee.method)?.method;
      if (!method) return target;
      const values = method.params.map((p) => {
        const v = node.args[p.id];
        return `${p.name} ${v ? value(v, self) : word('words.empty')}`;
      });
      return [target, method.name, ...values].join(' ');
    }
    const cls = types.classOf(types.typeOf(node.target, self));
    const entry = cls && findEntry(cls, node.callee.name);
    const phrase = entry ? word(`entry.${entry.on}.${entry.name}`) : node.callee.name;
    return `${target} ${fill(phrase, given(node.args))}`;
  }

  function statement(s: AstNode, self: TypeRef): string {
    const v = (e: Expression) => value(e, self);
    switch (s.kind) {
      case 'call':
        return call(s, self);
      case 'doInOrder':
      case 'doTogether':
        return word(`control.${s.kind}`);
      case 'count':
        return fill(word('control.count'), { times: v(s.times) });
      case 'while':
      case 'if':
        return fill(word(`control.${s.kind}`), { condition: v(s.condition) });
      case 'forEach':
      case 'eachTogether':
        return fill(word(`control.${s.kind}`), { item: s.item.name, items: v(s.items) });
      case 'local':
        return fill(word('control.local'), { name: s.name, value: v(s.value) });
      case 'assign':
        return fill(word('control.assign'), { target: v(s.target), value: v(s.value) });
      case 'comment':
        return fill(word('control.comment'), { text: s.text });
      case 'return':
        return s.value
          ? fill(word('control.return'), { value: v(s.value) })
          : word('control.returnNothing');
      case 'listener':
        return fill(word(`event.${s.event}`), given(s.args, self));
      case 'type':
      case 'field':
      case 'method':
      case 'parameter':
      case 'loopItem':
        return s.name;
      default:
        return value(s as Expression, self);
    }
  }

  const given = (args: Readonly<Record<string, Expression>>, self: TypeRef) =>
    Object.fromEntries(Object.entries(args).map(([k, e]) => [k, value(e, self)]));

  const describe = ((node: AstNode) => {
    const owner = ownerOf(node.id);
    return statement(
      node,
      owner ? { kind: 'user', type: owner } : { kind: 'story', name: 'Scene' },
    );
  }) as Describer;
  const short = (node: AstNode) => {
    const owner = ownerOf(node.id);
    const self: TypeRef = owner ? { kind: 'user', type: owner } : { kind: 'story', name: 'Scene' };
    if (node.kind !== 'call' && node.kind !== 'functionCall') {
      const phrase = word(`control.${node.kind}`);
      return phrase.startsWith('control.') ? statement(node, self) : phrase.split('{')[0]!.trim();
    }
    const target = value(node.target, self);
    if (node.callee.kind === 'user')
      return `${target} ${types.methods.get(node.callee.method)?.method.name ?? ''}`.trim();
    const cls = types.classOf(types.typeOf(node.target, self));
    const entry = cls && findEntry(cls, node.callee.name);
    const phrase = entry ? word(`entry.${entry.on}.${entry.name}`) : node.callee.name;
    return `${target} ${phrase.split('{')[0]!.trim()}`.trim();
  };
  Object.assign(describe, {
    inside: (node: AstNode, self: NodeId) => statement(node, { kind: 'user', type: self }),
    short,
    ownerOf,
    types,
  });
  return describe;
}
