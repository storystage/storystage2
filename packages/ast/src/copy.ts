/** Copying, as paste does it (`docs/spec/01-ast.md`, section 3). */
import type { NodeId } from './ids.ts';
import type { Args, AstNode, Callee, TypeRef } from './nodes.ts';
import { mapChildren, walk } from './walk.ts';

type Ids = ReadonlyMap<NodeId, NodeId>;

const moved = (id: NodeId, ids: Ids): NodeId => ids.get(id) ?? id;

function movedType(ref: TypeRef, ids: Ids): TypeRef {
  if (ref.kind === 'array') return { ...ref, of: movedType(ref.of, ids) };
  return ref.kind === 'user' ? { ...ref, type: moved(ref.type, ids) } : ref;
}

const movedCallee = (callee: Callee, ids: Ids): Callee =>
  callee.kind === 'user' ? { ...callee, method: moved(callee.method, ids) } : callee;

/** Arguments to a user method are keyed by parameter id, so the keys follow the copy too. */
const movedArgs = (args: Args, ids: Ids): Args =>
  Object.fromEntries(Object.entries(args).map(([key, v]) => [ids.get(key as NodeId) ?? key, v]));

/** The node's own references, pointing at the copies of whatever was copied with it. */
function followed(node: AstNode, ids: Ids): AstNode {
  switch (node.kind) {
    case 'type':
      return { ...node, extends: movedType(node.extends, ids) };
    case 'field':
    case 'parameter':
    case 'local':
    case 'loopItem':
      return { ...node, type: movedType(node.type, ids) };
    case 'method':
      return node.returns ? { ...node, returns: movedType(node.returns, ids) } : node;
    case 'arrayOf':
      return { ...node, of: movedType(node.of, ids) };
    case 'fieldRef':
      return { ...node, field: moved(node.field, ids) };
    case 'variableRef':
      return { ...node, variable: moved(node.variable, ids) };
    case 'call':
    case 'functionCall':
      return {
        ...node,
        callee: movedCallee(node.callee, ids),
        args: movedArgs(node.args, ids),
      };
    default:
      return node;
  }
}

/**
 * A copy with new ids from `mint`, each node's `copiedFrom` set to the node it came from.
 * References inside the copy follow it; references to anything outside stay as they were.
 */
export function copyNode<T extends AstNode>(source: T, mint: () => NodeId): T {
  const ids = new Map<NodeId, NodeId>();
  walk(source, (node) => ids.set(node.id, mint()));
  const copy = (node: AstNode): AstNode => ({
    ...followed(mapChildren(node, copy), ids),
    id: ids.get(node.id)!,
    copiedFrom: node.id,
  });
  return copy(source) as T;
}
