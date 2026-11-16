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

  it('picks an object up from the list by keyboard, as one undo step, saying where it is', async () => {
    const user = userEvent.setup();
    const { fake, studio, onAnnounce } = await stage();
    const before = penguinOf(studio()).transform;
    const penguin = () => within(list()).getByRole('option', { name: /^penguin/ });
    await user.click(penguin());
    await user.keyboard('{Enter}');
    expect(onAnnounce).toHaveBeenLastCalledWith(
      'Picked up penguin. Arrow keys move it, Page Up and Page Down raise and lower it, [ and ] turn it, plus and minus resize it, Enter puts it down.',
    );
    expect(penguin().hasAttribute('data-lifted')).toBe(true);
    // The example's camera looks along +Z: Up is away from it, Right is its right (-X).
    await user.keyboard('{ArrowUp}{Shift>}{ArrowRight}{/Shift}{PageUp}]+');
    const now = penguinOf(studio()).transform;
    expect(now.position.z).toBeCloseTo(before.position.z + 0.1);
    expect(now.position.x).toBeCloseTo(before.position.x - 1);
    expect(now.position.y).toBeCloseTo(before.position.y + 0.1);
    expect(now.scale.x).toBeCloseTo(before.scale.x * 1.1);
    // The keys moved the penguin, not the focus, and the stage shows it where it is.
    expect(document.activeElement).toBe(penguin());
    await waitFor(() => expect(fake().transform(PENGUIN)).toEqual(now));
    await user.keyboard('{Enter}');
    expect(penguin().hasAttribute('data-lifted')).toBe(false);
    expect(onAnnounce.mock.lastCall?.[0]).toMatch(/^Put down penguin at x -?[\d.]+, y 0\.1, z /);
    // One pick-up, one step, named for what it did first.
    expect(studio().undoLabel).toBe('Move penguin');
    act(() => studio().undo());
    expect(penguinOf(studio()).transform).toEqual(before);
  });

  it('puts an object down with Esc, or when focus leaves the list, and lists by arrow keys otherwise', async () => {
    const user = userEvent.setup();
    const { studio } = await stage();
    const option = (name: RegExp) => within(list()).getByRole('option', { name });
    await user.click(option(/^penguin/));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(option(/^fox/));
    await user.keyboard('{Enter}{ArrowUp}{Escape}');
    expect(option(/^fox/).hasAttribute('data-lifted')).toBe(false);
    await user.keyboard('{Enter}');
    expect(option(/^fox/).hasAttribute('data-lifted')).toBe(true);
    await user.tab();
    expect(option(/^fox/).hasAttribute('data-lifted')).toBe(false);
    // Two pick-ups, two steps.
    expect(studio().undoLabel).toBe('Move fox');
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

  it('adds a marker where the view is, chosen and listed, as one undo step', async () => {
    const user = userEvent.setup();
    const { fake, studio, onAnnounce } = await stage();
    // In Camera view, the view is the scene's camera.
    await user.click(screen.getByRole('button', { name: 'Add a marker here' }));
    expect(setupOf(studio()).markers).toEqual([
      { id: 'marker1', transform: setupOf(studio()).camera.transform },
    ]);
    expect(studio().undoLabel).toBe('Add marker1');
    expect(onAnnounce).toHaveBeenLastCalledWith(
      'marker1 is where the view is, in Objects in this scene.',
    );
    const marker1 = within(list()).getByRole('option', { name: /^marker1/ });
    expect(marker1.textContent).toBe('marker1Marker');
    await waitFor(() => expect(marker1.getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(fake().chosen()).toEqual({ marker: 'marker1' }));
    // In Look around, where the view is now.
    await user.click(screen.getByRole('radio', { name: 'Look around' }));
    const view = moved(fake().viewTransform(), 3);
    act(() => fake().moveView(view));
    await user.click(screen.getByRole('button', { name: 'Add a marker here' }));
    expect(setupOf(studio()).markers.map((m) => [m.id, m.transform])).toEqual([
      ['marker1', setupOf(studio()).camera.transform],
      ['marker2', view],
    ]);
    act(() => studio().undo());
    expect(setupOf(studio()).markers.map((m) => m.id)).toEqual(['marker1']);
  });

  it('undoes and redoes the stage’s steps by its buttons and by Ctrl+Z, saying what (7.5)', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = await stage();
    const toolbar = screen.getByRole('toolbar', { name: 'Undo and redo' });
    const undo = within(toolbar).getByRole('button', { name: /^Undo/ });
    const redo = within(toolbar).getByRole('button', { name: /^Redo/ });
    expect(undo.hasAttribute('disabled')).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Add a marker here' }));
    // The button names its step for screen readers.
    expect(undo.textContent).toBe('Undo: Add marker1');
    await user.click(undo);
    expect(setupOf(studio()).markers).toEqual([]);
    expect(onAnnounce).toHaveBeenLastCalledWith('Undone: Add marker1');
    await user.click(redo);
    expect(setupOf(studio()).markers.map((m) => m.id)).toEqual(['marker1']);
    expect(onAnnounce).toHaveBeenLastCalledWith('Redone: Add marker1');
    // The keys, outside text fields.
    await user.click(document.body);
    await user.keyboard('{Control>}z{/Control}');
    expect(setupOf(studio()).markers).toEqual([]);
    await user.keyboard('{Control>}{Shift>}z{/Shift}{/Control}');
    expect(setupOf(studio()).markers.map((m) => m.id)).toEqual(['marker1']);
    // In a text field, Ctrl+Z is the field's own.
    within(list())
      .getByRole('option', { name: /^marker1/ })
      .click();
    const x = await screen.findByRole('textbox', { name: 'x (m)' });
    await user.click(x);
    await user.keyboard('{Control>}z{/Control}');
    expect(setupOf(studio()).markers.map((m) => m.id)).toEqual(['marker1']);
  });

  it('moves a marker by its fields and by the keyboard, and removes it', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = await stage();
    await user.click(screen.getByRole('button', { name: 'Add a marker here' }));
    const fields = screen.getByRole('group', { name: 'Where marker1 is' });
    // A place and a turn, and no size.
    expect(within(fields).queryByRole('textbox', { name: 'Size' })).toBeNull();
    const x = within(fields).getByRole('textbox', { name: 'x (m)' });
    await user.clear(x);
    await user.type(x, '2');
    await user.tab();
    const marker = () => setupOf(studio()).markers[0]!;
    expect(marker().transform.position.x).toBe(2);
    expect(studio().undoLabel).toBe('Move marker1');
    await user.click(within(list()).getByRole('option', { name: /^marker1/ }));
    await user.keyboard('{Enter}{PageUp}+{Enter}');
    expect(marker().transform.position.y).toBeCloseTo(
      example.scenes[0]!.setup.camera.transform.position.y + 0.1,
    );
    expect(marker().transform.scale.x).toBe(1);
    expect(onAnnounce.mock.lastCall?.[0]).toMatch(/^Put down marker1 at x 2, y [\d.]+, z /);
    await user.click(screen.getByRole('button', { name: 'Remove marker1 from the scene' }));
    expect(setupOf(studio()).markers).toEqual([]);
    expect(studio().undoLabel).toBe('Remove marker1');
    expect(within(list()).queryByRole('option', { name: /^marker1/ })).toBeNull();
  });

  it('has no handles or Move the camera here on a film that can’t be changed', async () => {
    const user = userEvent.setup();
    const { fake, studio } = await stage();
    await act(async () => studio().open(example, 'It’s handed in.'));
    await waitFor(() => expect(fake().isEditingNow()).toBe(false));
    expect(screen.queryByRole('button', { name: 'Add a marker here' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Look around' }));
    expect(screen.queryByRole('button', { name: 'Move the camera here' })).toBeNull();
  });
});
