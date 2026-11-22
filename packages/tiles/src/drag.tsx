/**
 * Dragging something new onto the program, from the palette or the control bar (spec 14, 3c):
 * once the pointer has moved, a ghost follows it and the editor shows the drop line. A touch
 * drags too, since nothing here scrolls sideways; a tap still inserts.
 */
import { useEffect, useRef, useState } from 'react';

export interface DragTarget {
  /** A drag of `key` has begun. */
  readonly onStart: (key: string) => void;
  readonly onOver: (x: number, y: number) => void;
  readonly onEnd: (drop: boolean) => void;
}

/** The pointer handler to put on a source, and the ghost to draw while dragging. */
export function useDragSource(target: DragTarget) {
  const [ghost, setGhost] = useState<{ x: number; y: number; words: string } | null>(null);
  const start = useRef<{ key: string; words: string; x: number; y: number } | null>(null);
  const dragging = useRef(false);
  const latest = useRef(target);
  useEffect(() => {
    latest.current = target;
  });

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const s = start.current;
      if (!s) return;
      if (!dragging.current) {
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < 5) return;
        dragging.current = true;
        latest.current.onStart(s.key);
      }
      setGhost({ x: e.clientX, y: e.clientY, words: s.words });
      latest.current.onOver(e.clientX, e.clientY);
    };
    const end = (drop: boolean) => () => {
      const was = dragging.current;
      start.current = null;
      dragging.current = false;
      setGhost(null);
      if (was) latest.current.onEnd(drop);
    };
    const up = end(true);
    const cancel = end(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
    };
  }, []);

  const begin = (key: string, words: string, x: number, y: number) => {
    start.current = { key, words, x, y };
  };
  /** Whether a drag has just happened, so the click that ends it doesn't insert as well. */
  const wasDrag = () => dragging.current;
  return { begin, ghost, wasDrag };
}

export function Ghost({ ghost }: { ghost: { x: number; y: number; words: string } | null }) {
  return ghost ? (
    <div className="tl-ghost" aria-hidden="true" style={{ left: ghost.x + 12, top: ghost.y + 8 }}>
      {ghost.words}
    </div>
  ) : null;
}
