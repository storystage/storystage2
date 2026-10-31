/**
 * The one table of what's inside each kind of node, and the helpers built on it. Everything that
 * goes through a program (validation, edits, copying) reads this rather than knowing the kinds.
 */
import type { NodeId } from './ids.ts';
import type { AstNode, NodeKind, Program } from './nodes.ts';

interface Shape {
  /** Slots holding a list of nodes. */
  readonly lists?: readonly string[];
  /** Slots holding one node, or `null`. */
  readonly singles?: readonly string[];
  /** Slots holding an object from name to node. */
  readonly maps?: readonly string[];
}

const BODY: Shape = { lists: ['body'] };
const CALL: Shape = { singles: ['target'], maps: ['args', 'details'] };
const LOOP: Shape = { singles: ['item', 'items'], lists: ['body'] };
const BINARY: Shape = { singles: ['left', 'right'] };

export const SHAPES: Readonly<Record<NodeKind, Shape>> = {
  type: { lists: ['fields', 'methods', 'listeners'] },
  field: { singles: ['initial'] },
  method: { lists: ['params', 'body'] },
  parameter: { singles: ['default'] },
  listener: { lists: ['params', 'body'], maps: ['args'] },
  loopItem: {},

  doInOrder: BODY,
  doTogether: BODY,
  count: { singles: ['times'], lists: ['body'] },
  while: { singles: ['condition'], lists: ['body'] },
  forEach: LOOP,
  eachTogether: LOOP,
  if: { singles: ['condition'], lists: ['then', 'else'] },
  local: { singles: ['value'] },
  assign: { singles: ['target', 'value'] },
  comment: {},
  call: CALL,
  return: { singles: ['value'] },

  number: {},
  wholeNumber: {},
  boolean: {},
  text: {},
  enum: {},
  none: {},
  this: {},
  fieldRef: { singles: ['target'] },
  variableRef: {},
  functionCall: CALL,
  arithmetic: BINARY,
  compare: BINARY,
  logic: BINARY,
  not: { singles: ['value'] },
  join: BINARY,
  arrayOf: { lists: ['items'] },
  arrayItem: { singles: ['array', 'index'] },
  arrayLength: { singles: ['array'] },
};

/** A kind from a newer format has no known insides, so a walk treats it as a leaf. */
export const shapeOf = (kind: string): Shape =>
  Object.hasOwn(SHAPES, kind) ? SHAPES[kind as NodeKind] : {};

export type SlotKey = number | string | null;

export interface Child {
  readonly node: AstNode;
  readonly slot: string;
  /** The list index, the map key, or `null` for a slot holding one node. */
  readonly key: SlotKey;
}

const read = (node: AstNode, slot: string): unknown =>
  (node as unknown as Record<string, unknown>)[slot];

export function childrenOf(node: AstNode): Child[] {
  const shape = shapeOf(node.kind);
  const children: Child[] = [];
  for (const slot of shape.lists ?? [])
    (read(node, slot) as readonly AstNode[]).forEach((child, key) =>
      children.push({ node: child, slot, key }),
    );
  for (const slot of shape.singles ?? []) {
    const child = read(node, slot) as AstNode | null;
    if (child !== null) children.push({ node: child, slot, key: null });
  }
  for (const slot of shape.maps ?? [])
    for (const [key, child] of Object.entries(read(node, slot) as Record<string, AstNode>))
      children.push({ node: child, slot, key });
  return children;
}

/** Visits a node and everything inside it, parents first. */
export function walk(node: AstNode, visit: (node: AstNode) => void): void {
  visit(node);
  for (const child of childrenOf(node)) walk(child.node, visit);
}

export function walkProgram(program: Program, visit: (node: AstNode) => void): void {
  for (const type of program.types) walk(type, visit);
}

/** A new node with `child` in place of what was at `slot` and `key`. */
export function withChild<T extends AstNode>(
  node: T,
  slot: string,
  key: SlotKey,
  child: AstNode,
): T {
  const value = read(node, slot);
  if (typeof key === 'number') {
    const list = [...(value as readonly AstNode[])];
    list[key] = child;
    return { ...node, [slot]: list };
  }
  if (typeof key === 'string')
    return { ...node, [slot]: { ...(value as Record<string, AstNode>), [key]: child } };
  return { ...node, [slot]: child };
}

/** A new node with every child passed through `f`. */
export function mapChildren<T extends AstNode>(node: T, f: (child: AstNode) => AstNode): T {
  return childrenOf(node).reduce((n, c) => withChild(n, c.slot, c.key, f(c.node)), node);
}

export interface Location {
  readonly node: AstNode;
  /** The node holding it, or `null` for a type, which the program holds. */
  readonly parent: NodeId | null;
  readonly slot: string;
  readonly key: SlotKey;
}

/** Where every node is. */
export function indexProgram(program: Program): Map<NodeId, Location> {
  const index = new Map<NodeId, Location>();
  const add = (node: AstNode, parent: NodeId | null, slot: string, key: SlotKey) => {
    index.set(node.id, { node, parent, slot, key });
    for (const child of childrenOf(node)) add(child.node, node.id, child.slot, child.key);
  };
  program.types.forEach((type, i) => add(type, null, 'types', i));
  return index;
}

/** Every id in a program, for `mintId`. */
export function idsOf(program: Program): Set<string> {
  const ids = new Set<string>();
  walkProgram(program, (node) => ids.add(node.id));
  return ids;
}
