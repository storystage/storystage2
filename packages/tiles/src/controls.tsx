/**
 * The control bar (spec 14, 3a): do in order, do together, count, while, if, the two loops and a
 * note. A click or Enter puts one in after the statement in focus; dragging puts it anywhere. A
 * React Aria toolbar gives it one tab stop, with the arrow keys between its buttons.
 */
import { CONTROL_KINDS, type ControlKind } from '@storystage/story-api/editing';
import { memo, type PointerEvent } from 'react';
import { Button, Toolbar } from 'react-aria-components';
import { Ghost, useDragSource, type DragTarget } from './drag.tsx';
import { t } from './words.ts';

export interface ControlBarProps {
  readonly onInsert: (kind: ControlKind) => void;
  readonly drag: DragTarget;
}

/** Memoised: its handlers are made once, so it's drawn once (spec 14, 3h). */
export const ControlBar = memo(function ControlBar({ onInsert, drag }: ControlBarProps) {
  const { begin, ghost, wasDrag } = useDragSource(drag);
  const down = (kind: ControlKind) => (e: PointerEvent) => {
    if (e.button === 0) begin(kind, t(`control.${kind}`), e.clientX, e.clientY);
  };
  return (
    <>
      <Toolbar aria-label={t('controls')} className="tl-controls">
        {CONTROL_KINDS.map((kind) => (
          <Button
            key={kind}
            className={kind === 'comment' ? 'tl-control tl-control-comment' : 'tl-control'}
            onPointerDown={down(kind)}
            onPress={() => {
              if (!wasDrag()) onInsert(kind);
            }}
          >
            {t(`control.${kind}`)}
          </Button>
        ))}
      </Toolbar>
      <Ghost ghost={ghost} />
    </>
  );
});
