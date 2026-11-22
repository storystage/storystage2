/**
 * The control bar (spec 14, 3a): do in order, do together, count, while, if, the two loops,
 * variable, set and a note. Variable and set ask a question before they go in (spec 14, 2.3). A click or Enter puts one in after the statement in focus; dragging puts it anywhere. A
 * React Aria toolbar gives it one tab stop, with the arrow keys between its buttons.
 */
import { CONTROL_KINDS, type ControlKind } from '@storystage/story-api/editing';
import { memo, type PointerEvent } from 'react';
import { Button, Toolbar } from 'react-aria-components';
import { Ghost, useDragSource, type DragTarget } from './drag.tsx';
import { t } from './words.ts';

/** The bar's tiles: the control blocks, with variable and set before the note. */
export type BarKind = ControlKind | 'variable' | 'assign';
const BAR: readonly BarKind[] = [
  ...CONTROL_KINDS.filter((k) => k !== 'comment'),
  'variable',
  'assign',
  'comment',
];

/** The tiles that ask a question first: a variable's name and kind, or which variable to set. */
export const asksFirst = (kind: BarKind): kind is 'variable' | 'assign' =>
  kind === 'variable' || kind === 'assign';

export interface ControlBarProps {
  readonly onInsert: (kind: BarKind) => void;
  readonly drag: DragTarget;
}

/** Memoised: its handlers are made once, so it's drawn once (spec 14, 3h). */
export const ControlBar = memo(function ControlBar({ onInsert, drag }: ControlBarProps) {
  const { begin, ghost, wasDrag } = useDragSource(drag);
  const down = (kind: BarKind) => (e: PointerEvent) => {
    if (e.button === 0) begin(kind, t(`control.${kind}`), e.clientX, e.clientY);
  };
  return (
    <>
      <Toolbar aria-label={t('controls')} className="tl-controls">
        {BAR.map((kind) => (
          <Button
            key={kind}
            data-kind={kind}
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
