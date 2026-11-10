import { nodeId } from '@storystage/ast';
import type { Timeline } from '@storystage/playback';
import { exampleProduction, sceneId, type SceneStep } from '@storystage/production';
import { micros, type Micros } from '@storystage/story-api';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RoughCut, reorder, type Place, type RoughCutProps } from './RoughCut.tsx';

const S1 = sceneId('s1');
const S2 = sceneId('s2');
const S3 = sceneId('s3');

const timeline = (over: Partial<Timeline> = {}): Timeline => ({
  scenes: [
    { scene: S1, transition: null, start: 0, length: micros(20), waits: false },
    {
      scene: S2,
      transition: { kind: 'cut', duration: 0 },
      start: micros(20),
      length: micros(30),
      waits: false,
    },
    {
      scene: S3,
      transition: { kind: 'fadeToBlack', duration: micros(1) },
      start: micros(50),
      length: micros(22),
      waits: false,
    },
  ],
  blocks: [],
  lines: [],
  length: micros(72),
  end: { kind: 'ended' },
  missing: [],
  ...over,
});

function setup(over: Partial<RoughCutProps> = {}) {
  const props: RoughCutProps = {
    production: exampleProduction(),
    timeline: timeline(),
    time: micros(38),
    playing: false,
    onPlayPause: vi.fn(),
    onSeek: vi.fn<(t: Micros) => void>(),
    player: <canvas aria-label="Stage" />,
    captions: [],
    error: null,
    onOpenProductionStage: vi.fn(),
    onStep: vi.fn<(s: SceneStep) => void>(),
    onPlaceChange: vi.fn<(p: Place) => void>(),
    ...over,
  };
  render(<RoughCut {...props} />);
  return props;
}

describe('RoughCut', () => {
  it('shows the time so far and the length, and a bar that says it', () => {
    setup();
    expect(screen.getByText('0:38 / 1:12')).toBeTruthy();
    const bar = screen.getByRole('slider', { name: 'Where the film is' });
    expect(bar.getAttribute('aria-valuetext')).toBe('0:38 of 1:12');
  });

  it('names a segment for each scene, by number and heading', () => {
    setup();
    for (const name of ['1. Ice shelf, morning', '2. Forest, night', '3. Ice shelf, evening'])
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
  });

  it('labels the player with the scene and frame', () => {
    setup({ time: micros(21) });
    expect(screen.getByText('Scene 2 · Frame 2.1')).toBeTruthy();
  });

  it('moves 5 seconds with the arrow keys, and to the ends with Home and End', async () => {
    const props = setup();
    screen.getByRole('slider').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(props.onSeek).toHaveBeenLastCalledWith(micros(43));
    await userEvent.keyboard('{Home}');
    expect(props.onSeek).toHaveBeenLastCalledWith(0);
    await userEvent.keyboard('{End}');
    expect(props.onSeek).toHaveBeenLastCalledWith(micros(72));
  });

  it('plays from where the bar is clicked', () => {
    const props = setup();
    const bar = screen.getByRole('slider');
    bar.getBoundingClientRect = () => ({ left: 0, width: 720, top: 0, height: 10 }) as DOMRect;
    fireEvent.click(bar, { clientX: 360 });
    expect(props.onSeek).toHaveBeenCalledWith(micros(36));
  });

  it('has one button for Play and Pause', async () => {
    const props = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(props.onPlayPause).toHaveBeenCalledOnce();
  });

  it('says Pause while playing', () => {
    setup({ playing: true });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it("plays from a scene's start when its card is chosen", async () => {
    const props = setup();
    const cards = screen.getByRole('grid', { name: 'Running order' });
    expect(cards).toBeTruthy();
    await userEvent.click(screen.getByRole('row', { name: '3. Ice shelf, evening' }));
    expect(props.onSeek).toHaveBeenCalledWith(micros(50));
  });

  it('gives each card a move handle named for its scene', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Move scene 2' })).toBeTruthy();
  });

  it('marks a scene that waits for a click, and adds "+" to the length', () => {
    const t = timeline();
    setup({
      timeline: { ...t, scenes: t.scenes.map((s, i) => (i === 1 ? { ...s, waits: true } : s)) },
    });
    expect(screen.getByText('waits for a click')).toBeTruthy();
    expect(screen.getByText('0:38 / 1:12+')).toBeTruthy();
    expect(screen.getByText('0:30+')).toBeTruthy();
  });

  it('shows the captions under the picture', () => {
    setup({ captions: ['PIP: Hello.', 'FOX: Hi.'] });
    expect(screen.getByText('PIP: Hello.')).toBeTruthy();
    expect(screen.getByText('FOX: Hi.')).toBeTruthy();
  });

  it('shows an error in plain words, and opens its block on the Production stage', async () => {
    const node = nodeId('badblk');
    const props = setup({
      time: micros(21),
      error: { words: "This block got something it can't use.", node },
    });
    expect(screen.getByRole('alert').textContent).toBe("This block got something it can't use.");
    await userEvent.click(screen.getByRole('button', { name: 'Fix on the Production stage' }));
    expect(props.onOpenProductionStage).toHaveBeenCalledWith(node, { scene: S2, frame: 'f2' });
  });

  it('tells the studio the current place, once for each change', () => {
    const props = setup({ time: micros(21) });
    expect(props.onPlaceChange).toHaveBeenCalledOnce();
    expect(props.onPlaceChange).toHaveBeenCalledWith({ scene: S2, frame: 'f2' });
  });

  it('shows the player and says it is getting ready while the film is measured', () => {
    setup({ timeline: null });
    expect(screen.getByRole('region', { name: 'The film' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Getting the film ready…');
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Play' })).toBeNull();
  });

  it("names the models a scene couldn't find, which show as outlines while the film plays on", () => {
    setup({
      timeline: timeline({
        missing: [
          {
            scene: S2,
            missing: [
              { kind: 'model', object: 'fox' as never, model: 'class/Quadruped/red-fox' as never },
              { kind: 'backdrop', id: 'class/Ground/moss' as never },
            ],
          },
        ],
      }),
    });
    expect(
      screen.getByText(
        "Scene 2 uses red-fox, which this device can't find, so it shows as an outline. Choose it again in Backstage.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/Scene 2's backdrop isn't all here/)).toBeTruthy();
  });

  it('says when the film is cut at 10 minutes', () => {
    setup({ timeline: timeline({ end: { kind: 'cap' } }) });
    expect(screen.getByText(/longer than 10 minutes/)).toBeTruthy();
  });
});

describe('reorder', () => {
  it('moves a scene as one step, and refuses a scene that is not there', () => {
    const p = exampleProduction();
    const step = reorder(p, S3, S1, 'before');
    expect(step?.production.manifest.runningOrder.map((r) => r.scene)).toEqual([S3, S1, S2]);
    expect(step?.label).toBe('Move scene 3');
    expect(reorder(p, sceneId('nope'), S1, 'before')).toBeNull();
  });
});
