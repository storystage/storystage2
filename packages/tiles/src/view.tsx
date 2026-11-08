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
import { indexProgram } from '@storystage/ast';
import type { AstNode, NodeId, Program, Statement, StatementSlot } from '@storystage/ast';
import type { HighlightKind } from '@storystage/editor-contract';
import {
  describer,
  detailsToAdd,
  type Describer,
  type StatementPlace,
} from '@storystage/story-api/editing';
import {
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
import { place } from './places.ts';
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
  readonly onFocus: (key: FocusKey) => void;
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

interface Context {
  readonly program: Program;
  readonly describe: Describer;
  readonly focus: FocusKey | null;
  readonly highlights: Highlights;
  readonly moving: NodeId | null;
  /** Every focusable row in reading order, filled as the rows are drawn. */
  readonly order: FocusKey[];
  /** The pills and buttons of each row, in order. */
  readonly pills: Map<FocusKey, FocusKey[]>;
  readonly values: Map<FocusKey, ValuePill>;
  /** What each pill is for ("amount"), referred to by `aria-describedby`. */
  readonly descriptions: { id: string; text: string }[];
}

const tab = (ctx: Context, key: FocusKey) => (ctx.focus === key ? 0 : -1);

function pill(part: Part, ctx: Context, row: FocusKey): ReactNode {
  if (part.kind === 'text') return <span className="tl-words">{part.text}</span>;
  if (part.kind === 'name') return <span className="tl-name">{part.text}</span>;
  if (part.kind === 'object') return <span className="tl-object">{part.text}</span>;
  const key = part.node;
  ctx.pills.get(row)?.push(key);
  ctx.values.set(key, part);
  const described = `tl-for-${key}`;
  ctx.descriptions.push({ id: described, text: part.label });
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
      tabIndex={tab(ctx, key)}
      aria-describedby={described}
    >
      {part.text}
    </span>
  );
}

function addDetail(node: AstNode, ctx: Context, row: FocusKey): ReactNode {
  if (node.kind !== 'call' || detailsToAdd(ctx.program, node.id).length === 0) return null;
  const key = detailKey(node.id);
  ctx.pills.get(row)?.push(key);
  return (
    <span
      role="button"
      aria-haspopup="menu"
      className="tl-add-detail"
      data-key={key}
      data-detail={node.id}
      tabIndex={tab(ctx, key)}
    >
      {t('addDetail')}
      <span aria-hidden="true"> ▾</span>
    </span>
  );
}

function row(node: AstNode, ctx: Context, key: FocusKey, off = false): ReactNode {
  ctx.pills.set(key, []);
  const parts = partsOf(node, ctx.describe).flatMap((part, i) => [
    i > 0 ? ' ' : null,
    <span key={i} className="tl-part">
      {pill(part, ctx, key)}
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
  const detail = addDetail(node, ctx, key);
  return detail
    ? [
        ...parts,
        ...note,
        ' ',
        <span key="detail" className="tl-part">
          {detail}
        </span>,
      ]
    : [...parts, ...note];
}

function highlightClasses(id: NodeId, ctx: Context): string {
  return (['rehearse', 'error', 'prompter'] as const)
    .filter((kind) => ctx.highlights[kind].has(id))
    .map((kind) => ` tl-hl-${kind}`)
    .join('');
}

function statementList(
  list: readonly Statement[],
  ctx: Context,
  level: number,
  parent: NodeId,
  slot: StatementSlot,
  where: string,
): ReactNode {
  if (list.length === 0) {
    const key = emptyKey(parent, slot);
    ctx.order.push(key);
    return (
      <li
        key={key}
        role="treeitem"
        aria-level={level}
        aria-setsize={1}
        aria-posinset={1}
        aria-selected={ctx.focus === key}
        aria-label={where ? t('emptyIn', { where }) : t('empty')}
        className="tl-empty"
        data-key={key}
        data-parent={parent}
        data-slot={slot}
        data-index={0}
        tabIndex={tab(ctx, key)}
      >
        {t('empty')}
      </li>
    );
  }
  return list.map((s, i) => statement(s, ctx, level, i, list.length, parent, slot));
}

function statement(
  s: Statement,
  ctx: Context,
  level: number,
  index: number,
  size: number,
  parent: NodeId,
  slot: StatementSlot,
): ReactNode {
  const key = s.id;
  ctx.order.push(key);
  const off = s.enabled === false;
  const common = {
    role: 'treeitem',
    'aria-level': level,
    'aria-setsize': size,
    'aria-posinset': index + 1,
    'aria-selected': ctx.focus === key,
    'data-key': key,
    'data-parent': parent,
    'data-slot': slot,
    'data-index': index,
    'data-statement': '',
    tabIndex: tab(ctx, key),
  } as const;
  const marks = `${off ? ' tl-off' : ''}${ctx.moving === key ? ' tl-lifted' : ''}${highlightClasses(s.id, ctx)}`;

  if (!CONTAINERS.has(s.kind)) {
    const kind = s.kind === 'comment' ? 'tl-comment' : s.kind === 'call' ? 'tl-tile' : 'tl-box-row';
    return (
      <li key={key} {...common} className={`tl-row ${kind}${marks}`}>
        <span className="tl-grip" aria-hidden="true" data-grip="" />
        {row(s, ctx, key, off)}
      </li>
    );
  }

  // The box is only drawing: its header row is the tree item, so the item's name is the words it
  // shows and not its children's too (WCAG 2.5.3). The children's group sits beside the header,
  // and `aria-level` says how deep each row is.
  const inner = ctx.describe.short(s);
  const firstSlot: StatementSlot = s.kind === 'if' ? 'then' : 'body';
  const header = (
    <div {...common} data-into={firstSlot} aria-expanded={true} className="tl-row tl-box-header">
      <span className="tl-grip" aria-hidden="true" data-grip="" />
      {row(s, ctx, key, off)}
    </div>
  );
  const group = (list: readonly Statement[], groupSlot: StatementSlot, label: string) => (
    <ul role="group" className="tl-group" aria-label={label}>
      {statementList(list, ctx, level + 1, s.id, groupSlot, inner)}
    </ul>
  );
  return (
    <li key={key} role="none" className={`tl-box${marks}`}>
      {header}
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
}

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

/** Where in the program the pointer is over, from the rows under it. */
function placeAt(tree: HTMLElement, x: number, y: number, dragged: NodeId): StatementPlace | null {
  const draggedBox = tree.querySelector(`[data-key="${CSS.escape(dragged)}"]`);
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
      if (l) return { body: l.body, title: describe(l) };
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

  const fresh = (focusKey: FocusKey | null): Context => ({
    program,
    describe,
    focus: focusKey,
    highlights,
    moving: moving?.node ?? null,
    order: [],
    pills: new Map(),
    values: new Map(),
    descriptions: [],
  });
  // Draw once to learn the order, so a missing focus can fall back to the first row.
  const first = fresh(null);
  statementList(found.body, first, 1, method, 'body', '');
  const known = (key: FocusKey) =>
    first.order.includes(key) || [...first.pills.values()].some((p) => p.includes(key));
  const current = focus !== null && known(focus) ? focus : (first.order[0] ?? null);
  const drawn = fresh(current);
  const items = statementList(found.body, drawn, 1, method, 'body', '');

  const go = (key: FocusKey | undefined) => {
    if (!key) return;
    props.onFocus(key);
    tree.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  };
  const rowOf = (key: FocusKey) =>
    [...drawn.pills.entries()].find(([, p]) => p.includes(key))?.[0] ?? key;

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
      const value = drawn.values.get(current);
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
    const pills = drawn.pills.get(rowKey) ?? [];
    const i = drawn.order.indexOf(rowKey);
    switch (e.key) {
      case 'ArrowDown':
        return go(drawn.order[i + 1]);
      case 'ArrowUp':
        return go(drawn.order[i - 1]);
      case 'Home':
        return go(drawn.order[0]);
      case 'End':
        return go(drawn.order.at(-1));
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
    props.onFocus(key);
    const value = drawn.values.get(key);
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
    const statementNode = indexProgram(program).get(node)?.node;
    if (!statementNode) return;
    pending.current = { node, x: e.clientX, y: e.clientY, words: describe(statementNode) };
  };

  const titleId = `tl-title-${method}`;
  return (
    <div className="tl-code" ref={code}>
      <div className="tl-title" id={titleId}>
        {found.title}
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
          if (key && key !== current) props.onFocus(key);
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
      <div hidden>
        {drawn.descriptions.map((d) => (
          <span key={d.id} id={d.id}>
            {d.text}
          </span>
        ))}
      </div>
    </div>
  );
}
