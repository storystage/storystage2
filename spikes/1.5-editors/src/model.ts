/**
 * Spike 1.5: the tiny typed program both editors edit. Throwaway: the real program is S2's
 * (`packages/ast`) and the real editor contract is WP0.8 (`packages/editor-contract`).
 */

export type SlotType = 'Object' | 'Number';
export const DIRECTIONS = ['forward', 'backward', 'left', 'right', 'up', 'down'] as const;
export type Direction = (typeof DIRECTIONS)[number];
export const OBJECTS = ['cat', 'dog', 'camera'] as const;
export const AMOUNTS = [0.25, 0.5, 1, 2, 5] as const;

export type Value =
  { id: string; kind: 'object'; name: string } | { id: string; kind: 'number'; value: number };

export type Statement =
  | {
      id: string;
      kind: 'move';
      target: Value | null;
      direction: Direction | null;
      amount: Value | null;
    }
  | { id: string; kind: 'doTogether' | 'doInOrder'; body: Statement[] };

export interface Program {
  body: Statement[];
}

/** What is being dragged: a tile from the palette (not yet in the program) or an existing one. */
export type Dragged =
  | { from: 'palette'; tile: 'move' | 'doTogether' | 'doInOrder' }
  | { from: 'palette'; tile: 'object'; name: string }
  | { from: 'palette'; tile: 'number'; value: number }
  | { from: 'program'; id: string };

/** Where it could be dropped: a gap between statements, or a typed slot. */
export type DropTarget =
  | { kind: 'gap'; parent: string | null; index: number }
  | { kind: 'slot'; statement: string; slot: 'target' | 'amount' };

export const SLOT_TYPES: Record<'target' | 'amount', SlotType> = {
  target: 'Object',
  amount: 'Number',
};

let counter = 0;
export const newId = () => `n${(counter++).toString(36)}`;

export function find(
  program: Program,
  id: string,
): { node: Statement; parent: Statement[] } | null {
  const walk = (list: Statement[]): { node: Statement; parent: Statement[] } | null => {
    for (const s of list) {
      if (s.id === id) return { node: s, parent: list };
      if (s.kind !== 'move') {
        const found = walk(s.body);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(program.body);
}

/** The gap a statement sits in: its parent block (null for the top level) and its index. */
export function positionOf(
  program: Program,
  id: string,
): { parent: string | null; index: number } | null {
  const walk = (
    list: Statement[],
    parent: string | null,
  ): { parent: string | null; index: number } | null => {
    for (let i = 0; i < list.length; i++) {
      const s = list[i]!;
      if (s.id === id) return { parent, index: i };
      if (s.kind !== 'move') {
        const found = walk(s.body, s.id);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(program.body, null);
}

function contains(s: Statement, id: string): boolean {
  return s.id === id || (s.kind !== 'move' && s.body.some((c) => contains(c, id)));
}

/** The type of value a dragged thing produces, or 'Statement'. */
export function producedType(program: Program, d: Dragged): SlotType | 'Statement' | null {
  if (d.from === 'palette')
    return d.tile === 'object' ? 'Object' : d.tile === 'number' ? 'Number' : 'Statement';
  return find(program, d.id) ? 'Statement' : null;
}

/**
 * The one rule both editors share: may `d` be dropped on `t`? Refusing here is what makes an
 * invalid drop impossible rather than an error afterwards.
 */
export function canDrop(program: Program, d: Dragged, t: DropTarget): boolean {
  const type = producedType(program, d);
  if (type === null) return false;
  if (t.kind === 'slot')
    return type === SLOT_TYPES[t.slot] && find(program, t.statement)?.node.kind === 'move';
  if (type !== 'Statement') return false;
  if (t.parent === null) return true;
  const parent = find(program, t.parent)?.node;
  if (!parent || parent.kind === 'move') return false;
  // A block can't go inside itself.
  if (d.from === 'program') {
    const self = find(program, d.id)!.node;
    if (contains(self, t.parent)) return false;
  }
  return true;
}

function makeStatement(tile: 'move' | 'doTogether' | 'doInOrder'): Statement {
  return tile === 'move'
    ? { id: newId(), kind: 'move', target: null, direction: null, amount: null }
    : { id: newId(), kind: tile, body: [] };
}

function makeValue(d: Dragged): Value {
  if (d.from === 'palette' && d.tile === 'object')
    return { id: newId(), kind: 'object', name: d.name };
  if (d.from === 'palette' && d.tile === 'number')
    return { id: newId(), kind: 'number', value: d.value };
  throw new Error('not a value');
}

const clone = (p: Program): Program => structuredClone(p);

/** Applies a drop and returns the new program and the statement it created or moved. */
export function drop(
  program: Program,
  d: Dragged,
  t: DropTarget,
): { program: Program; id: string } {
  if (!canDrop(program, d, t)) throw new Error('drop refused');
  const next = clone(program);
  if (t.kind === 'slot') {
    const s = find(next, t.statement)!.node;
    if (s.kind !== 'move') throw new Error('not a move');
    s[t.slot] = makeValue(d);
    return { program: next, id: s.id };
  }
  const parent = t.parent === null ? null : find(next, t.parent)!.node;
  const list = parent === null ? next.body : (parent as { body: Statement[] }).body;
  let index = t.index;
  let node: Statement;
  if (d.from === 'program') {
    const found = find(next, d.id)!;
    const at = found.parent.indexOf(found.node);
    found.parent.splice(at, 1);
    // Moving down within one list: the gap index counted the tile itself.
    if (found.parent === list && at < index) index--;
    node = found.node;
  } else {
    node = makeStatement((d as { tile: 'move' | 'doTogether' | 'doInOrder' }).tile);
  }
  list.splice(Math.min(index, list.length), 0, node);
  return { program: next, id: node.id };
}

/** Sets the arguments asked for on drop (Alice asks for them in a menu as the tile lands). */
export function setArguments(
  program: Program,
  id: string,
  args: { target?: string; direction?: Direction; amount?: number },
): Program {
  const next = clone(program);
  const s = find(next, id)?.node;
  if (!s || s.kind !== 'move') throw new Error('not a move');
  if (args.target !== undefined) s.target = { id: newId(), kind: 'object', name: args.target };
  if (args.direction !== undefined) s.direction = args.direction;
  if (args.amount !== undefined) s.amount = { id: newId(), kind: 'number', value: args.amount };
  return next;
}

/** Readable text, for the parity check between the two editors. */
export function toText(list: Statement[], indent = ''): string {
  return list
    .map((s) => {
      if (s.kind === 'move') {
        const v = (x: Value | null) =>
          x === null ? '?' : x.kind === 'object' ? x.name : String(x.value);
        return `${indent}${v(s.target)}.move(${s.direction ?? '?'}, ${v(s.amount)})`;
      }
      return `${indent}${s.kind === 'doTogether' ? 'do together' : 'do in order'}:\n${toText(s.body, indent + '  ') || indent + '  (empty)'}`;
    })
    .join('\n');
}
