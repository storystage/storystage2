/**
 * Spec 14, sections 2.4 and 3f: any statement or value in plain words, from the Story API's
 * phrases ("cat move forward 1"). The tile editor's rows, both editors' screen-reader names and
 * the undo labels all read from here, so they say the same thing.
 */
import type {
  AstNode,
  Expression,
  ListenerDecl,
  NodeId,
  Program,
  Statement,
  TypeRef,
} from '@storystage/ast';
import { findEntry } from '../catalog/catalog.ts';
import type { ProgramTypes } from '../catalog/program-types.ts';
import { indexOf, perProgram, typesOf } from './cache.ts';
import { isSceneScriptIn } from './scene-script.ts';
import strings from '../strings/en-GB.json' with { type: 'json' };

const all = strings as Readonly<Record<string, string>>;

/** The words for a key in the strings file. */
export const word = (key: string): string => all[key] ?? key;

/**
 * A listener's words, with `{name}` for each value it's given: the event's own, except where a
 * listener reads differently from the event in general. A scene's own `sceneStart` listener is
 * "also when the scene starts", as its script method is "When the scene starts" (spec 14, 2).
 */
export const listenerWords = (event: string): string =>
  all[`listener.${event}`] ?? word(`event.${event}`);

/**
 * A listener's own words: its event's, or its own phrase when it has a detail that says what it
 * waits for, as a click's objects do ("when {setOfVisuals} is clicked", the owner, 23 Nov 2026).
 */
export function listenerPhrase(listener: Pick<ListenerDecl, 'event' | 'details'>): string {
  for (const detail of Object.keys(listener.details)) {
    const phrase = all[`listener.${listener.event}.${detail}`];
    if (phrase) return phrase;
  }
  return listenerWords(listener.event);
}

/** `{name}` in a phrase filled from `values`; a missing value is "???". */
export const fill = (phrase: string, values: Readonly<Record<string, string>>): string =>
  phrase.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? word('words.empty'));

/**
 * The arrow drawn after a value's words, or null: Blockly Games' turning arrows on left and right
 * (↺ ↻), as children often mix the two up (owner, 16 Nov 2026). Drawn only: a screen reader
 * reads ↺ as "anticlockwise open circle arrow", so names and undo labels keep the plain words.
 */
export function arrowOf(type: string, value: string): string | null {
  return all[`arrow.${type}.${value}`] ?? null;
}

/** The arrow for a value in the program, if it has one (`arrowOf`). */
export const arrowFor = (e: Expression): string | null =>
  e.kind === 'enum' ? arrowOf(e.type, e.value) : null;

/** `leftLowerArm` as "left lower arm", for a joint with no words of its own. */
export const splitWords = (id: string): string =>
  id.replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();

/** The Story API types whose values are references written as text (Story API section 8). */
export const REFERENCE_TYPES = ['Paint', 'Audio', 'SceneId', 'AnimationClip'] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

export interface WordsOptions {
  /** The joint map's word for a joint ("left elbow"); without it, the id is split into words. */
  readonly jointWord?: (joint: string) => string;
  /**
   * The words for a reference written as text: a sound's label for `sn1` or a shelf sound's
   * Backstage id (workplan 7.17), a scene's name for its id. Without it, or when it gives
   * nothing, the text is shown as it is.
   */
  readonly referenceWord?: (type: ReferenceType, value: string) => string | undefined;
}

const isReference = (name: string): name is ReferenceType =>
  (REFERENCE_TYPES as readonly string[]).includes(name);

/** The reference type a place of type `wanted` takes, or `null` for any other type. */
const referenceIn = (wanted: TypeRef): ReferenceType | null =>
  wanted.kind === 'story' && isReference(wanted.name) ? wanted.name : null;

/**
 * The reference type the value `id` is written for, from the place it's in: a block's argument,
 * an input's, a variable's starting value, an item in a list of them. `null` if it isn't in such a place.
 */
export function referenceTypeAt(program: Program, id: NodeId): ReferenceType | null {
  const index = indexOf(program);
  const at = index.get(id);
  const holder = at?.parent ? index.get(at.parent)?.node : undefined;
  if (!at || !holder) return null;
  const types = typesOf(program);
  let wanted: TypeRef | null = null;
  switch (holder.kind) {
    case 'call':
    case 'functionCall': {
      if (at.slot !== 'args' || typeof at.key !== 'string') break;
      if (holder.callee.kind === 'user') {
        const method = types.methods.get(holder.callee.method)?.method;
        wanted = method?.params.find((p) => p.id === at.key)?.type ?? null;
        break;
      }
      let owner: NodeId | null = null;
      for (let up = index.get(holder.id); up; up = up.parent ? index.get(up.parent) : undefined)
        if (up.node.kind === 'type') {
          owner = up.node.id;
          break;
        }
      const self: TypeRef = owner
        ? { kind: 'user', type: owner }
        : { kind: 'story', name: 'Scene' };
      const cls = types.classOf(types.typeOf(holder.target, self));
      const param = (cls ? findEntry(cls, holder.callee.name) : undefined)?.params.find(
        (p) => p.name === at.key,
      );
      wanted = param ? { kind: 'story', name: param.type } : null;
      break;
    }
    case 'local':
      wanted = at.slot === 'value' ? holder.type : null;
      break;
    case 'field':
      wanted = at.slot === 'initial' ? holder.type : null;
      break;
    case 'parameter':
      wanted = at.slot === 'default' ? holder.type : null;
      break;
    case 'arrayOf':
      // One of a list's items, of the list's own item type: a list of sounds (S4's review).
      wanted = at.slot === 'items' ? holder.of : null;
      break;
  }
  return wanted ? referenceIn(wanted) : null;
}

const numberWords = (value: number): string => String(Number(value.toFixed(6)));

const BINARY = new Set(['arithmetic', 'compare', 'logic', 'join']);

export interface Describer {
  /** Words for a statement or value anywhere in the program. */
  (node: AstNode): string;
  /**
   * Words for a statement or value not yet in the program, inside the type `self`. `wanted` is
   * the type of the place a value is for, so a sound on its own still reads by its label.
   */
  inside(node: AstNode, self: NodeId, wanted?: TypeRef | null): string;
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
  // Without options, one describer for each program; with them, one for each program and
  // options object, so an editor's rows share one (3h). Options are never changed once made.
  const given = Object.values(options).some((v) => v !== undefined);
  if (!given) return plain(program);
  let made = withOptions.get(options);
  if (!made) withOptions.set(options, (made = perProgram((p) => describe(p, options))));
  return made(program);
}

const plain = perProgram((program) => describe(program, {}));
const withOptions = new WeakMap<WordsOptions, (program: Program) => Describer>();

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
  /** The inputs whose defaults are being read: a default can call its own procedure. */
  const reading = new Set<NodeId>();

  /** `wanted`: the type of the place `e` is in, when whoever holds it knows. */
  function value(e: Expression, self: TypeRef, wanted?: TypeRef | null): string {
    const part = (x: Expression, of?: TypeRef) => {
      const text = value(x, self, of);
      return BINARY.has(x.kind) ? `(${text})` : text;
    };
    switch (e.kind) {
      case 'number':
      case 'wholeNumber':
        return numberWords(e.value);
      case 'boolean':
        return word(e.value ? 'words.true' : 'words.false');
      case 'text': {
        // A sound or a scene is written as its id, and shown by its name (7.17). Its place
        // says which: the holder's, as a block may not be in the program yet, else the program's.
        if (!options.referenceWord) return e.value;
        const type = wanted ? referenceIn(wanted) : referenceTypeAt(program, e.id);
        return (type && options.referenceWord(type, e.value)) ?? e.value;
      }
      case 'enum':
        return e.type === 'JointId' ? joint(e.value) : word(`value.${e.type}.${e.value}`);
      case 'none':
        return word('words.empty');
      case 'this':
        if (isScene(self)) return word('words.scene');
        // In a learner's class, the character it's for: "this penguin" (decision 0074).
        return self.kind === 'user'
          ? fill(word('words.thisOne'), { type: splitWords(nameOf(self.type)) })
          : word('words.this');
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
          : fill(word('words.list'), { items: e.items.map((x) => part(x, e.of)).join(', ') });
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
    if (node.callee.kind === 'user') {
      const found = types.methods.get(node.callee.method);
      const method = found?.method;
      if (!method) return target;
      // The scene's own script: it has no name to learners but "When the scene starts" (3a).
      // The target stays in front, as every call has it, in both editors.
      if (isSceneScriptIn(found.owner, method))
        return `${target} ${word('method.sceneScriptAgain')}`;
      const owner: TypeRef = { kind: 'user', type: found.owner.id };
      const values = method.params.map((p) => {
        const v = node.args[p.id];
        let said = word('words.empty');
        if (v) said = value(v, self, p.type);
        else if (p.default && !reading.has(p.id)) {
          // Left out, so it runs with its default, where `this` is the procedure's own.
          reading.add(p.id);
          said = value(p.default, owner, p.type);
          reading.delete(p.id);
        }
        return `${p.name} ${said}`;
      });
      return [target, method.name, ...values].join(' ');
    }
    const cls = types.classOf(types.typeOf(node.target, self));
    const entry = cls && findEntry(cls, node.callee.name);
    const phrase = entry ? word(`entry.${entry.on}.${entry.name}`) : node.callee.name;
    const given = Object.fromEntries(
      Object.entries(node.args).map(([name, v]) => {
        const type = entry?.params.find((p) => p.name === name)?.type;
        return [name, value(v, self, type ? { kind: 'story', name: type } : null)];
      }),
    );
    return `${target} ${fill(phrase, given)}`;
  }

  function statement(s: AstNode, self: TypeRef, wanted?: TypeRef | null): string {
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
        return fill(word('control.local'), { name: s.name, value: value(s.value, self, s.type) });
      case 'assign':
        return fill(word('control.assign'), { target: v(s.target), value: v(s.value) });
      case 'comment':
        return fill(word('control.comment'), { text: s.text });
      case 'return':
        return s.value
          ? fill(word('control.return'), { value: v(s.value) })
          : word('control.returnNothing');
      case 'listener': {
        // A list of what's clicked reads as its objects: "cat or chair".
        const values = given(s.args, self);
        for (const [name, e] of Object.entries(s.details))
          values[name] =
            e.kind === 'arrayOf' && e.items.length > 0
              ? e.items
                  .map((x) => value(x, self, e.of))
                  .reduce((left, right) => fill(word('words.or'), { left, right }))
              : value(e, self);
        return fill(listenerPhrase(s), values);
      }
      case 'type':
      case 'field':
      case 'method':
      case 'parameter':
      case 'loopItem':
        return s.name;
      default:
        return value(s as Expression, self, wanted);
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
    if (node.callee.kind === 'user') {
      const found = types.methods.get(node.callee.method);
      if (found && isSceneScriptIn(found.owner, found.method))
        return `${target} ${word('method.sceneScriptAgain')}`;
      return `${target} ${found?.method.name ?? ''}`.trim();
    }
    const cls = types.classOf(types.typeOf(node.target, self));
    const entry = cls && findEntry(cls, node.callee.name);
    const phrase = entry ? word(`entry.${entry.on}.${entry.name}`) : node.callee.name;
    return `${target} ${phrase.split('{')[0]!.trim()}`.trim();
  };
  Object.assign(describe, {
    inside: (node: AstNode, self: NodeId, wanted?: TypeRef | null) =>
      statement(node, { kind: 'user', type: self }, wanted),
    short,
    ownerOf,
    types,
  });
  return describe;
}
