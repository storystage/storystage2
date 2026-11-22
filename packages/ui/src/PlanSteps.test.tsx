import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { heldWords, moveSteps, PlanSteps, stepName, type PlanStep } from './PlanSteps.tsx';

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
  it('names each step by its number, and a done one “done”, with a tick in place of its number', () => {
    const steps = PLAN.map((p, i) => (i === 1 ? { ...p, done: true } : p));
    const { container } = render(<PlanSteps steps={steps} onReorder={() => {}} />);
    const grid = screen.getByRole('grid', { name: 'Plan before change' });
    expect(
      within(grid).getByRole('row', { name: 'Step 2, done: Turn the owl to face the cat.' }),
    ).toBeTruthy();
    expect(
      within(grid).getByRole('row', { name: 'Step 1: Fly the owl down to stand by the tree.' }),
    ).toBeTruthy();
    const numbers = [...container.querySelectorAll('.ss-plan-number')];
    expect(numbers.map((n) => n.textContent)).toEqual(['1', '', '3', '4']);
    expect(numbers[1]!.hasAttribute('data-done')).toBe(true);
  });

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

describe('a repeat in the plan (04-prompter §6.8)', () => {
  it('names a repeat by the steps it holds, and a held step as inside it', () => {
    const steps: PlanStep[] = [
      { id: 'r', text: 'Repeat 3 times:', holding: [2, 3] },
      { id: 'u', text: 'The owl hops up.', inside: true },
      { id: 'd', text: 'The owl hops down.', inside: true, done: true },
      { id: 's', text: 'The owl says “Again!”' },
    ];
    render(<PlanSteps steps={steps} onReorder={() => {}} />);
    const rows = screen.getAllByRole('row');
    expect(rows.map((r) => r.getAttribute('data-inside'))).toEqual([null, 'true', 'true', null]);
    expect(screen.getByRole('row', { name: 'Step 1: Repeat 3 times, holding steps 2 and 3' }));
    expect(screen.getByRole('row', { name: 'Step 2, inside the repeat: The owl hops up.' }));
    expect(
      screen.getByRole('row', { name: 'Step 3, inside the repeat, done: The owl hops down.' }),
    );
    expect(screen.getByRole('row', { name: 'Step 4: The owl says “Again!”' }));
  });

  it('drops a colon with space after it from a repeat’s name', () => {
    expect(stepName({ id: 'r', text: 'Repeat 2 times: ', holding: [2] }, 1)).toBe(
      'Step 1: Repeat 2 times, holding step 2',
    );
  });

  it('says which steps a repeat holds', () => {
    expect(heldWords([3])).toBe('step 3');
    expect(heldWords([2, 3])).toBe('steps 2 and 3');
    expect(heldWords([2, 3, 4, 5])).toBe('steps 2 to 5');
    expect(stepName({ id: 'r', text: 'Repeat 2 times:', holding: [4] }, 3)).toBe(
      'Step 3: Repeat 2 times, holding step 4',
    );
  });
});
