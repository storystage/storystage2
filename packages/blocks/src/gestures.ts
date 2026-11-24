/**
 * A gesture on the blocks, as edit operations (`14-editors.md` section 3i.8). When a drag, a
 * value change or a switch-off has finished, the editor reads the method back from the workspace
 * (`fromBlocks`) and `editsFor` gives the edits that turn the program's method into it, to apply
 * through `host.apply` as one undo step.
 *
 * The edits are worked out on a copy of the program, each applied as it is chosen, so they are
 * the ones the host will accept. If the copy doesn't end up exactly as the blocks say, or an edit
 * is refused, there are no edits: the editor puts the blocks back as the program has them.
 */
import {
  EXPRESSION_KINDS,
  applyEdit,
  indexProgram,
  mintId,
  type Args,
  type EditOperation,
  type Expression,
  type ListenerDecl,
  type MethodDecl,
  type NodeId,
  type Program,
  type Statement,
  type StatementSlot,
} from '@storystage/ast';
import { labelFor, type WordsOptions } from '@storystage/story-api/editing';
import type { FromBlocks } from './mapping.ts';

export type GestureEdits =
  /** The blocks say what the program says: nothing to do. */
  | { readonly kind: 'none' }
  | {
      readonly kind: 'edits';
      readonly edits: readonly EditOperation[];
      readonly label: string;
      /** Values chosen in place, by their block's id and the new node's (`renewChosen`). */
      readonly renewed: ReadonlyMap<NodeId, NodeId>;
    }
  /** The blocks can't be the program (a value taken out of its slot, say): put them back. */
  | { readonly kind: 'putBack' };

type Owner = MethodDecl | ListenerDecl;
/** An edit before its label is written (one for each kind of edit). */
type Unlabelled = EditOperation extends infer E
  ? E extends EditOperation
    ? Omit<E, 'label'>
    : never
  : never;
export type Container = Owner | Statement;

/** Deep equality of plain data, whatever order its keys were written in. */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

const EXPRESSIONS: ReadonlySet<string> = new Set(EXPRESSION_KINDS);

/** A node's own content: its fields, with each node in them by its id only. */
function own(node: object): unknown {
  const shallow = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(shallow);
    if ('id' in v && 'kind' in v) return (v as { id: unknown }).id;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, shallow(x)]));
  };
  return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, shallow(v)]));
}

/**
 * A value chosen in place (from a chip's drop-down, or a number typed in) is a new node, as every
 * answer in the shared model is (spec 14, sections 2.3 and 5.3): a value whose own content differs
 * from the program's node with its id gets a new id. The nodes in it and around it keep theirs.
 */
function renewChosen<T>(
  node: T,
  known: ReturnType<typeof indexProgram>,
  taken: Set<string>,
  renewed: Map<NodeId, NodeId>,
): T {
  if (Array.isArray(node)) return node.map((n) => renewChosen(n, known, taken, renewed)) as T;
  if (node === null || typeof node !== 'object') return node;
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) copy[k] = renewChosen(v, known, taken, renewed);
  const { id, kind } = node as { id?: unknown; kind?: unknown };
  if (typeof id === 'string' && typeof kind === 'string' && EXPRESSIONS.has(kind)) {
    const was = known.get(id as NodeId)?.node;
    if (was && !same(own(was), own(node))) {
      const fresh = mintId(taken);
      taken.add(fresh);
      renewed.set(id as NodeId, fresh);
      copy.id = fresh;
    }
  }
  return copy as T;
}

/** The statement lists a node holds, by slot. */
export function listsOf(node: Container): [StatementSlot, readonly Statement[]][] {
  if (node.kind === 'method' || node.kind === 'listener') return [['body', node.body]];
  switch (node.kind) {
    case 'doInOrder':
    case 'doTogether':
    case 'count':
    case 'while':
    case 'forEach':
    case 'eachTogether':
      return [['body', node.body]];
    case 'if':
      return [
        ['then', node.then],
        ['else', node.else],
      ];
    default:
      return [];
  }
}

/** A statement's own expression slots, by slot name (calls' `args` and `details` by parameter). */
export function valuesOf(
  s: Statement,
): { slot: string; param?: string; value: Expression | null }[] {
  const args = (slot: 'args' | 'details', values: Args) =>
    Object.entries(values).map(([param, value]) => ({ slot, param, value }));
  switch (s.kind) {
    case 'count':
      return [{ slot: 'times', value: s.times }];
    case 'while':
    case 'if':
      return [{ slot: 'condition', value: s.condition }];
    case 'forEach':
    case 'eachTogether':
      return [{ slot: 'items', value: s.items }];
    case 'local':
      return [{ slot: 'value', value: s.value }];
    case 'assign':
      return [
        { slot: 'target', value: s.target },
        { slot: 'value', value: s.value },
      ];
    case 'return':
      return [{ slot: 'value', value: s.value }];
    case 'call':
      return [
        { slot: 'target', value: s.target },
        ...args('args', s.args),
        ...args('details', s.details),
      ];
    default:
      return [];
  }
}

/** Every statement under a list, in order, with the lists inside them. */
function* statementsIn(list: readonly Statement[]): Generator<Statement> {
  for (const s of list) {
    yield s;
    for (const [, inner] of listsOf(s)) yield* statementsIn(inner);
  }
}

/** The values of the longest increasing run in `seq` (the statements that can stay put). */
function longestRun(seq: readonly number[]): Set<number> {
  const tails: number[] = []; // index into seq of the smallest tail of each run length
  const prev: number[] = [];
  seq.forEach((v, i) => {
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (seq[tails[mid]!]! < v) lo = mid + 1;
      else hi = mid;
    }
    prev[i] = lo > 0 ? tails[lo - 1]! : -1;
    tails[lo] = i;
  });
  const run = new Set<number>();
  for (let i = tails.at(-1) ?? -1; i !== -1; i = prev[i]!) run.add(seq[i]!);
  return run;
}

/**
 * The edits that make `program`'s method what the blocks say (`after`), named with `words` (a
 * sound by its label, 7.17).
 */
export function editsFor(
  program: Program,
  read: FromBlocks,
  words: WordsOptions = {},
): GestureEdits {
  let sim = program;
  const known = indexProgram(program);
  const taken = new Set<string>(known.keys());
  const renewed = new Map<NodeId, NodeId>();
  const after: FromBlocks = {
    owner: read.owner,
    body: renewChosen(read.body, known, taken, renewed),
    args: renewChosen(read.args, known, taken, renewed),
    details: renewChosen(read.details, known, taken, renewed),
  };
  const edits: EditOperation[] = [];
  const find = (id: NodeId) => indexProgram(sim).get(id)?.node as Container | undefined;
  const owner = () => find(after.owner) as Owner | undefined;
  if (!owner()) return { kind: 'putBack' };

  const emit = (edit: Unlabelled) => {
    const labelled = {
      ...edit,
      // Named as Tiles names it (spec 14, section 2.4).
      label: labelFor(sim, { ...edit, label: '' } as EditOperation, words),
    } as EditOperation;
    sim = applyEdit(sim, labelled).program;
    edits.push(labelled);
  };

  try {
    const wanted = new Map<string, Statement>();
    for (const s of statementsIn(after.body)) wanted.set(s.id, s);

    // 1. Statements the blocks no longer have: the outermost of each, so its inside goes with it.
    const gone: NodeId[] = [];
    const collectGone = (list: readonly Statement[]) => {
      for (const s of list) {
        if (!wanted.has(s.id)) gone.push(s.id);
        else for (const [, inner] of listsOf(s)) collectGone(inner);
      }
    };
    collectGone(owner()!.body);
    for (const id of gone) emit({ kind: 'remove', node: id });

    // 2. New statements (from the palette): only whole ones, with nothing inside already in use.
    const known = indexProgram(sim);
    for (const s of statementsIn(after.body)) {
      if (known.has(s.id)) continue;
      for (const inner of statementsIn(listsOf(s).flatMap(([, l]) => l))) {
        if (known.has(inner.id)) return { kind: 'putBack' };
      }
    }

    // 3. Each list in the order the blocks have it, outermost first. The statements already in
    // order (the longest such run) stay; each other one is moved, or put in, just after the one
    // before it, so a drag is one move. A move's index counts after it has left its old place.
    const listIn = (parent: NodeId, slot: StatementSlot) =>
      listsOf(find(parent)!).find(([name]) => name === slot)?.[1] ?? [];
    const arrange = (parent: NodeId, slot: StatementSlot, list: readonly Statement[]) => {
      const wantedAt = new Map(list.map((s, i) => [s.id as string, i]));
      const staying = longestRun(
        listIn(parent, slot)
          .map((s) => wantedAt.get(s.id))
          .filter((i): i is number => i !== undefined),
      );
      list.forEach((s, i) => {
        if (staying.has(i)) return;
        const exists = indexProgram(sim).has(s.id);
        const rest = listIn(parent, slot).filter((x) => x.id !== s.id);
        const index = i === 0 ? 0 : rest.findIndex((x) => x.id === list[i - 1]!.id) + 1;
        if (exists) emit({ kind: 'move', node: s.id, parent, slot, index });
        else emit({ kind: 'insert', parent, slot, index, node: s });
      });
      for (const s of list) for (const [inner, l] of listsOf(s)) arrange(s.id, inner, l);
    };
    arrange(after.owner, 'body', after.body);

    // 4. Values, switched off, and a note's words, statement by statement.
    for (const s of statementsIn(after.body)) {
      const now = find(s.id) as Statement;
      if (now.kind === 'comment' && s.kind === 'comment' && now.text !== s.text)
        emit({ kind: 'setComment', node: s.id, text: s.text });
      const was = new Map(valuesOf(now).map((v) => [`${v.slot}/${v.param ?? ''}`, v.value]));
      const is = valuesOf(s);
      for (const v of is) {
        if (!same(was.get(`${v.slot}/${v.param ?? ''}`), v.value))
          emit({
            kind: 'setArgument',
            node: s.id,
            slot: v.slot,
            ...(v.param ? { param: v.param } : {}),
            value: v.value,
          });
      }
      // A detail the blocks no longer have is taken out.
      for (const v of valuesOf(now)) {
        if (v.slot === 'details' && !is.some((x) => x.slot === 'details' && x.param === v.param))
          emit({ kind: 'setArgument', node: s.id, slot: 'details', param: v.param, value: null });
      }
      if ((now.enabled ?? true) !== (s.enabled ?? true))
        emit({ kind: 'setEnabled', node: s.id, enabled: s.enabled ?? true });
    }

    // 5. A listener's own values.
    const o = owner()!;
    if (o.kind === 'listener') {
      for (const [slot, values, before] of [
        ['args', after.args, o.args],
        ['details', after.details, o.details],
      ] as const) {
        for (const [param, value] of Object.entries(values))
          if (!same(before[param], value))
            emit({ kind: 'setArgument', node: o.id, slot, param, value });
        for (const param of Object.keys(before))
          if (!(param in values))
            emit({ kind: 'setArgument', node: o.id, slot, param, value: null });
      }
    }
  } catch {
    // An edit the program refuses: the blocks go back as they were.
    return { kind: 'putBack' };
  }

  // The copy must now be exactly what the blocks say.
  const o = owner()!;
  if (!same(o.body, after.body)) return { kind: 'putBack' };
  if (o.kind === 'listener' && (!same(o.args, after.args) || !same(o.details, after.details)))
    return { kind: 'putBack' };
  if (edits.length === 0) return { kind: 'none' };
  return { kind: 'edits', edits, label: edits[0]!.label, renewed };
}
