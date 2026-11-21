/**
 * A statement row's pieces, left to right, so it reads like code (spec 14, section 3b): the
 * object, the Story API's words, and a pill for each value. Each value pill knows its place, so
 * the cascade can open on it (section 3e).
 */
import type { AstNode, Expression, NodeId, TypeRef } from '@storystage/ast';
import { DETAILS, findEntry } from '@storystage/story-api';
import {
  arrowFor,
  listenerWords,
  word,
  type Describer,
  type ValuePlace,
} from '@storystage/story-api/editing';
import { t } from './words.ts';

export type Part =
  | { readonly kind: 'text'; readonly text: string }
  /** A loop item's or local's name. */
  | { readonly kind: 'name'; readonly text: string }
  /** The object a block acts on: its own pill, drawn differently. */
  | { readonly kind: 'object'; readonly text: string; readonly node: NodeId }
  | {
      readonly kind: 'value';
      readonly text: string;
      /** Drawn after the text, hidden from screen readers: "left ↺" (`arrowOf`). */
      readonly arrow: string | null;
      /** The parameter or detail, in words, for screen readers ("amount"). */
      readonly label: string;
      readonly node: NodeId;
      readonly place: ValuePlace;
      readonly empty: boolean;
      /** A value that's a question (a function), drawn green. */
      readonly question: boolean;
      /**
       * A value made of others ("score + 1", "penguin distance to cat"): what's drawn inside its
       * pill, its own words (one `whole` part, its button) and a pill for each value in it, so
       * each can be changed on its own (spec 14, 3b.1). Null for a value of one piece.
       */
      readonly inner: readonly Part[] | null;
    }
  /** A value's own words, inside its pill: the button that opens the whole value's menu. */
  | { readonly kind: 'whole'; readonly text: string; readonly node: NodeId };

const PLACEHOLDER = /\{(\w+)\}/g;

/** A phrase split at its `{placeholders}`, each filled by `fill`. */
function phraseParts(phrase: string, fill: (name: string) => Part | null): Part[] {
  const parts: Part[] = [];
  let at = 0;
  for (const m of phrase.matchAll(PLACEHOLDER)) {
    const text = phrase.slice(at, m.index).trim();
    if (text) parts.push({ kind: 'text', text });
    const filled = fill(m[1]!);
    if (filled) parts.push(filled);
    at = m.index + m[0].length;
  }
  const rest = phrase.slice(at).trim();
  if (rest) parts.push({ kind: 'text', text: rest });
  return parts;
}

const placeIn = (node: NodeId, slot: string, param?: string): ValuePlace => ({
  kind: 'value',
  node,
  slot,
  ...(param === undefined ? {} : { param }),
});

/** A value's pill, with the pills inside it if it's made of others. */
function valuePart(
  e: Expression | undefined,
  place: ValuePlace,
  label: string,
  describe: Describer,
  self: TypeRef,
): Part | null {
  if (!e) return null;
  return {
    kind: 'value',
    text: describe(e),
    arrow: arrowFor(e),
    label,
    node: e.id,
    place,
    empty: e.kind === 'none',
    question: e.kind === 'functionCall',
    inner: innerOf(e, describe, self),
  };
}

/** The phrase placeholders inside a value, and the slot and words each stands for. */
const SLOTS: Record<string, { slot: string; label: string }> = {
  left: { slot: 'left', label: 'slot.left' },
  right: { slot: 'right', label: 'slot.right' },
  value: { slot: 'value', label: 'slot.value' },
  index: { slot: 'index', label: 'slot.index' },
  list: { slot: 'array', label: 'slot.items' },
};

/**
 * The parts inside a value made of others, or null. Its first words become its `whole` part,
 * with the object a question is asked of in front, so the row still reads as it's written and
 * its name is still the words it shows (3f.2).
 */
function innerOf(e: Expression, describe: Describer, self: TypeRef): Part[] | null {
  const pill = (x: Expression | undefined, slot: string, label: string, param?: string) =>
    valuePart(x, placeIn(e.id, slot, param), label, describe, self);
  const phrase = (key: string) =>
    withWhole(
      phraseParts(word(key), (name) => {
        const s = SLOTS[name];
        const held = (e as unknown as Record<string, Expression | undefined>)[s?.slot ?? ''];
        return s ? pill(held, s.slot, t(s.label)) : null;
      }),
      e.id,
    );
  switch (e.kind) {
    case 'arithmetic':
    case 'compare':
    case 'logic':
      return phrase(`words.${e.op}`);
    case 'join':
      return phrase('words.join');
    case 'not':
      return phrase('words.not');
    case 'arrayItem':
      return phrase('words.item');
    case 'arrayLength':
      return phrase('words.length');
    case 'arrayOf': {
      // The AST sets a list as a whole, so choosing an item makes the list again with that item
      // changed (`setValue`).
      const items = e.items.flatMap((x, i) => pill(x, 'items', t('slot.item'), String(i)) ?? []);
      const words = word('words.list').replace('{items}', '').trim();
      return withWhole([{ kind: 'text', text: words }, ...items], e.id);
    }
    case 'functionCall': {
      const target = describe(e.target);
      const details = Object.entries(e.details).flatMap(([name, x]) => {
        const label = word(`detail.${name}`);
        const part = pill(x, 'details', label, name);
        return part ? [{ kind: 'text', text: label } as Part, part] : [];
      });
      const { types } = describe;
      if (e.callee.kind === 'user') {
        const method = types.methods.get(e.callee.method)?.method;
        const params = (method?.params ?? []).flatMap((p) => {
          const part = pill(e.args[p.id], 'args', p.name, p.id);
          return part ? [{ kind: 'text', text: p.name } as Part, part] : [];
        });
        return withWhole([...params, ...details], e.id, `${target} ${method?.name ?? ''}`);
      }
      const cls = types.classOf(types.typeOf(e.target, self));
      const entry = cls && findEntry(cls, e.callee.name);
      const words = entry ? word(`entry.${entry.on}.${entry.name}`) : e.callee.name;
      const parts = phraseParts(words, (name) =>
        pill(e.args[name], 'args', word(`param.${name}`), name),
      );
      return withWhole([...parts, ...details], e.id, target);
    }
    default:
      return null;
  }
}

/**
 * Parts with their first words made the value's `whole` part (`lead`, and the words after it
 * if they come first), or null if no value is inside: a question with nothing to fill is one pill.
 */
function withWhole(parts: Part[], node: NodeId, lead?: string): Part[] | null {
  if (!parts.some((p) => p.kind === 'value')) return null;
  const first = parts[0];
  if (lead !== undefined) {
    const words = first?.kind === 'text';
    const text = words ? `${lead} ${first.text}` : lead;
    return [{ kind: 'whole', text: text.trim(), node }, ...(words ? parts.slice(1) : parts)];
  }
  const at = parts.findIndex((p) => p.kind === 'text');
  if (at < 0) return null;
  return parts.map((p, i) => (i === at ? { kind: 'whole', text: p.text, node } : p));
}

/** The pieces of a statement's row (and of a container's header row). */
export function partsOf(node: AstNode, describe: Describer): readonly Part[] {
  const owner = describe.ownerOf(node.id);
  const self: TypeRef = owner ? { kind: 'user', type: owner } : { kind: 'story', name: 'Scene' };
  const { types } = describe;

  const value = (e: Expression | undefined, place: ValuePlace, label: string) =>
    valuePart(e, place, label, describe, self);
  const at = (slot: string, param?: string): ValuePlace => placeIn(node.id, slot, param);

  switch (node.kind) {
    case 'call': {
      const target: Part = { kind: 'object', text: describe(node.target), node: node.target.id };
      const details = Object.entries(node.details).flatMap(([name, e]) => {
        // A speak line's script line (spec 06, 4.1) is set by the script, not changed here.
        if (DETAILS[name]?.fromScript)
          return [{ kind: 'text', text: word('words.fromScript') } as Part];
        const label = word(`detail.${name}`);
        const pill = value(e, at('details', name), label);
        return pill ? [{ kind: 'text', text: label } as Part, pill] : [];
      });
      if (node.callee.kind === 'user') {
        const method = types.methods.get(node.callee.method)?.method;
        const params = (method?.params ?? []).flatMap((p) => {
          const pill = value(node.args[p.id], at('args', p.id), p.name);
          return pill ? [{ kind: 'text', text: p.name } as Part, pill] : [];
        });
        return [target, { kind: 'text', text: method?.name ?? '' }, ...params, ...details];
      }
      const cls = types.classOf(types.typeOf(node.target, self));
      const entry = cls && findEntry(cls, node.callee.name);
      const phrase = entry ? word(`entry.${entry.on}.${entry.name}`) : node.callee.name;
      const parts = phraseParts(phrase, (name) =>
        value(node.args[name], at('args', name), word(`param.${name}`)),
      );
      return [target, ...parts, ...details];
    }
    case 'doInOrder':
    case 'doTogether':
      return [{ kind: 'text', text: word(`control.${node.kind}`) }];
    case 'count':
      return phraseParts(word('control.count'), () =>
        value(node.times, at('times'), t('slot.times')),
      );
    case 'while':
    case 'if':
      return phraseParts(word(`control.${node.kind}`), () =>
        value(node.condition, at('condition'), t('slot.condition')),
      );
    case 'forEach':
    case 'eachTogether':
      return phraseParts(word(`control.${node.kind}`), (name) =>
        name === 'item'
          ? { kind: 'name', text: node.item.name }
          : value(node.items, at('items'), t('slot.items')),
      );
    case 'local':
      return phraseParts(word('control.local'), (name) =>
        name === 'name'
          ? { kind: 'name', text: node.name }
          : value(node.value, at('value'), node.name),
      );
    case 'assign':
      return phraseParts(word('control.assign'), (name) =>
        name === 'target'
          ? value(node.target, at('target'), t('slot.target'))
          : value(node.value, at('value'), t('slot.value')),
      );
    case 'comment':
      return [{ kind: 'text', text: node.text }];
    case 'listener':
      return phraseParts(listenerWords(node.event), (name) =>
        value(node.args[name], at('args', name), word(`param.${name}`)),
      );
    case 'return':
      return node.value
        ? phraseParts(word('control.return'), () =>
            value(node.value!, at('value'), t('slot.value')),
          )
        : [{ kind: 'text', text: word('control.returnNothing') }];
    default:
      return [{ kind: 'text', text: describe(node) }];
  }
}
