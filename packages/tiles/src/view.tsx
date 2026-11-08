/**
 * The open method's code as tiles (spec 14, sections 3b–3g). The view draws and turns keys and
 * pointer gestures into requests ("pick up", "delete", "open this value"); the editor carries
 * them out through the shared model and the host.
 *
 * Rows are render functions keyed by node id, never components defined inside the editor, so
 * an update doesn't remount them and lose keyboard focus (spike 1.5, finding 7). The program is
 * an ARIA tree with roving focus: one row or pill has `tabIndex` 0, and the arrow keys move it.
 * The drop line is an overlay, so nothing moves under the pointer while dragging (finding 5).
 */
import { walkProgram } from '@storystage/ast';
import type { AstNode, NodeId, Program, Statement, StatementSlot } from '@storystage/ast';
import type { HighlightKind } from '@storystage/editor-contract';
import {
  describer,
  detailsToAdd,
  type Describer,
  type StatementPlace,
} from '@storystage/story-api/editing';
import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { partsOf, type Part } from './parts.ts';
import { indexOf, place } from './places.ts';
import { t } from './words.ts';

/** Where keyboard focus can be: a statement, a value pill, "add detail", or an empty list. */
export type FocusKey = string;
export const emptyKey = (parent: NodeId, slot: StatementSlot) => `${parent}/${slot}`;
export const detailKey = (node: NodeId) => `${node}/detail`;

export type Highlights = Readonly<Record<HighlightKind, ReadonlySet<NodeId>>>;

export type ValuePill = Part & { readonly kind: 'value' };

/** What the keyboard asks for (spec 14, 3d). */
export type KeyAction =
  | 'pickUp'
  | 'delete'
  | 'duplicate'
  | 'copy'
  | 'paste'
  | 'toggle'
  | 'moveUp'
  | 'moveDown'
  | 'next'
  | 'previous'
  | 'putDown'
  | 'cancel';

export interface ViewHandlers {
  /** Focus moved: to a value pill (`pill` is it), or to a row, button or empty list. */
  readonly onFocus: (key: FocusKey, pill?: ValuePill) => void;
  readonly onAction: (action: KeyAction, key: FocusKey) => void;
  readonly onOpenValue: (pill: ValuePill, anchor: Element) => void;
  readonly onOpenDetails: (node: NodeId, anchor: Element) => void;
  /** A drag has begun on a statement. */
  readonly onDragStart: (node: NodeId) => void;
  /** The pointer is over a place, or over nowhere a statement can go. */
  readonly onDragOver: (at: StatementPlace | null) => void;
  readonly onDragEnd: (drop: boolean) => void;
}

export interface Moving {
  readonly node: NodeId;
  /** Where the drop line is, or null when the pointer is somewhere a statement can't go. */
  readonly at: StatementPlace | null;
}

export interface ViewProps extends ViewHandlers {
  readonly program: Program;
  readonly method: NodeId | null;
  readonly focus: FocusKey | null;
  readonly highlights: Highlights;
  readonly moving: Moving | null;
  /** Told each time a row is drawn, not when one is skipped (spec 14, 3h). */
  readonly onRowDrawn?: (node: NodeId) => void;
}

const CONTAINERS = new Set([
  'doInOrder',
  'doTogether',
  'count',
  'while',
  'forEach',
  'eachTogether',
  'if',
]);

/** What every row shares: the program, its words, and a key that changes when any name does. */
interface Shared {
  readonly program: Program;
  readonly describe: Describer;
  /** The program's declarations, as text: a row's words depend on these beyond its own node. */
  readonly names: string;
}

/**
 * The focus order, the pills of each row and what each is for, worked out before drawing, so a
 * row that's skipped (spec 14, 3h) still has its pills known to the keyboard.
 */
interface Layout {
  /** Where focus is: the one tab stop. */
  readonly focus: FocusKey | null;
  /** Every focusable row in reading order. */
  readonly order: FocusKey[];
  /** The pills and buttons of each row, in order. */
  readonly pills: Map<FocusKey, FocusKey[]>;
  /** The row each pill and button is on. */
  readonly rows: Map<FocusKey, FocusKey>;
  readonly values: Map<FocusKey, ValuePill>;
  /** What each pill is for ("amount"), referred to by `aria-describedby`. */
  readonly descriptions: { id: string; text: string }[];
  /**
   * For each statement, what its drawing depends on beyond its node, for it and everything
   * inside it: focus, being lifted, highlights. A row whose node and marks are the same as last
   * time isn't drawn again.
   */
  readonly marks: Map<NodeId, string>;
}

interface Drawing {
  readonly shared: Shared;
  readonly layout: Layout;
  readonly highlights: Highlights;
  /** The statement being moved, drawn lifted. */
  readonly moving: NodeId | null;
  readonly onRowDrawn: ((node: NodeId) => void) | undefined;
}

const DECLARATIONS = new Set(['type', 'field', 'method', 'parameter', 'local', 'loopItem']);
const namesKept = new WeakMap<Program, string>();

/** Every declaration's id, name and type, so a rename redraws the rows that show it. */
export function namesOf(program: Program): string {
  const kept = namesKept.get(program);
  if (kept !== undefined) return kept;
  const names: string[] = [];
  walkProgram(program, (node) => {
    if (!DECLARATIONS.has(node.kind)) return;
    const { id, name, type, returns } = node as {
      id: NodeId;
      name?: string;
      type?: unknown;
      returns?: unknown;
    };
    names.push(`${id}:${name ?? ''}:${JSON.stringify(type ?? returns ?? null)}`);
  });
  const made = names.join('|');
  namesKept.set(program, made);
  return made;
}

interface RowParts {
  readonly names: string;
  readonly parts: readonly Part[];
  /** Whether the row has an "add detail ▾" button. */
  readonly detail: boolean;
}
const partsKept = new WeakMap<AstNode, RowParts>();

/** A row's parts, kept with its node while the program's names stay the same. */
function rowParts(node: AstNode, shared: Shared): RowParts {
  const kept = partsKept.get(node);
  if (kept && kept.names === shared.names) return kept;
  const made = {
    names: shared.names,
    parts: partsOf(node, shared.describe),
    detail: node.kind === 'call' && detailsToAdd(shared.program, node.id).length > 0,
  };
  partsKept.set(node, made);
  return made;
}

/** The statement lists inside a statement, in reading order. */
function listsIn(s: Statement): { slot: StatementSlot; list: readonly Statement[] }[] {
  if (!CONTAINERS.has(s.kind)) return [];
  if (s.kind === 'if')
    return [
      { slot: 'then', list: s.then },
      { slot: 'else', list: s.else },
    ];
  return [{ slot: 'body', list: (s as { body: readonly Statement[] }).body }];
}

function highlightClasses(id: NodeId, highlights: Highlights): string {
  return (['rehearse', 'error', 'prompter'] as const)
    .filter((kind) => highlights[kind].has(id))
    .map((kind) => ` tl-hl-${kind}`)
    .join('');
}

function layOut(
  body: readonly Statement[],
  method: NodeId,
  shared: Shared,
  focus: FocusKey | null,
  highlights: Highlights,
  moving: NodeId | null,
): Layout {
  const layout: Layout = {
    focus,
    order: [],
    pills: new Map(),
    rows: new Map(),
    values: new Map(),
    descriptions: [],
    marks: new Map(),
  };
  const list = (statements: readonly Statement[], parent: NodeId, slot: StatementSlot) => {
    if (statements.length === 0) {
      const key = emptyKey(parent, slot);
      layout.order.push(key);
      return focus === key ? `|${key}` : '';
    }
    let marks = '';
    for (const s of statements) marks += statement(s);
    return marks;
  };
  const statement = (s: Statement): string => {
    layout.order.push(s.id);
    const keys: FocusKey[] = [];
    layout.pills.set(s.id, keys);
    const { parts, detail } = rowParts(s, shared);
    for (const part of parts) {
      if (part.kind !== 'value') continue;
      keys.push(part.node);
      layout.rows.set(part.node, s.id);
      layout.values.set(part.node, part);
      layout.descriptions.push({ id: `tl-for-${part.node}`, text: part.label });
    }
    if (detail) {
      const key = detailKey(s.id);
      keys.push(key);
      layout.rows.set(key, s.id);
    }
    let marks = '';
    if (focus === s.id || (focus !== null && layout.rows.get(focus) === s.id)) marks += `|${focus}`;
    if (moving === s.id) marks += '|lifted';
    marks += highlightClasses(s.id, highlights);
    for (const inner of listsIn(s)) marks += list(inner.list, s.id, inner.slot);
    layout.marks.set(s.id, marks);
    return marks;
  };
  list(body, method, 'body');
  return layout;
}

const tab = (layout: Layout, key: FocusKey) => (layout.focus === key ? 0 : -1);

function pill(part: Part, layout: Layout): ReactNode {
  if (part.kind === 'text') return <span className="tl-words">{part.text}</span>;
  if (part.kind === 'name') return <span className="tl-name">{part.text}</span>;
  if (part.kind === 'object') return <span className="tl-object">{part.text}</span>;
  const key = part.node;
  const kind = part.empty
    ? 'tl-pill tl-pill-empty'
    : part.question
      ? 'tl-pill tl-pill-question'
      : 'tl-pill';
  // Named by the value it shows and described by what it's for, so a speech-control user can
  // say what they see (WCAG 2.5.3). Enter or a click opens the menu of values that fit.
  return (
    <span
      role="button"
      aria-haspopup="menu"
      className={kind}
      data-key={key}
      data-pill=""
      tabIndex={tab(layout, key)}
      aria-describedby={`tl-for-${key}`}
    >
      {part.text}
    </span>
  );
}

function addDetail(node: AstNode, layout: Layout): ReactNode {
  const key = detailKey(node.id);
  return (
    <span
      role="button"
      aria-haspopup="menu"
      className="tl-add-detail"
      data-key={key}
      data-detail={node.id}
      tabIndex={tab(layout, key)}
    >
      {t('addDetail')}
      <span aria-hidden="true"> ▾</span>
    </span>
  );
}

function row(node: AstNode, drawing: Drawing, off: boolean): ReactNode {
  const { parts, detail } = rowParts(node, drawing.shared);
  const words = parts.flatMap((part, i) => [
    i > 0 ? ' ' : null,
    <span key={i} className="tl-part">
      {pill(part, drawing.layout)}
    </span>,
  ]);
  const note = off
    ? [
        <span key="off" className="tl-sr">
          {' '}
          {t('offNote')}
        </span>,
      ]
    : [];
  return detail
    ? [
        ...words,
        ...note,
        ' ',
        <span key="detail" className="tl-part">
          {addDetail(node, drawing.layout)}
        </span>,
      ]
    : [...words, ...note];
}

/**
 * The AI badge on a row the Prompter points at (spec 14, 3g): the Prompter always wears it, and
 * nothing else may. Its word is part of the row's name, so a screen reader hears it too.
 */
function badge(id: NodeId, drawing: Drawing): ReactNode {
  if (!drawing.highlights.prompter.has(id)) return null;
  return (
    <>
      {' '}
      <span className="tl-ai-badge">{t('aiBadge')}</span>
    </>
  );
}

function statementList(
  list: readonly Statement[],
  drawing: Drawing,
  level: number,
  parent: NodeId,
  slot: StatementSlot,
  where: string,
): ReactNode {
  if (list.length === 0) {
    const key = emptyKey(parent, slot);
    return (
      <li
        key={key}
        role="treeitem"
        aria-level={level}
        aria-setsize={1}
        aria-posinset={1}
        aria-selected={drawing.layout.focus === key}
        aria-label={where ? t('emptyIn', { where }) : t('empty')}
        className="tl-empty"
        data-key={key}
        data-parent={parent}
        data-slot={slot}
        data-index={0}
        tabIndex={tab(drawing.layout, key)}
      >
        {t('empty')}
      </li>
    );
  }
  return list.map((s, index) => (
    <Row
      key={s.id}
      s={s}
      level={level}
      index={index}
      size={list.length}
      parent={parent}
      slot={slot}
      marks={drawing.layout.marks.get(s.id) ?? ''}
      names={drawing.shared.names}
      drawing={drawing}
    />
  ));
}

interface RowProps {
  readonly s: Statement;
  readonly level: number;
  readonly index: number;
  readonly size: number;
  readonly parent: NodeId;
  readonly slot: StatementSlot;
  readonly marks: string;
  readonly names: string;
  /** Not compared: everything in it that this row shows is in `s`, `marks` or `names`. */
  readonly drawing: Drawing;
}

const sameRow = (a: RowProps, b: RowProps) =>
  a.s === b.s &&
  a.level === b.level &&
  a.index === b.index &&
  a.size === b.size &&
  a.parent === b.parent &&
  a.slot === b.slot &&
  a.marks === b.marks &&
  a.names === b.names;

/**
 * One statement, and for a container everything inside it. Defined once, here, and keyed by
 * node id, so an update never remounts a row and loses focus (spike 1.5, finding 7); and skipped
 * when its node and marks are unchanged, so an edit redraws only what changed (spec 14, 3h).
 */
const Row = memo(function Row({ s, level, index, size, parent, slot, drawing }: RowProps) {
  drawing.onRowDrawn?.(s.id);
  const { layout, shared } = drawing;
  const key = s.id;
  const off = s.enabled === false;
  const common = {
    role: 'treeitem',
    'aria-level': level,
    'aria-setsize': size,
    'aria-posinset': index + 1,
    'aria-selected': layout.focus === key,
    'data-key': key,
    'data-parent': parent,
    'data-slot': slot,
    'data-index': index,
    'data-statement': '',
    tabIndex: tab(layout, key),
  } as const;
  const marks = `${off ? ' tl-off' : ''}${drawing.moving === key ? ' tl-lifted' : ''}${highlightClasses(s.id, drawing.highlights)}`;

  if (!CONTAINERS.has(s.kind)) {
    const kind = s.kind === 'comment' ? 'tl-comment' : s.kind === 'call' ? 'tl-tile' : 'tl-box-row';
    return (
      <li {...common} className={`tl-row ${kind}${marks}`}>
        <span className="tl-grip" aria-hidden="true" data-grip="" />
        {row(s, drawing, off)}
        {badge(s.id, drawing)}
      </li>
    );
  }

  // The box is only drawing: its header row is the tree item, so the item's name is the words it
  // shows and not its children's too (WCAG 2.5.3). The children's group sits beside the header,
  // and `aria-level` says how deep each row is.
  const inner = shared.describe.short(s);
  const firstSlot: StatementSlot = s.kind === 'if' ? 'then' : 'body';
  const group = (list: readonly Statement[], groupSlot: StatementSlot, label: string) => (
    <ul role="group" className="tl-group" aria-label={label}>
      {statementList(list, drawing, level + 1, s.id, groupSlot, inner)}
    </ul>
  );
  return (
    <li role="none" className={`tl-box${marks}`}>
      <div {...common} data-into={firstSlot} aria-expanded={true} className="tl-row tl-box-header">
        <span className="tl-grip" aria-hidden="true" data-grip="" />
        {row(s, drawing, off)}
        {badge(s.id, drawing)}
      </div>
      {s.kind === 'if' ? (
        <>
          {group(s.then, 'then', inner)}
          <div className="tl-else" aria-hidden="true">
            {t('else')}
          </div>
          {group(s.else, 'else', t('else'))}
        </>
      ) : (
        group((s as { body: readonly Statement[] }).body, 'body', inner)
      )}
    </li>
  );
}, sameRow);

/** The hidden words each pill is described by: redrawn only when they change. */
const Descriptions = memo(
  function Descriptions({ list }: { readonly list: readonly { id: string; text: string }[] }) {
    return (
      <div hidden>
        {list.map((d) => (
          <span key={d.id} id={d.id}>
            {d.text}
          </span>
        ))}
      </div>
    );
  },
  (a, b) =>
    a.list.length === b.list.length &&
    a.list.every((d, i) => d.id === b.list[i]!.id && d.text === b.list[i]!.text),
);

const ARROWS = new Set(['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/** The keys that edit (spec 14, 3d), for a row in focus. */
function editKey(e: KeyboardEvent): KeyAction | null {
  const ctrl = e.ctrlKey || e.metaKey;
  if (e.key === ' ' && !ctrl) return 'pickUp';
  if (e.key === 'Delete' || e.key === 'Backspace') return 'delete';
  if (ctrl && e.key.toLowerCase() === 'd') return 'duplicate';
  if (ctrl && e.key.toLowerCase() === 'c') return 'copy';
  if (ctrl && e.key.toLowerCase() === 'v') return 'paste';
  if (ctrl && e.key === '/') return 'toggle';
  if (e.altKey && e.key === 'ArrowUp') return 'moveUp';
  if (e.altKey && e.key === 'ArrowDown') return 'moveDown';
  return null;
}

/** The box a row draws: the row itself, or a container's whole box. */
const boxOf = (el: Element) => (el.closest('li') ?? el) as HTMLElement;

/** Where in the program the pointer is over; `dragged` is left out, being what moves. */
export function placeAt(
  tree: HTMLElement,
  x: number,
  y: number,
  dragged: NodeId | null,
): StatementPlace | null {
  const draggedBox = dragged ? tree.querySelector(`[data-key="${CSS.escape(dragged)}"]`) : null;
  const lifted = draggedBox ? boxOf(draggedBox) : null;
  let best: { el: HTMLElement; box: DOMRect } | null = null;
  for (const el of tree.querySelectorAll<HTMLElement>('[data-parent]')) {
    if (lifted?.contains(el)) continue;
    const box = boxOf(el).getBoundingClientRect();
    if (y < box.top || y > box.bottom || x < box.left || x > box.right) continue;
    if (!best || box.height < best.box.height) best = { el, box };
  }
  if (!best) return null;
  const { el } = best;
  const parent = el.dataset['parent'] as NodeId;
  const slot = el.dataset['slot'] as StatementSlot;
  const index = Number(el.dataset['index']);
  if (!('statement' in el.dataset)) return place(parent, slot, 0);
  const own = el.getBoundingClientRect();
  if (y < own.top || y > own.bottom) return null;
  const upper = y < own.top + own.height / 2;
  if (el.dataset['into'] && !upper)
    return place(el.dataset['key'] as NodeId, el.dataset['into'] as StatementSlot, 0);
  return place(parent, slot, upper ? index : index + 1);
}

/** Where the drop line goes for a place, relative to the code area. */
function lineFor(
  tree: HTMLElement,
  code: HTMLElement,
  at: StatementPlace,
): { top: number; left: number; width: number } | null {
  const q = (index: number) =>
    tree.querySelector<HTMLElement>(
      `[data-parent="${CSS.escape(at.parent)}"][data-slot="${at.slot}"][data-index="${index}"]`,
    );
  const before = q(at.index);
  const last = at.index > 0 ? q(at.index - 1) : null;
  const target = before ?? last;
  if (!target) return null;
  const box = boxOf(target).getBoundingClientRect();
  const area = code.getBoundingClientRect();
  const empty = !('statement' in target.dataset);
  const top =
    (before && !empty ? box.top : empty ? box.top + box.height / 2 : box.bottom) - area.top;
  return { top: top - 2, left: box.left - area.left, width: box.width };
}

interface Pending {
  readonly node: NodeId;
  readonly x: number;
  readonly y: number;
  readonly words: string;
}

/** The open method, or a note when none is open. */
export function TilesView(props: ViewProps) {
  const { program, method, focus, highlights, moving } = props;
  const describe = useMemo(() => describer(program), [program]);
  const shared = useMemo(
    (): Shared => ({ program, describe, names: namesOf(program) }),
    [program, describe],
  );
  const tree = useRef<HTMLUListElement>(null);
  const code = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{ top: number; left: number; width: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; words: string } | null>(null);
  const pending = useRef<Pending | null>(null);
  const dragging = useRef(false);
  const handlers = useRef(props);
  useLayoutEffect(() => {
    handlers.current = props;
  });

  const found = useMemo(() => {
    for (const type of program.types) {
      const m = type.methods.find((x) => x.id === method);
      if (m) return { body: m.body, title: t('method', { type: type.name, method: m.name }) };
      const l = type.listeners.find((x) => x.id === method);
      if (l) return { body: l.body, title: describe(l), listener: l };
    }
    return null;
  }, [program, method, describe]);

  // The drop line follows wherever moving puts it, by keyboard or by pointer.
  useLayoutEffect(() => {
    const at = moving?.at;
    setLine(at && tree.current && code.current ? lineFor(tree.current, code.current, at) : null);
  }, [moving, program]);

  // Dragging: a pointer pressed on a row (or a touch on its grip) becomes a drag once it moves.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const start = pending.current;
      if (!start) return;
      if (!dragging.current) {
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 5) return;
        dragging.current = true;
        handlers.current.onDragStart(start.node);
      }
      setGhost({ x: e.clientX, y: e.clientY, words: start.words });
      const at = tree.current ? placeAt(tree.current, e.clientX, e.clientY, start.node) : null;
      handlers.current.onDragOver(at);
    };
    const end = (drop: boolean) => () => {
      const was = dragging.current;
      pending.current = null;
      dragging.current = false;
      setGhost(null);
      if (was) handlers.current.onDragEnd(drop);
    };
    const up = end(true);
    const cancel = end(false);
    const escape = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && dragging.current) cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', escape);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('keydown', escape);
    };
  }, []);

  if (!found || method === null) return <p className="tl-note">{t('noMethod')}</p>;

  const movingNode = moving?.node ?? null;
  // Laid out with the focus asked for; if that's gone (deleted, or in another method), laid out
  // again with the first row taking it, so there's always one tab stop.
  let layout = layOut(found.body, method, shared, focus, highlights, movingNode);
  if (focus === null || !(layout.rows.has(focus) || layout.order.includes(focus)))
    layout = layOut(found.body, method, shared, layout.order[0] ?? null, highlights, movingNode);
  const items = statementList(
    found.body,
    { shared, layout, highlights, moving: movingNode, onRowDrawn: props.onRowDrawn },
    1,
    method,
    'body',
    '',
  );
  const current = layout.focus;

  const go = (key: FocusKey | undefined) => {
    if (!key) return;
    props.onFocus(key, layout.values.get(key));
    tree.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  };
  const rowOf = (key: FocusKey) => layout.rows.get(key) ?? key;

  const onKeyDown = (e: KeyboardEvent) => {
    if (current === null) return;
    if (moving) {
      const action: KeyAction | null =
        e.key === 'ArrowDown'
          ? 'next'
          : e.key === 'ArrowUp'
            ? 'previous'
            : e.key === ' ' || e.key === 'Enter'
              ? 'putDown'
              : e.key === 'Escape'
                ? 'cancel'
                : null;
      if (action) {
        e.preventDefault();
        props.onAction(action, current);
      }
      return;
    }
    const target = e.target as HTMLElement;
    if (e.key === 'Enter' || (e.key === ' ' && target !== null && 'pill' in target.dataset)) {
      const value = layout.values.get(current);
      if (value) {
        e.preventDefault();
        return props.onOpenValue(value, target);
      }
      const detail = target.dataset['detail'];
      if (detail) {
        e.preventDefault();
        return props.onOpenDetails(detail as NodeId, target);
      }
    }
    const edit = editKey(e);
    if (edit) {
      e.preventDefault();
      return props.onAction(edit, rowOf(current));
    }
    if (!ARROWS.has(e.key)) return;
    e.preventDefault();
    const rowKey = rowOf(current);
    const pills = layout.pills.get(rowKey) ?? [];
    const i = layout.order.indexOf(rowKey);
    switch (e.key) {
      case 'ArrowDown':
        return go(layout.order[i + 1]);
      case 'ArrowUp':
        return go(layout.order[i - 1]);
      case 'Home':
        return go(layout.order[0]);
      case 'End':
        return go(layout.order.at(-1));
      case 'ArrowRight':
        return go(current === rowKey ? pills[0] : pills[pills.indexOf(current) + 1]);
      case 'ArrowLeft':
        return go(current === rowKey ? undefined : (pills[pills.indexOf(current) - 1] ?? rowKey));
    }
  };

  const onClick = (e: MouseEvent) => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-pill],[data-detail]');
    if (!target || dragging.current) return;
    const key = target.dataset['key']!;
    props.onFocus(key, layout.values.get(key));
    const value = layout.values.get(key);
    if (value) props.onOpenValue(value, target);
    else if (target.dataset['detail'])
      props.onOpenDetails(target.dataset['detail'] as NodeId, target);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    const el = e.target as HTMLElement;
    if (e.button !== 0 || el.closest('[data-pill],[data-detail]')) return;
    // A touch drags only from the grip, so the rest of a row still scrolls (spec 14, 3c).
    if (e.pointerType === 'touch' && !('grip' in el.dataset)) return;
    const rowEl = el.closest<HTMLElement>('[data-statement]');
    if (!rowEl) return;
    const node = rowEl.dataset['key'] as NodeId;
    const statementNode = indexOf(program).get(node)?.node;
    if (!statementNode) return;
    pending.current = { node, x: e.clientX, y: e.clientY, words: describe(statementNode) };
  };

  /** An event's header: its words, with a pill to fill for each thing it needs. */
  const header = (listener: AstNode) =>
    partsOf(listener, describe).flatMap((part, i) => [
      i > 0 ? ' ' : null,
      part.kind === 'value' ? (
        <button
          key={i}
          type="button"
          className={part.empty ? 'tl-pill tl-pill-empty' : 'tl-pill'}
          aria-label={`${part.text}, ${part.label}`}
          onClick={(e) => props.onOpenValue(part, e.currentTarget)}
        >
          {part.text}
        </button>
      ) : (
        <span key={i}>{part.text}</span>
      ),
    ]);
  const titleId = `tl-title-${method}`;
  return (
    <div className="tl-code" ref={code}>
      <div className="tl-title" id={titleId}>
        {'listener' in found && found.listener ? header(found.listener) : found.title}
      </div>
      <ul
        ref={tree}
        role="tree"
        aria-labelledby={titleId}
        className="tl-tree"
        onKeyDown={onKeyDown}
        onClick={onClick}
        onPointerDown={onPointerDown}
        onFocus={(e) => {
          const key = (e.target as HTMLElement).dataset['key'];
          if (key && key !== current) props.onFocus(key, layout.values.get(key));
        }}
      >
        {items}
      </ul>
      {line ? (
        <div
          className="tl-drop-line"
          aria-hidden="true"
          style={{ top: line.top, left: line.left, width: line.width }}
        >
          <span className="tl-drop-label">{t('dropsHere')}</span>
        </div>
      ) : null}
      {ghost ? (
        <div
          className="tl-ghost"
          aria-hidden="true"
          style={{ left: ghost.x + 12, top: ghost.y + 8 }}
        >
          {ghost.words}
        </div>
      ) : null}
      <Descriptions list={layout.descriptions} />
    </div>
  );
}
