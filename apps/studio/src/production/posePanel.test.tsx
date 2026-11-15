import { exampleProduction, type Production } from '@storystage/production';
import { backstageId, jointName } from '@storystage/story-api';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { useStudio, type Studio } from '../studio.ts';
import { ObjectsPanel } from './ObjectsPanel.tsx';
import { jointTurn, poseJoints, sameTurn } from './pose.ts';

// The Pose panel in Objects in this scene (07-ux 7.2; WP7.1).

/** The example, its penguin a Backstage biped with a head, a neck and a left elbow. */
const knightly = (): Production => {
  const p = exampleProduction();
  return {
    ...p,
    scenes: p.scenes.map((s, i) =>
      i !== 0
        ? s
        : {
            ...s,
            setup: {
              ...s.setup,
              objects: s.setup.objects.map((o) =>
                o.id === 'penguin'
                  ? { ...o, model: backstageId('kaykit/Biped/knight'), class: 'Biped' }
                  : o,
              ),
            },
          },
    ),
  };
};
const HAS = ['head', 'neck', 'leftLowerArm'].map(jointName);
const elbow = jointName('leftLowerArm');

function panel(start = knightly(), readOnly: string | null = null, chosen = 'penguin') {
  let latest: Studio | null = null;
  function View() {
    const studio = useStudio(start);
    latest = studio;
    const p = studio.production;
    return (
      <ThemeRoot>
        <ObjectsPanel
          studio={studio}
          scene={p.scenes[0]!.id}
          chosen={chosen}
          onChoose={() => {}}
          modelName={() => null}
          poseJoints={(o) => (typeof o.model === 'string' ? poseJoints(o.class, HAS) : [])}
        />
      </ThemeRoot>
    );
  }
  render(<View />);
  if (readOnly) act(() => latest!.open(start, readOnly));
  return () => latest!;
}

const pose = () => screen.getByRole('group', { name: 'Pose penguin' });
const field = (name: string) => within(pose()).getByRole('textbox', { name }) as HTMLInputElement;
const penguin = (studio: Studio) =>
  studio.production.scenes[0]!.setup.objects.find((o) => o.id === 'penguin')!;

describe('Pose (07-ux 7.2)', () => {
  it('lists the joints by their words, and turns one by its fields, as one undo step', async () => {
    const user = userEvent.setup();
    const studio = panel();
    await user.click(within(pose()).getByRole('button', { name: /Joint/ }));
    // The joint list, not Objects in this scene's.
    const joints = screen.getAllByRole('listbox').at(-1)!;
    const options = within(joints)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toEqual(['Neck', 'Head', 'Left elbow']);
    await user.click(screen.getByRole('option', { name: 'Left elbow' }));
    await user.clear(field('Tilt (turns)'));
    await user.type(field('Tilt (turns)'), '0.125');
    await user.clear(field('Heading (turns)'));
    await user.type(field('Heading (turns)'), '-0.1');
    await user.tab();
    const turn = penguin(studio()).joints?.[elbow];
    expect(turn && sameTurn(turn, jointTurn({ heading: -0.1, tilt: 0.125, roll: 0 }))).toBe(true);
    expect(field('Tilt (turns)').value).toBe('0.125');
    expect(field('Heading (turns)').value).toBe('-0.1');
    expect(studio().undoLabel).toBe('Pose penguin’s left elbow');
    // A posed joint says so in the list.
    await user.click(within(pose()).getByRole('button', { name: /Joint/ }));
    expect(screen.getByRole('option', { name: /Left elbow/ }).textContent).toBe('Left elbowposed');
    await user.keyboard('{Escape}');
    act(() => studio().undo());
    act(() => studio().undo());
    expect('joints' in penguin(studio())).toBe(false);
  });

  it('straightens a joint back to rest', async () => {
    const user = userEvent.setup();
    const studio = panel();
    const straighten = () => within(pose()).getByRole('button', { name: 'Straighten the neck' });
    expect(straighten().hasAttribute('disabled')).toBe(true);
    await user.clear(field('Roll (turns)'));
    await user.type(field('Roll (turns)'), '0.2');
    await user.tab();
    expect(penguin(studio()).joints?.[jointName('neck')]).toBeDefined();
    await user.click(straighten());
    expect('joints' in penguin(studio())).toBe(false);
    expect(field('Roll (turns)').value).toBe('0');
    expect(studio().undoLabel).toBe('Straighten penguin’s neck');
  });

  it('keeps each field to its limit', async () => {
    const user = userEvent.setup();
    panel();
    await user.clear(field('Tilt (turns)'));
    await user.type(field('Tilt (turns)'), '0.4');
    await user.tab();
    expect(field('Tilt (turns)').value).toBe('0.25');
  });

  it('isn’t offered for a stand-in', () => {
    panel(knightly(), null, 'fox');
    expect(screen.getByRole('group', { name: 'Where fox is' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Pose fox' })).toBeNull();
  });

  it('can’t be changed on a film that can’t be', () => {
    panel(knightly(), 'It’s handed in.');
    expect(field('Tilt (turns)').disabled).toBe(true);
    expect(within(pose()).queryByRole('button', { name: /Straighten/ })).toBeNull();
  });
});
