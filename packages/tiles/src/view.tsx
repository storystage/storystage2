/**
 * The open method's code as tiles (spec 14, sections 3b, 3d, 3f, 3g). Read-only for now:
 * editing arrives with the drop line and the cascade.
 *
 * Rows are render functions keyed by node id, never components defined inside the editor, so
 * an update doesn't remount them and lose keyboard focus (spike 1.5, finding 7). The program is
 * an ARIA tree with roving focus: one row or pill has `tabIndex` 0, and the arrow keys move it.
 */
import type { AstNode, NodeId, Program, Statement, StatementSlot } from '@storystage/ast';
import type { HighlightKind } from '@storystage/editor-contract';
import { describer, type Describer } from '@storystage/story-api/editing';
import { useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { partsOf, type Part } from './parts.ts';
import { t } from './words.ts';

/** Where keyboard focus can be: a statement, a value pill, or an empty list. */
export type FocusKey = string;
export const emptyKey = (parent: NodeId, slot: StatementSlot) => `${parent}/${slot}`;

export type Highlights = Readonly<Record<HighlightKind, ReadonlySet<NodeId>>>;

export interface ViewProps {
  readonly program: Program;
  readonly method: NodeId | null;
  readonly focus: FocusKey | null;
  readonly highlights: Highlights;
  readonly onFocus: (key: FocusKey) => void;
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
  readonly describe: Describer;
  readonly focus: FocusKey | null;
  readonly highlights: Highlights;
  /** Every focusable key in reading order, filled as the rows are drawn. */
  readonly order: FocusKey[];
  /** The value pills of each row, in order. */
  readonly pills: Map<FocusKey, FocusKey[]>;
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
  const described = `tl-for-${key}`;
  ctx.descriptions.push({ id: described, text: part.label });
  const kind = part.empty
    ? 'tl-pill tl-pill-empty'
    : part.question
      ? 'tl-pill tl-pill-question'
      : 'tl-pill';
  // Named by the value it shows and described by what it's for, so a speech-control user can
  // say what they see (WCAG 2.5.3).
  return (
    <span className={kind} data-key={key} tabIndex={tab(ctx, key)} aria-describedby={described}>
      {part.text}
    </span>
  );
}

function row(node: AstNode, ctx: Context, key: FocusKey): ReactNode {
  ctx.pills.set(key, []);
  return partsOf(node, ctx.describe).flatMap((part, i) => [
    i > 0 ? ' ' : null,
    <span key={i} className="tl-part">
      {pill(part, ctx, key)}
    </span>,
  ]);
}

/** Said after a switched-off row's words, for screen readers only. */
const offNote = (off: boolean) => (off ? <span className="tl-sr">{t('offNote')}</span> : null);

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
        tabIndex={tab(ctx, key)}
      >
        {t('empty')}
      </li>
    );
  }
  return list.map((s, i) => statement(s, ctx, level, i + 1, list.length));
}

function statement(
  s: Statement,
  ctx: Context,
  level: number,
  position: number,
  size: number,
): ReactNode {
  const key = s.id;
  ctx.order.push(key);
  const off = s.enabled === false;
  const common = {
    role: 'treeitem',
    'aria-level': level,
    'aria-setsize': size,
    'aria-posinset': position,
    'aria-selected': ctx.focus === key,
    'data-key': key,
    tabIndex: tab(ctx, key),
  } as const;
  const marks = `${off ? ' tl-off' : ''}${highlightClasses(s.id, ctx)}`;

  if (!CONTAINERS.has(s.kind)) {
    const kind = s.kind === 'comment' ? 'tl-comment' : s.kind === 'call' ? 'tl-tile' : 'tl-box-row';
    return (
      <li key={key} {...common} className={`tl-row ${kind}${marks}`}>
        <span className="tl-grip" aria-hidden="true" />
        {row(s, ctx, key)}
        {offNote(off)}
      </li>
    );
  }

  // The box is only drawing: its header row is the tree item, so the item's name is the words it
  // shows and not its children's too (WCAG 2.5.3). The children's group sits beside the header,
  // and `aria-level` says how deep each row is.
  const inner = ctx.describe.short(s);
  const header = (
    <div {...common} aria-expanded={true} className="tl-row tl-box-header">
      <span className="tl-grip" aria-hidden="true" />
      {row(s, ctx, key)}
      {offNote(off)}
    </div>
  );
  const group = (list: readonly Statement[], slot: StatementSlot, label: string) => (
    <ul role="group" className="tl-group" aria-label={label}>
      {statementList(list, ctx, level + 1, s.id, slot, inner)}
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

/** The open method, or a note when none is open. */
export function TilesView({ program, method, focus, highlights, onFocus }: ViewProps) {
  const describe = useMemo(() => describer(program), [program]);
  const tree = useRef<HTMLUListElement>(null);

  const found = useMemo(() => {
    for (const type of program.types) {
      const m = type.methods.find((x) => x.id === method);
      if (m) return { body: m.body, title: t('method', { type: type.name, method: m.name }) };
      const l = type.listeners.find((x) => x.id === method);
      if (l) return { body: l.body, title: describe(l) };
    }
    return null;
  }, [program, method, describe]);

  if (!found || method === null) return <p className="tl-note">{t('noMethod')}</p>;

  const ctx: Context = {
    describe,
    focus: null,
    highlights,
    order: [],
    pills: new Map(),
    descriptions: [],
  };
  // Draw once to learn the order, so a missing focus can fall back to the first row.
  statementList(found.body, ctx, 1, method, 'body', '');
  const current =
    focus !== null &&
    (ctx.order.includes(focus) || [...ctx.pills.values()].some((p) => p.includes(focus)))
      ? focus
      : (ctx.order[0] ?? null);
  const drawn: Context = { ...ctx, focus: current, order: [], pills: new Map(), descriptions: [] };
  const items = statementList(found.body, drawn, 1, method, 'body', '');

  const move = (key: FocusKey | undefined) => {
    if (!key) return;
    onFocus(key);
    tree.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!ARROWS.has(e.key) || current === null) return;
    e.preventDefault();
    const rowOf = (key: FocusKey) =>
      [...drawn.pills.entries()].find(([, pills]) => pills.includes(key))?.[0] ?? key;
    const rowKey = rowOf(current);
    const pills = drawn.pills.get(rowKey) ?? [];
    const i = drawn.order.indexOf(rowKey);
    switch (e.key) {
      case 'ArrowDown':
        return move(drawn.order[i + 1]);
      case 'ArrowUp':
        return move(drawn.order[i - 1]);
      case 'Home':
        return move(drawn.order[0]);
      case 'End':
        return move(drawn.order.at(-1));
      case 'ArrowRight':
        return move(current === rowKey ? pills[0] : pills[pills.indexOf(current) + 1]);
      case 'ArrowLeft':
        return move(current === rowKey ? undefined : (pills[pills.indexOf(current) - 1] ?? rowKey));
    }
  };

  const titleId = `tl-title-${method}`;
  return (
    <div className="tl-code">
      <div className="tl-title" id={titleId}>
        {found.title}
      </div>
      <ul
        ref={tree}
        role="tree"
        aria-labelledby={titleId}
        className="tl-tree"
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          const key = (e.target as HTMLElement).dataset['key'];
          if (key && key !== current) onFocus(key);
        }}
      >
        {items}
      </ul>
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
