import type { EditorHost } from '@storystage/editor-contract';
import type { BackstageItem } from '@storystage/backstage';
import { exampleProduction, type Production } from '@storystage/production';
import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import type { ModelSource } from '@storystage/stage/babylon';
import { FakeStage } from '@storystage/stage/testing';
import {
  STORY_LIBRARY,
  backstageId,
  jointName,
  type JointName,
  type ObjectId,
  type Quat,
} from '@storystage/story-api';
import { ThemeRoot } from '@storystage/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { useStudio, type Studio } from '../studio.ts';
import { sameTurn } from './pose.ts';
import { ProductionStage } from './ProductionStage.tsx';

// The Pose panel's drag (7.16, decision 0073) on S3's FakeStage: Pose on the stage shows the hand
// and foot handles, a drag is one undo step, Esc puts one back, a tap chooses the hand's or foot's
// joint, and each limb moves by keys too.

vi.mock('@storystage/blocks', () => ({
  createBlocksEditor: () => ({
    id: 'blocks',
    displayName: 'Blocks',
    mount: (element: HTMLElement) => void (element.textContent = 'blocks'),
    unmount: () => ({ method: null, selection: [], focus: null }),
    openMethod: () => {},
    setPalette: () => {},
    highlight: () => {},
    focus: () => {},
    selection: () => [],
    command: () => false,
  }),
}));

const LIMBS = ['UpperArm', 'LowerArm', 'Hand', 'UpperLeg', 'LowerLeg', 'Foot'];
const JOINTS: readonly JointName[] = [
  jointName('head'),
  ...['left', 'right'].flatMap((side) => LIMBS.map((l) => jointName(side + l))),
];
const KNIGHT = backstageId('kaykit/Biped/knight');
const PENGUIN = 'penguin' as ObjectId;
const shoulder = jointName('leftUpperArm');
const elbow = jointName('leftLowerArm');

const models: ModelSourceHandle = {
  source: {} as ModelSource,
  prepare: async () => undefined,
  item: (id) =>
    id === KNIGHT
      ? ({ id, displayName: 'Knight', joints: JOINTS } as unknown as BackstageItem)
      : undefined,
  refused: [],
  catalogue: [],
  thumbnail: () => null,
  sketch: () => null,
};
const host = { program: () => exampleProduction().program } as unknown as EditorHost;

/** The example, its penguin a Backstage biped with arms and legs. */
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
                o.id === PENGUIN ? { ...o, model: KNIGHT, class: 'Biped' } : o,
              ),
            },
          },
    ),
  };
};

async function stage(
  production = knightly(),
  readOnly: string | null = null,
  source: ModelSourceHandle = models,
) {
  let fake: FakeStage | null = null;
  let latest: Studio | null = null;
  const onAnnounce = vi.fn<(text: string) => void>();
  const makeStage: StageMaker = async () =>
    (fake = new FakeStage({ jointsFor: (cls) => (cls === 'Biped' ? JOINTS : []) })) as Stage;
  const startWorker = () => {
    const { main, worker } = inMemoryPorts();
    const timers: Timers = { now: () => 0, every: () => () => undefined };
    serve(worker, STORY_LIBRARY, timers);
    return { port: main, terminate: () => {} };
  };
  function View() {
    const studio = useStudio(production);
    latest = studio;
    const p = studio.production;
    return (
      <ThemeRoot>
        <ProductionStage
          production={p}
          scene={p.scenes[0]!.id}
          host={host}
          onGoToStoryboard={() => {}}
          announcement=""
          models={source}
          makeStage={makeStage}
          startWorker={startWorker}
          studio={studio}
          onAnnounce={onAnnounce}
        />
      </ThemeRoot>
    );
  }
  render(<View />);
  await screen.findByText(/^In this shot:/, {}, { timeout: 5_000 });
  if (readOnly) act(() => latest!.open(production, readOnly));
  return { fake: () => fake!, studio: () => latest!, onAnnounce };
}

const list = () => screen.getByRole('listbox', { name: 'Objects in this scene' });
const pose = () => screen.getByRole('group', { name: 'Pose penguin' });
const onStage = () => within(pose()).getByRole('switch', { name: 'Pose on the stage' });
const penguinOf = (studio: Studio) =>
  studio.production.scenes[0]!.setup.objects.find((o) => o.id === PENGUIN)!;
const turned = (turns: number): Quat => ({
  x: Math.sin(turns * Math.PI),
  y: 0,
  z: 0,
  w: Math.cos(turns * Math.PI),
});

async function posing() {
  const user = userEvent.setup();
  const s = await stage();
  await user.click(within(list()).getByRole('option', { name: /^penguin/ }));
  await user.click(onStage());
  return { user, ...s };
}

describe('the Pose panel’s drag (7.16, decision 0073)', () => {
  it('shows the hands and feet on the stage while Pose on the stage is on, and the handles again after', async () => {
    const { user, fake } = await posing();
    expect(fake().posingNow()).toBe(PENGUIN);
    expect(within(pose()).getByText(/Drag a hand or a foot on the stage/)).toBeTruthy();
    await user.click(onStage());
    expect(fake().posingNow()).toBeNull();
    await user.click(onStage());
    expect(fake().posingNow()).toBe(PENGUIN);
    // Choosing something else ends it.
    await user.click(within(list()).getByRole('option', { name: /^fox/ }));
    expect(fake().posingNow()).toBeNull();
  });

  it('writes a drag when it’s let go, as one undo step for the hand', async () => {
    const { fake, studio } = await posing();
    const before = studio().production;
    act(() => fake().dragPose(PENGUIN, 'leftHand', { [shoulder]: turned(0.1) }, { final: false }));
    expect(studio().production).toBe(before);
    act(() =>
      fake().dragPose(PENGUIN, 'leftHand', { [shoulder]: turned(0.2), [elbow]: turned(0.1) }),
    );
    const joints = penguinOf(studio()).joints!;
    expect(Object.keys(joints).sort()).toEqual(['leftLowerArm', 'leftUpperArm']);
    expect(sameTurn(joints[shoulder]!, turned(0.2))).toBe(true);
    expect(studio().undoLabel).toBe('Pose penguin’s left hand');
    act(() => fake().dragPose(PENGUIN, 'rightFoot', { [shoulder]: turned(0.2) }));
    // Each drag is a step of its own.
    expect(studio().undoLabel).toBe('Pose penguin’s right foot');
    act(() => studio().undo());
    expect(Object.keys(penguinOf(studio()).joints!).sort()).toEqual([
      'leftLowerArm',
      'leftUpperArm',
    ]);
    // The pose is the whole pose: the elbow the second drag left out is back at rest.
    act(() => studio().redo());
    expect(Object.keys(penguinOf(studio()).joints!)).toEqual(['leftUpperArm']);
  });

  it('puts a drag back with Esc, writing nothing', async () => {
    const { user, fake, studio } = await posing();
    const before = studio().production;
    act(() => fake().dragPose(PENGUIN, 'leftHand', { [shoulder]: turned(0.1) }, { final: false }));
    await user.keyboard('{Escape}');
    expect(fake().calls.some((c) => c.method === 'cancelDrag')).toBe(true);
    expect(studio().production).toBe(before);
    expect(studio().undoLabel).toBeNull();
    // Pose on the stage is still on.
    expect(fake().posingNow()).toBe(PENGUIN);
  });

  it('chooses the hand’s joint when its handle is tapped', async () => {
    const { fake } = await posing();
    act(() => fake().tapPose(PENGUIN, 'rightHand'));
    expect(within(pose()).getByRole('button', { name: /Joint/ }).textContent).toMatch(/right/i);
    act(() => fake().tapPose(PENGUIN, 'leftFoot'));
    expect(within(pose()).getByRole('button', { name: /Joint/ }).textContent).toMatch(/left/i);
    expect(fake().posingNow()).toBe(PENGUIN);
  });

  it('moves a hand by keys, as one undo step until focus leaves it, saying where it is', async () => {
    const { user, fake, studio, onAnnounce } = await posing();
    const hands = within(pose()).getByRole('group', { name: 'Hands and feet' });
    const names = within(hands)
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label') ?? b.textContent);
    expect(names).toEqual(['Left hand', 'Right hand', 'Left foot', 'Right foot']);
    const left = within(hands).getByRole('button', { name: 'Left hand' });
    const start = fake().handlePlace(PENGUIN, 'leftHand');
    left.focus();
    fireEvent.keyDown(left, { key: 'PageUp' });
    fireEvent.keyDown(left, { key: 'PageUp', shiftKey: true });
    // The set-up follows at once, and the keys add up.
    const now = fake().handlePlace(PENGUIN, 'leftHand');
    expect(now.y).toBeCloseTo(start.y + 1.1, 6);
    expect(now.x).toBeCloseTo(start.x, 6);
    // Each key's pose is the stage's own, for the arm: written to the stage and the film alike.
    const written = fake().calls.filter((c) => c.method === 'setObject');
    expect(
      written.map((c) => Object.keys((c.args[1] as { joints: object }).joints).sort()),
    ).toEqual([
      ['leftLowerArm', 'leftUpperArm'],
      ['leftLowerArm', 'leftUpperArm'],
    ]);
    expect(studio().undoLabel).toBe('Pose penguin’s left hand');
    expect(onAnnounce).toHaveBeenLastCalledWith(
      expect.stringMatching(/^Left hand at x .* metres\.$/),
    );
    await user.tab();
    fireEvent.keyDown(within(hands).getByRole('button', { name: 'Right hand' }), {
      key: 'ArrowUp',
    });
    act(() => studio().undo());
    // The right hand's key was a step of its own; the left hand's two are one.
    expect(studio().undoLabel).toBe('Pose penguin’s left hand');
    act(() => studio().undo());
    expect(studio().undoLabel).toBeNull();
  });

  it('chooses a hand’s joint by its button, and does nothing for other keys', async () => {
    const { user, studio } = await posing();
    const hands = within(pose()).getByRole('group', { name: 'Hands and feet' });
    await user.click(within(hands).getByRole('button', { name: 'Right foot' }));
    expect(within(pose()).getByRole('button', { name: /Joint/ }).textContent).toMatch(/right/i);
    fireEvent.keyDown(within(hands).getByRole('button', { name: 'Right foot' }), { key: 'a' });
    expect(studio().undoLabel).toBeNull();
  });

  it('offers Pose on the stage for a character chosen before the stage has it, once it does (S3)', async () => {
    const user = userEvent.setup();
    // Models get ready when the test says so, as a drop from Backstage's do over the network.
    let held: (() => void) | null = null;
    let holding = false;
    const slow: ModelSourceHandle = {
      ...models,
      prepare: () =>
        holding
          ? new Promise<undefined>((r) => (held = () => r(undefined)))
          : Promise.resolve(undefined),
    };
    const { fake, studio } = await stage(knightly(), null, slow);
    holding = true;
    const p = studio().production;
    const knight = { ...penguinOf(studio()), id: 'knight' as ObjectId };
    act(() =>
      studio().commit('Add knight', {
        ...p,
        scenes: p.scenes.map((s, i) =>
          i === 0 ? { ...s, setup: { ...s.setup, objects: [...s.setup.objects, knight] } } : s,
        ),
      }),
    );
    await user.click(within(list()).getByRole('option', { name: /^knight/ }));
    const panel = () => screen.getByRole('group', { name: 'Pose knight' });
    expect(within(panel()).queryByRole('switch')).toBeNull();
    await act(async () => held!());
    await user.click(await within(panel()).findByRole('switch', { name: 'Pose on the stage' }));
    expect(fake().posingNow()).toBe('knight');
  });

  it('has no Pose on the stage on a film that can’t be changed', async () => {
    const user = userEvent.setup();
    const { fake } = await stage(knightly(), 'A pupil’s film, opened to look at.');
    await user.click(within(list()).getByRole('option', { name: /^penguin/ }));
    expect(within(pose()).queryByRole('switch')).toBeNull();
    expect(fake().posingNow()).toBeNull();
  });
});
