/**
 * Spike 1.5, option C: an Alice-style tile editor in React. Pointer events (mouse, pen, touch),
 * drop targets checked by the shared rule before anything lands, the cascade on drop, and a full
 * keyboard path: arrows between rows, Space to pick up and put down, Enter to change a tile's
 * arguments, Delete to remove it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Cascade, type CascadeResult } from './Cascade.tsx';
import {
  AMOUNTS,
  OBJECTS,
  canDrop,
  drop,
  find,
  positionOf,
  setArguments,
  toText,
  type DropTarget,
  type Dragged,
  type Program,
  type Statement,
  type Value,
} from './model.ts';
import { installHooks } from './frames.ts';

type Drag = { dragged: Dragged; label: string; target: DropTarget | null };
type Grab = { id: string; gaps: DropTarget[]; at: number };

const PALETTE: { dragged: Dragged; label: string }[] = [
  { dragged: { from: 'palette', tile: 'move' }, label: 'move' },
  { dragged: { from: 'palette', tile: 'doTogether' }, label: 'do together' },
  { dragged: { from: 'palette', tile: 'doInOrder' }, label: 'do in order' },
  ...OBJECTS.map((name) => ({
    dragged: { from: 'palette', tile: 'object', name } as Dragged,
    label: `the ${name}`,
  })),
  ...AMOUNTS.map((value) => ({
    dragged: { from: 'palette', tile: 'number', value } as Dragged,
    label: `${value}`,
  })),
];

const key = (t: DropTarget) => JSON.stringify(t);

/** Every statement id and every gap, in reading order. */
function walk(program: Program) {
  const rows: string[] = [];
  const gaps: DropTarget[] = [];
  const visit = (list: Statement[], parent: string | null) => {
    list.forEach((s, i) => {
      gaps.push({ kind: 'gap', parent, index: i });
      rows.push(s.id);
      if (s.kind !== 'move') visit(s.body, s.id);
    });
    gaps.push({ kind: 'gap', parent, index: list.length });
  };
  visit(program.body, null);
  return { rows, gaps };
}

const label = (program: Program, id: string) => toText([find(program, id)!.node]).split('\n')[0]!;

export function TileEditor() {
  const [program, setProgram] = useState<Program>({ body: [] });
  const [drag, setDrag] = useState<Drag | null>(null);
  const [cascade, setCascade] = useState<{
    id: string;
    x: number;
    y: number;
    before: Program;
  } | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [grab, setGrab] = useState<Grab | null>(null);
  const [announce, setAnnounce] = useState('');
  const ghost = useRef<HTMLDivElement>(null);
  const programRef = useRef(program);
  programRef.current = program;

  useEffect(() => installHooks(() => toText(programRef.current.body)), []);
  useEffect(() => {
    // The cascade takes focus while it is open (child effects run first, so don't take it back).
    if (focusId && !cascade) document.querySelector<HTMLElement>(`[data-id="${focusId}"]`)?.focus();
  }, [focusId, program, cascade]);

  const land = useCallback((dragged: Dragged, target: DropTarget, x: number, y: number) => {
    const before = programRef.current;
    const r = drop(before, dragged, target);
    setProgram(r.program);
    setFocusId(r.id);
    if (dragged.from === 'palette' && dragged.tile === 'move')
      setCascade({ id: r.id, x, y, before });
    setAnnounce(`Added: ${label(r.program, r.id)}`);
  }, []);

  /** Pointer drag, from the palette or from a tile in the program. */
  const startDrag = (e: React.PointerEvent, dragged: Dragged, text: string) => {
    if (e.button !== 0 || cascade) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    let current: Drag | null = null;
    let lastKey = '';
    const move = (ev: PointerEvent) => {
      if (!current) {
        if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
        current = { dragged, label: text, target: null };
        setDrag(current);
      }
      // Move the ghost directly, without re-rendering React on every pointer move.
      if (ghost.current)
        ghost.current.style.transform = `translate(${ev.clientX + 8}px, ${ev.clientY + 8}px)`;
      const el = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>('[data-drop]');
      const target = el ? (JSON.parse(el.dataset.drop!) as DropTarget) : null;
      const valid = target && canDrop(programRef.current, dragged, target) ? target : null;
      const k = valid ? key(valid) : '';
      if (k !== lastKey) {
        lastKey = k;
        current = { ...current, target: valid };
        setDrag(current);
      }
    };
    const up = (ev: PointerEvent) => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      if (!current) {
        if (dragged.from === 'program') setFocusId(dragged.id);
        return;
      }
      setDrag(null);
      if (current.target) land(dragged, current.target, ev.clientX, ev.clientY);
      else setAnnounce(`${text} can't go there`);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  };

  const finishCascade = (r: CascadeResult) => {
    if (!cascade) return;
    setProgram(setArguments(programRef.current, cascade.id, r));
    setFocusId(cascade.id);
    setCascade(null);
    setAnnounce(`${r.target} moves ${r.direction} ${r.amount} metres`);
  };
  const cancelCascade = () => {
    if (!cascade) return;
    setProgram(cascade.before);
    setCascade(null);
    setAnnounce('Cancelled');
  };

  /** Keyboard on a tile in the program. */
  const onRowKey = (e: React.KeyboardEvent, id: string) => {
    if (cascade) return;
    const { rows, gaps } = walk(program);
    if (grab) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const at = Math.max(
          0,
          Math.min(grab.gaps.length - 1, grab.at + (e.key === 'ArrowDown' ? 1 : -1)),
        );
        setGrab({ ...grab, at });
      } else if (e.key === ' ' || e.key === 'Enter') {
        const target = grab.gaps[grab.at]!;
        setProgram(drop(program, { from: 'program', id: grab.id }, target).program);
        setGrab(null);
        setAnnounce('Put down');
      } else if (e.key === 'Escape') {
        setGrab(null);
        setAnnounce('Cancelled');
      } else return;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    const i = rows.indexOf(id);
    if (e.key === 'ArrowDown') setFocusId(rows[Math.min(rows.length - 1, i + 1)] ?? id);
    else if (e.key === 'ArrowUp') setFocusId(rows[Math.max(0, i - 1)] ?? id);
    else if (e.key === ' ') {
      const valid = gaps.filter((g) => canDrop(program, { from: 'program', id }, g));
      const pos = positionOf(program, id)!;
      const at = valid.findIndex(
        (g) => g.kind === 'gap' && g.parent === pos.parent && g.index === pos.index,
      );
      setGrab({ id, gaps: valid, at: Math.max(0, at) });
      setAnnounce(
        `Picked up ${label(program, id)}. Arrows to move, Space to put down, Escape to cancel.`,
      );
    } else if (e.key === 'Enter' && find(program, id)?.node.kind === 'move') {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      setCascade({ id, x: r.left, y: r.bottom, before: program });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const found = find(program, id)!;
      const next = structuredClone(program);
      const f = find(next, id)!;
      f.parent.splice(f.parent.indexOf(f.node), 1);
      setProgram(next);
      setFocusId(rows[i - 1] ?? rows[i + 1] ?? null);
      setAnnounce(`Removed ${label(program, found.node.id)}`);
    } else return;
    e.preventDefault();
    e.stopPropagation();
  };

  /** Keyboard on a palette tile: Enter adds it after the focused tile (or at the end). */
  const onPaletteKey = (e: React.KeyboardEvent, item: (typeof PALETTE)[number]) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    const d = item.dragged;
    const isValue = d.from === 'palette' && (d.tile === 'object' || d.tile === 'number');
    let target: DropTarget = { kind: 'gap', parent: null, index: program.body.length };
    const pos = focusId ? positionOf(program, focusId) : null;
    if (focusId && pos) {
      // A value goes into the focused tile's slot; a statement goes just after the focused tile.
      if (isValue)
        target = {
          kind: 'slot',
          statement: focusId,
          slot: d.tile === 'object' ? 'target' : 'amount',
        };
      else target = { kind: 'gap', parent: pos.parent, index: pos.index + 1 };
    }
    if (!canDrop(program, item.dragged, target)) {
      setAnnounce(`${item.label} can't go there`);
      return;
    }
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    land(item.dragged, target, r.right + 8, r.top);
  };

  const gapClass = (t: DropTarget) => {
    const classes = ['gap'];
    if (drag && canDrop(program, drag.dragged, t)) classes.push('allowed');
    if (drag?.target && key(drag.target) === key(t)) classes.push('over');
    if (grab && key(grab.gaps[grab.at]!) === key(t)) classes.push('over');
    return classes.join(' ');
  };

  const gap = (t: DropTarget) => (
    <div key={key(t)} className={gapClass(t)} data-drop={key(t)} aria-hidden="true" />
  );

  const slotView = (s: string, slot: 'target' | 'amount', value: Value | null) => {
    const t: DropTarget = { kind: 'slot', statement: s, slot };
    return (
      <span className={`slot ${gapClass(t).replace('gap', '')}`} data-drop={key(t)}>
        {value === null ? '?' : value.kind === 'object' ? `the ${value.name}` : value.value}
      </span>
    );
  };

  const listView = (list: Statement[], parent: string | null) => (
    <div className="list" role="group">
      {list.map((s, i) => (
        <div key={s.id}>
          {gap({ kind: 'gap', parent, index: i })}
          {rowView(s)}
        </div>
      ))}
      {gap({ kind: 'gap', parent, index: list.length })}
    </div>
  );

  const rowView = (s: Statement) => {
    const text = label(program, s.id);
    const common = {
      'data-id': s.id,
      role: 'treeitem',
      'aria-label': text,
      'aria-grabbed': grab?.id === s.id,
      tabIndex: focusId === s.id || (focusId === null && program.body[0]?.id === s.id) ? 0 : -1,
      onKeyDown: (e: React.KeyboardEvent) => onRowKey(e, s.id),
      onFocus: () => setFocusId(s.id),
    };
    if (s.kind === 'move')
      return (
        <div
          {...common}
          className={`tile move ${grab?.id === s.id ? 'grabbed' : ''}`}
          onPointerDown={(e) => startDrag(e, { from: 'program', id: s.id }, text)}
        >
          {slotView(s.id, 'target', s.target)} move{' '}
          <span className="field">{s.direction ?? '?'}</span>
          {slotView(s.id, 'amount', s.amount)}
        </div>
      );
    return (
      <div {...common} className={`tile container ${grab?.id === s.id ? 'grabbed' : ''}`}>
        <div
          className="container-head"
          onPointerDown={(e) => startDrag(e, { from: 'program', id: s.id }, text)}
        >
          {s.kind === 'doTogether' ? 'do together' : 'do in order'}
        </div>
        {listView(s.body, s.id)}
      </div>
    );
  };

  return (
    <div className="editor tiles">
      <div className="palette" role="toolbar" aria-label="Tiles">
        {PALETTE.map((item) => (
          <div
            key={item.label}
            className={`tile palette-tile ${item.dragged.from === 'palette' && (item.dragged.tile === 'object' || item.dragged.tile === 'number') ? 'value' : ''}`}
            role="button"
            tabIndex={0}
            onPointerDown={(e) => startDrag(e, item.dragged, item.label)}
            onKeyDown={(e) => onPaletteKey(e, item)}
          >
            {item.label}
          </div>
        ))}
      </div>
      <div className="program" role="tree" aria-label="When the scene starts">
        <div className="program-head">when the scene starts</div>
        {listView(program.body, null)}
      </div>
      {drag && (
        <div ref={ghost} className="ghost" aria-hidden="true">
          {drag.label}
        </div>
      )}
      {cascade && (
        <Cascade x={cascade.x} y={cascade.y} onDone={finishCascade} onCancel={cancelCascade} />
      )}
      <div className="live" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
