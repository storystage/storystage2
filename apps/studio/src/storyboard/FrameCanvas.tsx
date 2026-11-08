import type { Frame, PlacedSketch, Production } from '@storystage/production';
import {
  NUDGE,
  SKETCH_LIMIT,
  across,
  flipSketch,
  inLayerOrder,
  layerSketch,
  moveSketch,
  nudgeSketch,
  removeSketch,
  resizeSketch,
  scaleSketch,
} from '@storystage/sketches';
import { Button, type IconName } from '@storystage/ui';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { DropZone, type DropZoneProps } from 'react-aria-components';
import { words, type WordKey } from '../strings.ts';
import { updateFrame } from './frames.ts';
import { SketchArt, sketchAspect, sketchName, type SketchItem } from './SketchArt.tsx';
import { SKETCH_DRAG_TYPE } from './SketchLibrary.tsx';

export interface FrameCanvasProps {
  production: Production;
  frame: Frame;
  /** The frame's number, "2.3". */
  number: string;
  /** The chosen sketch, or `null`. */
  chosen: string | null;
  onChosenChange: (id: string | null) => void;
  onChange: (label: string, next: Production, key?: string) => void;
  /** Ends a run of changes that join one undo step: a drag, or a pick-up. */
  onLeave: () => void;
  /** Puts a library item on this frame, at (x, y) or in the middle. */
  onAdd: (item: SketchItem, x?: number, y?: number) => void;
  onAnnounce: (text: string) => void;
  /** The frame's caption line: its number, shot and length. */
  children: ReactNode;
}

/** A sketch at standard size is this tall, as a share of the frame's height. */
const STANDARD_HEIGHT = 0.3;

/** "Owl, on the left": a sketch's accessible name (`07-ux.md` section 6.5). */
function describe(s: PlacedSketch): string {
  const name = sketchName(s.item);
  const where = words.t(`storyboard.canvas.where.${across(s)}`);
  return words.t(s.flipped ? 'storyboard.canvas.sketchFlipped' : 'storyboard.canvas.sketch', {
    name,
    where,
  });
}

/** A share of the frame as a CSS length, to 0.01%. */
const percent = (share: number) => `${Math.round(share * 10000) / 100}%`;

const optionId = (frame: Frame, id: string) => `sb-sketch-${frame.id}-${id}`;

type Drag =
  | { kind: 'move'; id: string; pointer: number; dx: number; dy: number; moved: boolean }
  | { kind: 'size'; id: string; pointer: number; from: number; scale: number; moved: boolean };

/**
 * The frame and the sketches on it (`07-ux.md` section 6.5; WP10.6). Sketches arrive from the
 * library, by drag or Enter. The chosen one has an amber box and the toolbar below acts on it.
 *
 * Every drag has a keyboard way: the sketches are a list the arrow keys step through; Enter picks
 * one up, then the arrow keys move it (Shift for bigger steps) and + and − resize it, until Enter
 * or Esc puts it down. A pick-up, like a drag, is one undo step. Delete removes the chosen sketch.
 */
export function FrameCanvas({
  production: p,
  frame,
  number,
  chosen,
  onChosenChange,
  onChange,
  onLeave,
  onAdd,
  onAnnounce,
  children,
}: FrameCanvasProps) {
  const paper = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [lifted, setLifted] = useState<string | null>(null);
  const ordered = inLayerOrder(frame);
  const current = ordered.find((s) => s.id === chosen) ?? null;
  const focusTarget = current ?? ordered.at(-1) ?? null;
  const full = frame.sketches.length >= SKETCH_LIMIT;

  // Keyboard choice moves focus with it, while focus is in the list.
  useEffect(() => {
    const el = list.current;
    if (!el || !current || !el.contains(document.activeElement)) return;
    document.getElementById(optionId(frame, current.id))?.focus();
  }, [current, frame]);

  /** One change to sketch `s`, named for it: "Move owl". */
  const change = (step: WordKey, s: PlacedSketch, next: Frame, key?: string) =>
    onChange(
      words.t(step, { name: sketchName(s.item) }),
      updateFrame(p, frame.id, () => next),
      key,
    );

  const putDown = () => {
    if (!lifted) return;
    const s = frame.sketches.find((k) => k.id === lifted);
    setLifted(null);
    onLeave();
    if (s)
      onAnnounce(
        words.t('storyboard.canvas.putDown', {
          name: sketchName(s.item),
          where: words.t(`storyboard.canvas.where.${across(s)}`),
        }),
      );
  };

  const remove = () => {
    if (!current) return;
    const at = ordered.indexOf(current);
    const next = ordered[at + 1] ?? ordered[at - 1] ?? null;
    change('step.removeSketch', current, removeSketch(frame, current.id));
    onChosenChange(next?.id ?? null);
    onAnnounce(words.t('storyboard.canvas.removed', { name: sketchName(current.item) }));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const s = current ?? focusTarget;
    if (!s) return;
    if (lifted === s.id) {
      const step = e.shiftKey ? NUDGE.large : NUDGE.small;
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      };
      const by = nudge[e.key];
      if (by) {
        e.preventDefault();
        change('step.moveSketch', s, nudgeSketch(frame, s.id, ...by), `move:${s.id}`);
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        change('step.biggerSketch', s, resizeSketch(frame, s.id, 1), `size:${s.id}`);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        change('step.smallerSketch', s, resizeSketch(frame, s.id, -1), `size:${s.id}`);
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        putDown();
      }
      return;
    }
    const at = ordered.indexOf(s);
    const to: Record<string, number> = {
      ArrowLeft: at - 1,
      ArrowUp: at - 1,
      ArrowRight: at + 1,
      ArrowDown: at + 1,
      Home: 0,
      End: ordered.length - 1,
    };
    if (e.key in to) {
      e.preventDefault();
      const next = ordered[Math.max(0, Math.min(ordered.length - 1, to[e.key]!))];
      if (next) onChosenChange(next.id);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onChosenChange(s.id);
      setLifted(s.id);
      onAnnounce(words.t('storyboard.canvas.pickedUp', { name: sketchName(s.item) }));
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      if (current) remove();
    }
  };

  /** A pointer's place on the frame, as fractions of its width and height. */
  const at = (e: { clientX: number; clientY: number }) => {
    const r = paper.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height, r };
  };

  /** The sketch a pointer event is on, from its `data-sketch`. */
  const sketchOf = (e: ReactPointerEvent) => {
    const id = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-sketch]')?.dataset
      .sketch;
    return frame.sketches.find((k) => k.id === id);
  };

  const startMove = (e: ReactPointerEvent) => {
    const s = sketchOf(e);
    if (e.button !== 0 || !s) return;
    putDown();
    onChosenChange(s.id);
    const { x, y } = at(e);
    drag.current = {
      kind: 'move',
      id: s.id,
      pointer: e.pointerId,
      dx: x - s.x,
      dy: y - s.y,
      moved: false,
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const startSize = (e: ReactPointerEvent) => {
    const s = sketchOf(e);
    if (e.button !== 0 || !s) return;
    e.stopPropagation();
    onChosenChange(s.id);
    const { x, y, r } = at(e);
    const from = Math.hypot((x - s.x) * r.width, (y - s.y) * r.height);
    drag.current = {
      kind: 'size',
      id: s.id,
      pointer: e.pointerId,
      from,
      scale: s.scale,
      moved: false,
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const s = frame.sketches.find((k) => k.id === d.id);
    if (!s) return;
    const { x, y, r } = at(e);
    d.moved = true;
    if (d.kind === 'move') {
      change('step.moveSketch', s, moveSketch(frame, s.id, x - d.dx, y - d.dy), `move:${s.id}`);
    } else if (d.from > 0) {
      const scale = (d.scale * Math.hypot((x - s.x) * r.width, (y - s.y) * r.height)) / d.from;
      const step = scale >= d.scale ? 'step.biggerSketch' : 'step.smallerSketch';
      change(step, s, scaleSketch(frame, s.id, scale), `size:${s.id}`);
    }
  };

  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    if (d.moved) onLeave();
  };

  const onDrop = async (e: Parameters<NonNullable<DropZoneProps['onDrop']>>[0]) => {
    const r = paper.current?.getBoundingClientRect();
    for (const dropped of e.items) {
      if (dropped.kind !== 'text' || !dropped.types.has(SKETCH_DRAG_TYPE)) continue;
      const item = JSON.parse(await dropped.getText(SKETCH_DRAG_TYPE)) as SketchItem;
      if (r && r.width > 0) onAdd(item, e.x / r.width, e.y / r.height);
      else onAdd(item);
      return;
    }
  };

  const last = ordered.at(-1);
  const tools: {
    icon: IconName;
    label: WordKey;
    step: WordKey;
    next: (f: Frame, id: string) => Frame;
    off?: boolean;
  }[] = [
    { icon: 'flip', label: 'storyboard.canvas.flip', step: 'step.flipSketch', next: flipSketch },
    {
      icon: 'flip_to_front',
      label: 'storyboard.canvas.forward',
      step: 'step.forwardSketch',
      next: (f, id) => layerSketch(f, id, 1),
      off: current === last,
    },
    {
      icon: 'flip_to_back',
      label: 'storyboard.canvas.back',
      step: 'step.backSketch',
      next: (f, id) => layerSketch(f, id, -1),
      off: current === ordered[0],
    },
    {
      icon: 'zoom_in',
      label: 'storyboard.canvas.bigger',
      step: 'step.biggerSketch',
      next: (f, id) => resizeSketch(f, id, 1),
    },
    {
      icon: 'zoom_out',
      label: 'storyboard.canvas.smaller',
      step: 'step.smallerSketch',
      next: (f, id) => resizeSketch(f, id, -1),
    },
  ];

  return (
    <>
      <figure className="sb-canvas" aria-labelledby="sb-canvas-title">
        <figcaption id="sb-canvas-title" className="sb-canvas-head">
          {children}
        </figcaption>
        <DropZone
          className="sb-canvas-drop"
          aria-label={words.t('storyboard.canvas.drop', { number })}
          getDropOperation={(types) => (types.has(SKETCH_DRAG_TYPE) && !full ? 'copy' : 'cancel')}
          onDrop={(e) => void onDrop(e)}
        >
          <div ref={paper} className="sb-canvas-paper">
            {ordered.length === 0 ? (
              <p className="sb-canvas-empty">{words.t('storyboard.canvas.empty')}</p>
            ) : (
              <div
                ref={list}
                role="listbox"
                className="sb-canvas-list"
                aria-label={words.t('storyboard.canvas.list', { number })}
                aria-describedby="sb-canvas-how"
                onKeyDown={onKeyDown}
                onBlur={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null)) putDown();
                }}
              >
                {ordered.map((s) => {
                  const isChosen = s === current;
                  return (
                    <div
                      key={s.id}
                      id={optionId(frame, s.id)}
                      role="option"
                      aria-selected={isChosen}
                      aria-label={describe(s)}
                      tabIndex={s === focusTarget ? 0 : -1}
                      className="sb-sketch"
                      data-chosen={isChosen || undefined}
                      data-lifted={lifted === s.id || undefined}
                      style={{
                        left: percent(s.x),
                        top: percent(s.y),
                        height: percent(STANDARD_HEIGHT * s.scale),
                        aspectRatio: sketchAspect(s.item),
                        zIndex: s.layer + 1,
                      }}
                      onFocus={() => {
                        if (!isChosen) onChosenChange(s.id);
                      }}
                      data-sketch={s.id}
                      onPointerDown={startMove}
                      onPointerMove={onPointerMove}
                      onPointerUp={onPointerUp}
                      onPointerCancel={onPointerUp}
                    >
                      <span className="sb-sketch-art" data-flipped={s.flipped || undefined}>
                        <SketchArt item={s.item} />
                      </span>
                      {isChosen &&
                        (['nw', 'ne', 'sw', 'se'] as const).map((corner) => (
                          <span
                            key={corner}
                            className="sb-sketch-handle"
                            data-corner={corner}
                            aria-hidden="true"
                            // Its moves bubble to the sketch's handlers.
                            onPointerDown={startSize}
                          />
                        ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DropZone>
      </figure>
      <p id="sb-canvas-how" className="ss-visually-hidden">
        {words.t('storyboard.canvas.howTo')}
      </p>
      {current && (
        <div
          className="sb-canvas-tools"
          role="toolbar"
          aria-label={words.t('storyboard.canvas.tools')}
        >
          {tools.map((t) => (
            <Button
              key={t.label}
              variant="quiet"
              icon={t.icon}
              isDisabled={t.off}
              onPress={() => change(t.step, current, t.next(frame, current.id))}
            >
              {words.t(t.label)}
            </Button>
          ))}
          <Button variant="quiet" icon="delete" onPress={remove}>
            {words.t('storyboard.canvas.remove')}
          </Button>
        </div>
      )}
    </>
  );
}
