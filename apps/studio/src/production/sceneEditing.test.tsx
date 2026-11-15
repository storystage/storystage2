import type { EditorHost } from '@storystage/editor-contract';
import { exampleProduction, type Production } from '@storystage/production';
import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import type { ModelSource } from '@storystage/stage/babylon';
import { FakeStage } from '@storystage/stage/testing';
import { CAMERA, STORY_LIBRARY, type ObjectId, type Transform } from '@storystage/story-api';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { useStudio, type Studio } from '../studio.ts';
import { ProductionStage } from './ProductionStage.tsx';

// Editing the set-up on the scene view (07-ux 7.2) with S3's FakeStage: edit mode while nothing
// runs, choosing on the stage or in the list, handle drags as undo steps, Look around and Move
// the camera here, and In this shot.

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

const models: ModelSourceHandle = {
  source: {} as ModelSource,
  prepare: async () => undefined,
  item: () => undefined,
  refused: [],
  catalogue: [],
  thumbnail: () => null,
  sketch: () => null,
};
const host = { program: () => exampleProduction().program } as unknown as EditorHost;
const example = exampleProduction();
const PENGUIN = 'penguin' as ObjectId;

async function stage(production: Production = example) {
  let fake: FakeStage | null = null;
  let latest: Studio | null = null;
  const onAnnounce = vi.fn<(text: string) => void>();
  const makeStage: StageMaker = async () => (fake = new FakeStage()) as Stage;
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
          models={models}
          makeStage={makeStage}
          startWorker={startWorker}
          studio={studio}
          onAnnounce={onAnnounce}
        />
      </ThemeRoot>
    );
  }
  render(<View />);
  // The set-up has been shown once In this shot says something.
  await screen.findByText(/^In this shot:/, {}, { timeout: 5_000 });
  return { fake: () => fake!, studio: () => latest!, onAnnounce };
}

const setupOf = (studio: Studio) => studio.production.scenes[0]!.setup;
const penguinOf = (studio: Studio) => setupOf(studio).objects.find((o) => o.id === PENGUIN)!;
const list = () => screen.getByRole('listbox', { name: 'Objects in this scene' });

/** A point of the view where the stage finds `object`. */
function pointOn(fake: FakeStage, object: string): { x: number; y: number } {
  for (let y = 0; y < 360; y += 5)
    for (let x = 0; x < 640; x += 5) {
      const target = fake.pick(x, y).target;
      if (target && 'object' in target && target.object === object) return { x, y };
    }
  throw new Error(`${object} isn't in view`);
}

const moved = (t: Transform, dx: number): Transform => ({
  ...t,
  position: { ...t.position, x: t.position.x + dx },
});

describe('editing the set-up on the scene view (07-ux 7.2)', () => {
  it('is in edit mode while nothing runs, and names what the camera sees', async () => {
    const { fake } = await stage();
    expect(fake().isEditingNow()).toBe(true);
    expect(screen.getByText('In this shot: penguin, fox')).toBeTruthy();
  });

  it('chooses an object clicked on the stage, in the list too, and nothing on the ground', async () => {
    const { fake } = await stage();
    const at = pointOn(fake(), 'penguin');
    act(() => fake().tap(at.x, at.y));
    await waitFor(() =>
      expect(
        within(list())
          .getByRole('option', { name: /^penguin/ })
          .getAttribute('aria-selected'),
      ).toBe('true'),
    );
    expect(fake().chosen()).toEqual({ object: PENGUIN });
    act(() => fake().tap(5, 5));
    await waitFor(() => expect(fake().chosen()).toBeNull());
  });

  it('gives an object chosen in the list the stage’s handles', async () => {
    const user = userEvent.setup();
    const { fake } = await stage();
    await user.click(within(list()).getByRole('option', { name: /^fox/ }));
    await waitFor(() => expect(fake().chosen()).toEqual({ object: 'fox' }));
  });

  it('writes a handle drag when it’s let go, as one undo step named for what it did', async () => {
    const { fake, studio } = await stage();
    const before = penguinOf(studio()).transform;
    act(() =>
      fake().drag({ target: { object: PENGUIN }, transform: moved(before, 0.5), final: false }),
    );
    expect(penguinOf(studio()).transform).toEqual(before);
    act(() =>
      fake().drag({ target: { object: PENGUIN }, transform: moved(before, 1), final: true }),
    );
    expect(penguinOf(studio()).transform.position.x).toBeCloseTo(before.position.x + 1);
    expect(studio().undoLabel).toBe('Move penguin');
    const bigger = { ...penguinOf(studio()).transform, scale: { x: 2, y: 2, z: 2 } };
    act(() => fake().drag({ target: { object: PENGUIN }, transform: bigger, final: true }));
    expect(studio().undoLabel).toBe('Resize penguin');
    act(() => studio().undo());
    act(() => studio().undo());
    expect(penguinOf(studio()).transform).toEqual(before);
  });

  it('moves the scene’s camera to Look around’s view, as one undo step', async () => {
    const user = userEvent.setup();
    const { fake, studio, onAnnounce } = await stage();
    expect(screen.queryByRole('button', { name: 'Move the camera here' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Look around' }));
    const view = moved(fake().viewTransform(), 2);
    act(() => fake().moveView(view));
    await user.click(screen.getByRole('button', { name: 'Move the camera here' }));
    expect(setupOf(studio()).camera.transform).toEqual(view);
    expect(studio().undoLabel).toBe('Move the camera');
    expect(onAnnounce).toHaveBeenLastCalledWith('The scene’s camera is where the view is now.');
    // The camera's own handles write it too.
    const back = moved(view, -2);
    act(() => fake().drag({ target: { object: CAMERA }, transform: back, final: true }));
    expect(setupOf(studio()).camera.transform).toEqual(back);
  });

  it('rehearses in Camera view, with no handles, and edits again after Stop', async () => {
    const user = userEvent.setup();
    const { fake } = await stage();
    await user.click(screen.getByRole('radio', { name: 'Look around' }));
    await user.click(screen.getByRole('button', { name: 'Rehearse' }));
    expect(fake().isEditingNow()).toBe(false);
    expect((screen.getByRole('radio', { name: 'Look around' }) as HTMLInputElement).disabled).toBe(
      true,
    );
    await user.click(await screen.findByRole('button', { name: 'Stop' }));
    await waitFor(() => expect(fake().isEditingNow()).toBe(true));
    expect((screen.getByRole('radio', { name: 'Camera view' }) as HTMLInputElement).checked).toBe(
      true,
    );
  });

  it('has no handles or Move the camera here on a film that can’t be changed', async () => {
    const user = userEvent.setup();
    const { fake, studio } = await stage();
    await act(async () => studio().open(example, 'It’s handed in.'));
    await waitFor(() => expect(fake().isEditingNow()).toBe(false));
    await user.click(screen.getByRole('radio', { name: 'Look around' }));
    expect(screen.queryByRole('button', { name: 'Move the camera here' })).toBeNull();
  });
});
