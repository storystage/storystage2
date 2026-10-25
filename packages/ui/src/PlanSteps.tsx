import {
  Button as AriaButton,
  GridList,
  GridListItem,
  useDragAndDrop,
  type Key,
} from 'react-aria-components';
import { Button } from './Button.tsx';
import { Icon } from './Icon.tsx';
import { messages } from './messages.ts';

export interface PlanStep {
  id: string;
  /** The step in plain words, as the Prompter wrote it or the learner changed it (13.9). */
  text: string;
}

export interface PlanStepsProps {
  steps: readonly PlanStep[];
  /** The steps in their new order, after a drag or a keyboard move. */
  onReorder: (steps: PlanStep[]) => void;
  /** Opens the step for changing (Direction A: inline, with a mic). */
  onEdit: (id: string) => void;
}

/**
 * The Prompter's plan (Direction A plan step, 07-ux §2.4): numbered steps, each 52 px or taller, that
 * the learner can reorder and change before anything is built. Reorder by dragging the handle, or
 * from the keyboard: focus the handle, press Enter, move with the arrow keys and press Enter again.
 */
export function PlanSteps({ steps, onReorder, onEdit }: PlanStepsProps) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => ({ 'text/plain': steps.find((s) => s.id === key)?.text ?? '' })),
    onReorder: (e) => {
      onReorder(moveSteps(steps, [...e.keys], e.target.key, e.target.dropPosition));
    },
  });
  return (
    <GridList
      className="ss-plan"
      aria-label={messages.t('plan.label')}
      items={steps}
      dragAndDropHooks={dragAndDropHooks}
    >
      {(step) => {
        const n = steps.findIndex((s) => s.id === step.id) + 1;
        return (
          <GridListItem id={step.id} textValue={step.text} className="ss-plan-step">
            <AriaButton
              slot="drag"
              className="ss-plan-handle"
              aria-label={messages.t('plan.move', { n })}
            >
              <Icon name="drag_indicator" size={22} />
            </AriaButton>
            <span className="ss-plan-number" aria-hidden="true">
              {n}
            </span>
            <span className="ss-plan-text">{step.text}</span>
            <Button
              variant="quiet"
              icon="edit"
              aria-label={messages.t('plan.edit', { n })}
              onPress={() => onEdit(step.id)}
            />
          </GridListItem>
        );
      }}
    </GridList>
  );
}

/** Moves the steps with `keys` before or after `target`, keeping their order. */
export function moveSteps(
  steps: readonly PlanStep[],
  keys: readonly Key[],
  target: Key,
  position: 'before' | 'after' | 'on',
): PlanStep[] {
  const moving = steps.filter((s) => keys.includes(s.id));
  const rest = steps.filter((s) => !keys.includes(s.id));
  const at = rest.findIndex((s) => s.id === target);
  if (at < 0) return [...steps];
  const index = position === 'before' ? at : at + 1;
  return [...rest.slice(0, index), ...moving, ...rest.slice(index)];
}
