import type { BackstageItem } from '@storystage/backstage';
import type { EditorHost } from '@storystage/editor-contract';
import {
  exampleProduction,
  type Frame,
  type PlacedSketch,
  type Production,
} from '@storystage/production';
import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import type { ModelSource } from '@storystage/stage/babylon';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY, type BackstageId } from '@storystage/story-api';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { useStudio, type Studio } from '../studio.ts';
import { ProductionStage } from './ProductionStage.tsx';

// "Set up this scene from your storyboard?" on the Production stage (WP10.10; M4 gate section 4).

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

const item = (id: string, section: BackstageItem['section'], cls: string, name: string) =>
  ({
    id,
    section,
    class: cls,
    displayName: name,
    themes: [],
    defaultSize: { height: 1.6 },
  }) as unknown as BackstageItem;
const CATALOGUE = [
  item('kaykit/Biped/knight', 'cast', 'Biped', 'Knight'),
  item('kaykit/Flyer/owl', 'cast', 'Flyer', 'Owl'),
  item('kaykit/Ground/forest', 'backdrops', 'Ground', 'Forest floor'),
];
const models: ModelSourceHandle = {
  source: {} as ModelSource,
  prepare: async () => undefined,
  item: (id) => CATALOGUE.find((i) => i.id === id),
  refused: [],
  catalogue: CATALOGUE,
  thumbnail: () => null,
};
const host = { program: () => exampleProduction().program } as unknown as EditorHost;

const example = exampleProduction();
const scene = example.scenes[0]!.id;
const first = example.frames.find((f) => f.scene === scene)!;
const sketch = (id: string, item: string, x: number): PlacedSketch => ({
  id,
  item: item as BackstageId,
  facing: 'front',
  pose: null,
  x,
  y: 0.6,
  scale: 1,
  flipped: false,
  layer: 0,
});
/** Scene 1's frame 1.1 sketched with the knight and trees, and the owl in a frame 1.2. */
const storyboarded: Production = {
  ...example,
  frames: [
    ...example.frames.map((f) =>
      f.id === first.id
        ? {
            ...f,
            sketches: [sketch('k', 'kaykit/Biped/knight', 0.3), sketch('t', 'backdrop/trees', 0.5)],
          }
        : f,
    ),
    {
      ...first,
      id: 'f12' as Frame['id'],
      order: 1,
      links: [],
      sketches: [sketch('o', 'kaykit/Flyer/owl', 0.9)],
    },
  ],
};

function stage(production: Production = storyboarded) {
  let latest: Studio | null = null;
  const onAnnounce = vi.fn<(text: string) => void>();
  const makeStage: StageMaker = async () => new FakeStage() as Stage;
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
  return { studio: () => latest!, onAnnounce };
}

const offer = () =>
  screen.queryByRole('region', { name: 'Set up this scene from your storyboard?' });
const names = (studio: Studio) => studio.production.scenes[0]!.setup.objects.map((o) => o.id);

describe('Set up this scene from your storyboard? (WP10.10)', () => {
  it('lists what the storyboard shows and places everything as one undo step', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = stage();
    const card = offer()!;
    expect(within(card).getByText('Knight')).toBeTruthy();
    expect(within(card).getByText('Owl, waiting just off stage')).toBeTruthy();
    expect(within(card).getByText('Forest floor as the ground')).toBeTruthy();
    await user.click(within(card).getByRole('button', { name: 'Place everything' }));
    expect(names(studio())).toEqual(['penguin', 'fox', 'knight', 'owl']);
    expect(studio().production.scenes[0]!.setup.backdrop.ground).toBe('kaykit/Ground/forest');
    expect(studio().undoLabel).toBe('Set up scene 1 from the storyboard');
    expect(onAnnounce).toHaveBeenLastCalledWith('3 things from the storyboard are on the stage.');
    expect(offer()).toBeNull();
    act(() => studio().undo());
    expect(names(studio())).toEqual(['penguin', 'fox']);
    expect(studio().production.scenes[0]!.setup.backdrop.ground).toBe(
      example.scenes[0]!.setup.backdrop.ground,
    );
  });

  it('places only what’s chosen', async () => {
    const user = userEvent.setup();
    const { studio } = stage();
    await user.click(within(offer()!).getByRole('button', { name: 'Choose what to place' }));
    await user.click(
      within(offer()!).getByRole('checkbox', { name: 'Owl, waiting just off stage' }),
    );
    await user.click(
      within(offer()!).getByRole('checkbox', { name: 'Forest floor as the ground' }),
    );
    await user.click(within(offer()!).getByRole('button', { name: 'Place this one' }));
    expect(names(studio())).toEqual(['penguin', 'fox', 'knight']);
  });

  it('places nothing on Not now, and Set up from storyboard asks again', async () => {
    const user = userEvent.setup();
    const { studio } = stage();
    await user.click(within(offer()!).getByRole('button', { name: 'Not now' }));
    expect(offer()).toBeNull();
    expect(names(studio())).toEqual(['penguin', 'fox']);
    await user.click(await screen.findByRole('button', { name: 'Set up from storyboard' }));
    expect(offer()).not.toBeNull();
  });

  it('says so when everything is on the stage already, and offers nothing then', async () => {
    const user = userEvent.setup();
    stage(example);
    expect(offer()).toBeNull();
    await user.click(await screen.findByRole('button', { name: 'Set up from storyboard' }));
    expect(
      screen.getByText('Everything the storyboard shows is on the stage already.'),
    ).toBeTruthy();
  });

  it('offers nothing on a film that can’t be changed', async () => {
    const { studio } = stage();
    await act(async () => studio().open(storyboarded, 'It’s handed in.'));
    expect(offer()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Set up from storyboard' })).toBeNull();
  });
});
