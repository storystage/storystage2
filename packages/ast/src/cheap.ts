/**
 * Checking an edit cheaply (`docs/spec/01-ast.md`, section 4.2; WP7.10): the depth and the rules
 * looked at only where an edit adds or takes away, when that's enough to be sure. The program
 * before the edit was valid, so what the edit leaves alone still is. Each of these only ever says
 * "certainly fine": anything it isn't sure of is checked over the whole program, so a refusal is
 * always the whole check's, in the same words.
 */
import type { EditOperation } from './edits.ts';
import type { NodeId } from './ids.ts';
import { isStatement, type AstNode, type TypeRef } from './nodes.ts';
import { MAX_DEPTH, isTooDeep } from './schema.ts';
import { childrenOf, shapeOf, walk, type Location } from './walk.ts';

type Index = ReadonlyMap<NodeId, Location>;

/** The depth of a type in the program's JSON: the program, its `types` list, then the type. */
const TYPE_DEPTH = 3;

/**
 * How deep a node sits in the program's JSON, as `isTooDeep` counts it: a list or a map is a
 * level of its own between a node and what it holds; a slot holding one node isn't.
 */
function depthOf(index: Index, id: NodeId): number {
  let depth = TYPE_DEPTH;
  for (let at = index.get(id); at && at.parent !== null; at = index.get(at.parent))
    depth += at.key === null ? 1 : 2;
  return depth;
}

/** What an edit puts in, and how deep the place it goes sits. */
function added(edit: EditOperation, index: Index): { part: unknown; depth: number } | null {
  switch (edit.kind) {
    case 'insert':
      return { part: edit.node, depth: depthOf(index, edit.parent) + 2 };
    case 'declare':
      return {
        part: edit.node,
        depth: edit.parent === null ? TYPE_DEPTH : depthOf(index, edit.parent) + 2,
      };
    case 'move':
      return { part: index.get(edit.node)?.node, depth: depthOf(index, edit.parent) + 2 };
    case 'setArgument': {
      if (edit.value === null) return null;
      const kind = index.get(edit.node)!.node.kind;
      const inMap = shapeOf(kind).maps?.includes(edit.slot) ?? false;
      return { part: edit.value, depth: depthOf(index, edit.node) + (inMap ? 2 : 1) };
    }
    case 'retype':
      // A field's type is a single slot, and a list type can hold lists to any depth.
      return { part: edit.type, depth: depthOf(index, edit.node) + 1 };
    default:
      // A name, a comment's words or switching off add no depth; taking out takes it away.
      return null;
  }
}

/** Whether the program after a made edit is too deep: only what it added can be. */
export function addsTooDeep(edit: EditOperation, index: Index): boolean {
  const what = added(edit, index);
  return what !== null && isTooDeep(what.part, MAX_DEPTH - what.depth + 1);
}

const declared = (index: Index, id: NodeId, kind: AstNode['kind']) =>
  index.get(id)?.node.kind === kind;

function typeKnown(ref: TypeRef, index: Index): boolean {
  if (ref.kind === 'array') return typeKnown(ref.of, index);
  return ref.kind !== 'user' || declared(index, ref.type, 'type');
}

/**
 * Whether a node needs nothing around it to keep the rules: it names no variable and declares
 * nothing, has no `return` (which depends on where it is) and calls no method of the learner's
 * (which depends on that method's parameters), and every field and type it names is there. Such a
 * node can go anywhere, or leave, without breaking a rule.
 */
function selfContained(node: AstNode, index: Index): boolean {
  switch (node.kind) {
    case 'number':
    case 'wholeNumber':
    case 'boolean':
    case 'text':
    case 'enum':
    case 'none':
    case 'this':
    case 'arithmetic':
    case 'compare':
    case 'logic':
    case 'not':
    case 'join':
    case 'arrayItem':
    case 'arrayLength':
    case 'doInOrder':
    case 'doTogether':
    case 'count':
    case 'while':
    case 'if':
    case 'comment':
      break;
    case 'fieldRef':
      if (!declared(index, node.field, 'field')) return false;
      break;
    case 'arrayOf':
      if (!typeKnown(node.of, index)) return false;
      break;
    case 'call':
    case 'functionCall':
      if (node.callee.kind !== 'story') return false;
      break;
    case 'assign':
      // Whether the target can be set is a rule: a field or a list's item always can.
      if (node.target.kind !== 'fieldRef' && node.target.kind !== 'arrayItem') return false;
      break;
    default:
      return false;
  }
  return childrenOf(node).every((child) => selfContained(child.node, index));
}

/** Every id in `node` is new: not in the program, unless `freed`, and not used twice in it. */
function fresh(node: AstNode, index: Index, freed: ReadonlySet<string> = new Set()): boolean {
  const seen = new Set<string>();
  let ok = true;
  walk(node, (inside) => {
    if (seen.has(inside.id) || (index.has(inside.id) && !freed.has(inside.id))) ok = false;
    seen.add(inside.id);
  });
  return ok;
}

const idsIn = (node: AstNode) => {
  const ids = new Set<string>();
  walk(node, (inside) => ids.add(inside.id));
  return ids;
};

/** Whether `node` or anything in it is a declaration: a local or a loop's item. */
const declares = (node: AstNode) => {
  let found = false;
  walk(node, (inside) => {
    if (inside.kind === 'local' || inside.kind === 'loopItem') found = true;
  });
  return found;
};

/**
 * Whether the rules a schema can't state certainly still hold after a made edit, from what it
 * changed alone. `false` means "check them all", not "broken".
 */
export function rulesStillHold(edit: EditOperation, index: Index): boolean {
  switch (edit.kind) {
    case 'insert':
      return selfContained(edit.node, index) && fresh(edit.node, index);
    case 'setArgument': {
      const { node } = index.get(edit.node)!;
      if (edit.value === null || (node.kind === 'assign' && edit.slot === 'target')) return false;
      const slot = (node as unknown as Record<string, unknown>)[edit.slot];
      const inMap = shapeOf(node.kind).maps?.includes(edit.slot) ?? false;
      const old = (inMap ? (slot as Record<string, AstNode | undefined>)[edit.param!] : slot) as
        AstNode | null | undefined;
      // A value in place of another keeps which values a call has, and whether a return or a
      // parameter has one.
      if (!old || !selfContained(edit.value, index)) return false;
      return fresh(edit.value, index, idsIn(old));
    }
    case 'remove': {
      const node = index.get(edit.node)?.node;
      return node !== undefined && isStatement(node) && !declares(node);
    }
    case 'move': {
      const node = index.get(edit.node)?.node;
      return node !== undefined && selfContained(node, index);
    }
    case 'setEnabled':
    case 'setComment':
      // No rule reads whether a statement is switched off, or a comment's words.
      return true;
    default:
      return false;
  }
}
