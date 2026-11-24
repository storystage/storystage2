/**
 * Buttons for moving the scene view (`07-ux.md` section 7.2; the owner, 24 Nov 2026): slide it
 * left, right, up and down; circle round to the left or right; tilt, rising to look down or
 * dropping to look up; and zoom in and out. The keys, a drag, the wheel and a pinch do the same,
 * but a learner may not know them. Each button says what it does in plain words, as its name and
 * its tooltip, and repeats while held, as a held key does. In Look around they move its own view;
 * in Camera view, the scene's camera, as one undo step for each press or hold (`onMoveEnd`).
 */
import { Button, type IconName } from '@storystage/ui';
import { useEffect, useRef } from 'react';
import { Tooltip, TooltipTrigger } from 'react-aria-components';
import { words } from '../strings.ts';

/** One step of the view, as a button or a key takes it. */
export type ViewStep =
  | 'panLeft'
  | 'panUp'
  | 'panDown'
  | 'panRight'
  | 'circleLeft'
  | 'circleRight'
  | 'riseAndLookDown'
  | 'dropAndLookUp'
  | 'zoomIn'
  | 'zoomOut';

interface StepButton {
  readonly step: ViewStep;
  readonly icon: IconName;
}

/** The buttons, by group, in the order they're read. */
type Group = 'slide' | 'circle' | 'tilt' | 'zoom';

const GROUPS: readonly { readonly group: Group; readonly steps: readonly StepButton[] }[] = [
  {
    group: 'slide',
    steps: [
      { step: 'panLeft', icon: 'arrow_back' },
      { step: 'panUp', icon: 'arrow_upward' },
      { step: 'panDown', icon: 'arrow_downward' },
      { step: 'panRight', icon: 'arrow_forward' },
    ],
  },
  {
    group: 'circle',
    steps: [
      { step: 'circleLeft', icon: 'rotate_left' },
      { step: 'circleRight', icon: 'rotate_right' },
    ],
  },
  {
    group: 'tilt',
    steps: [
      { step: 'riseAndLookDown', icon: 'expand_circle_up' },
      { step: 'dropAndLookUp', icon: 'expand_circle_down' },
    ],
  },
  {
    group: 'zoom',
    steps: [
      { step: 'zoomIn', icon: 'zoom_in' },
      { step: 'zoomOut', icon: 'zoom_out' },
    ],
  },
];

export const VIEW_STEPS: readonly ViewStep[] = GROUPS.flatMap((g) => g.steps.map((s) => s.step));

/** A held button's first repeat, then each after it: a held key's rhythm. */
const FIRST_REPEAT_MS = 400;
const REPEAT_MS = 80;

export interface ViewPadProps {
  /** One step: on press, then again and again while held. */
  onMove(step: ViewStep): void;
  /** The press or hold is over: in Camera view, its steps become one undo step. */
  onMoveEnd(): void;
  /** Whether the stage can slide the view yet (S3's stage step); the rest work without it. */
  canSlide?: boolean;
  /** Nothing can move the view now (a run, or the stage not ready). */
  isDisabled?: boolean;
  /** A held button's rhythm, in ms: its first repeat, then each after it. For tests. */
  repeat?: { readonly first: number; readonly every: number };
}

export function ViewPad({
  onMove,
  onMoveEnd,
  canSlide = false,
  isDisabled = false,
  repeat = { first: FIRST_REPEAT_MS, every: REPEAT_MS },
}: ViewPadProps) {
  const timer = useRef<{ first: number; every: number } | null>(null);
  const stop = () => {
    if (!timer.current) return;
    window.clearTimeout(timer.current.first);
    window.clearInterval(timer.current.every);
    timer.current = null;
  };
  // A hold the pad is taken away in the middle of stops with it.
  useEffect(() => stop, []);

  const start = (step: ViewStep) => {
    stop();
    onMove(step);
    const held = { first: 0, every: 0 };
    held.first = window.setTimeout(() => {
      held.every = window.setInterval(() => onMove(step), repeat.every);
    }, repeat.first);
    timer.current = held;
  };
  const end = () => {
    if (!timer.current) return;
    stop();
    onMoveEnd();
  };

  return (
    <div className="pr-view-pad" role="toolbar" aria-label={words.t('production.view.pad')}>
      {GROUPS.map(({ group, steps }) => (
        <div
          key={group}
          role="group"
          aria-label={words.t(`production.view.pad.${group}`)}
          className="pr-view-pad-group"
          data-group={group}
        >
          <span className="pr-view-pad-label" aria-hidden="true">
            {words.t(`production.view.pad.${group}`)}
          </span>
          <div className="pr-view-pad-buttons">
            {steps.map(({ step, icon }) => {
              const name = words.t(`production.view.step.${step}`);
              return (
                // Its words as a tooltip too: on hover after a moment, and at once on focus.
                <TooltipTrigger key={step} delay={600}>
                  <Button
                    variant="secondary"
                    icon={icon}
                    aria-label={name}
                    data-step={step}
                    isDisabled={isDisabled || (group === 'slide' && !canSlide)}
                    onPressStart={() => start(step)}
                    onPressEnd={end}
                  />
                  <Tooltip className="pr-tooltip" offset={6}>
                    {name}
                  </Tooltip>
                </TooltipTrigger>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
