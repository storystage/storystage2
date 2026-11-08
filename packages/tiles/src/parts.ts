/**
 * A statement row's pieces, left to right, so it reads like code (spec 14, section 3b): the
 * object, the Story API's words, and a pill for each value. Each value pill knows its place, so
 * the cascade can open on it (section 3e).
 */
import type { AstNode, Expression, NodeId, TypeRef } from '@storystage/ast';
import { findEntry } from '@storystage/story-api';
import { word, type Describer, type ValuePlace } from '@storystage/story-api/editing';
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
      /** The parameter or detail, in words, for screen readers ("amount"). */
      readonly label: string;
      readonly node: NodeId;
      readonly place: ValuePlace;
      readonly empty: boolean;
      /** A value that's a question (a function), drawn green. */
      readonly question: boolean;
    };

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

/** The pieces of a statement's row (and of a container's header row). */
export function partsOf(node: AstNode, describe: Describer): readonly Part[] {
  const owner = describe.ownerOf(node.id);
  const self: TypeRef = owner ? { kind: 'user', type: owner } : { kind: 'story', name: 'Scene' };
  const { types } = describe;

  const value = (e: Expression | undefined, place: ValuePlace, label: string): Part | null =>
    e
      ? {
          kind: 'value',
          text: describe(e),
          label,
          node: e.id,
          place,
          empty: e.kind === 'none',
          question: e.kind === 'functionCall',
        }
      : null;
  const at = (slot: string, param?: string): ValuePlace => ({
    kind: 'value',
    node: node.id,
    slot,
    ...(param === undefined ? {} : { param }),
  });

  switch (node.kind) {
    case 'call': {
      const target: Part = { kind: 'object', text: describe(node.target), node: node.target.id };
      const details = Object.entries(node.details).flatMap(([name, e]) => {
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
