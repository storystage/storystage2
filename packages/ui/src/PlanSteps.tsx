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
  /** Why the step can't be built as it stands, in plain words (04-prompter §6.3). */
  problem?: string;
}

export interface PlanStepsProps {
  steps: readonly PlanStep[];
  /** The steps in their new order, after a drag or a keyboard move. */
  onReorder: (steps: PlanStep[]) => void;
  /** Opens the step for changing (Direction A: inline, with a mic). No Change button without it. */
  onEdit?: (id: string) => void;
  /** Takes the step out of the plan. No Delete button without it. */
  onDelete?: (id: string) => void;
  /** Names the list for screen readers. "Plan before change" by default. */
  label?: string;
  isDisabled?: boolean;
}

/**
 * The Prompter's plan (Direction A plan step, 07-ux §2.4): numbered steps, each 52 px or taller, that
 * the learner can reorder and change before anything is built. Reorder by dragging the handle, or
 * from the keyboard: focus the handle, press Enter, move with the arrow keys and press Enter again.
 * A step that can't be built says why under its words.
 */
export function PlanSteps({
  steps,
  onReorder,
  onEdit,
  onDelete,
  label = messages.t('plan.label'),
  isDisabled = false,
}: PlanStepsProps) {
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => ({ 'text/plain': steps.find((s) => s.id === key)?.text ?? '' })),
    onReorder: (e) => {
      onReorder(moveSteps(steps, [...e.keys], e.target.key, e.target.dropPosition));
    },
    isDisabled,
  });
  return (
    <GridList
      className="ss-plan"
      aria-label={label}
      items={steps}
      dragAndDropHooks={dragAndDropHooks}
    >
      {(step) => {
        const n = steps.findIndex((s) => s.id === step.id) + 1;
        return (
          <GridListItem
            id={step.id}
            textValue={step.problem ? `${step.text} ${step.problem}` : step.text}
            className="ss-plan-step"
            data-problem={step.problem ? true : undefined}
          >
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
            <span className="ss-plan-words">
              <span className="ss-plan-text">{step.text}</span>
              {step.problem && (
                <span className="ss-plan-problem">
                  <Icon name="error" size={18} />
                  {step.problem}
                </span>
              )}
            </span>
            {onEdit && (
              <Button
                variant="quiet"
                icon="edit"
                aria-label={messages.t('plan.edit', { n })}
                isDisabled={isDisabled}
                onPress={() => onEdit(step.id)}
              />
            )}
            {onDelete && (
              <Button
                variant="quiet"
                icon="delete"
                aria-label={messages.t('plan.delete', { n })}
                isDisabled={isDisabled}
                onPress={() => onDelete(step.id)}
              />
            )}
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
