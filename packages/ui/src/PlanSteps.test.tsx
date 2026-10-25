import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { moveSteps, PlanSteps, type PlanStep } from './PlanSteps.tsx';

const PLAN: PlanStep[] = [
  { id: 'a', text: 'Fly the owl down to stand by the tree.' },
  { id: 'b', text: 'Turn the owl to face the cat.' },
  { id: 'c', text: 'The owl says “Here is the key.”' },
  { id: 'd', text: 'Medium shot of both, held for 3 seconds.' },
];

describe('moveSteps', () => {
  it('moves a step before another', () => {
    expect(moveSteps(PLAN, ['c'], 'a', 'before').map((s) => s.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('moves a step after another', () => {
    expect(moveSteps(PLAN, ['a'], 'c', 'after').map((s) => s.id)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('keeps several moving steps in their order', () => {
    expect(moveSteps(PLAN, ['b', 'd'], 'a', 'before').map((s) => s.id)).toEqual([
      'b',
      'd',
      'a',
      'c',
    ]);
  });

  it('changes nothing when the target is one of the moving steps', () => {
    expect(moveSteps(PLAN, ['a'], 'a', 'after')).toEqual(PLAN);
  });
});

describe('PlanSteps', () => {
  it('is a named grid of the steps, in order', () => {
    render(<PlanSteps steps={PLAN} onReorder={() => {}} onEdit={() => {}} />);
    const grid = screen.getByRole('grid', { name: 'Plan before change' });
    const rows = within(grid).getAllByRole('row');
    expect(rows.map((r) => r.textContent)).toEqual([
      '1Fly the owl down to stand by the tree.',
      '2Turn the owl to face the cat.',
      '3The owl says “Here is the key.”',
      '4Medium shot of both, held for 3 seconds.',
    ]);
  });

  it('gives each step a move handle and a change button, named by number', () => {
    render(<PlanSteps steps={PLAN} onReorder={() => {}} onEdit={() => {}} />);
    expect(screen.getByRole('button', { name: 'Move step 2' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change step 2' })).toBeTruthy();
  });

  it('opens a step for changing', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    render(<PlanSteps steps={PLAN} onReorder={() => {}} onEdit={onEdit} />);
    await user.click(screen.getByRole('button', { name: 'Change step 3' }));
    expect(onEdit).toHaveBeenCalledWith('c');
  });
});
