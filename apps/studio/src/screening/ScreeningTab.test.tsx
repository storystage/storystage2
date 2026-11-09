import { browserHost, type HostInterface } from '@storystage/host';
import { exampleProduction, type Production } from '@storystage/production';
import {
  inMemoryPorts,
  serve,
  type FromRuntime,
  type Port,
  type Timers,
  type ToRuntime,
} from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY } from '@storystage/story-api';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import { useStudio } from '../studio.ts';
import { ScreeningTab, type ScreeningTabProps } from './ScreeningTab.tsx';

/** No shipped Backstage folder and no class: stand-ins only, as in a test. */
const host: HostInterface = {
  ...browserHost,
  backstageFolder: '',
  classes: {
    ...browserHost.classes,
    backstage: () => {
      throw new Error('No class open.');
    },
  },
};

function harness(over: { stage?: StageMaker; production?: Production } = {}) {
  const made: { hidden: boolean; stage: FakeStage }[] = [];
  let started = 0;
  let ended = 0;
  const makeStage: StageMaker =
    over.stage ??
    (async (_canvas, { hidden }) => {
      const stage = new FakeStage();
      made.push({ hidden, stage });
      return stage as Stage;
    });
  const startWorker = () => {
    started++;
    const { main, worker } = inMemoryPorts();
    const timers: Timers = { now: () => 0, every: () => () => undefined };
    serve(worker, STORY_LIBRARY, timers);
    const port: Port<ToRuntime, FromRuntime> = main;
    return { port, terminate: () => ended++ };
  };
  const onPlaceChange = vi.fn<ScreeningTabProps['onPlaceChange']>();
  const onOpenProductionStage = vi.fn<ScreeningTabProps['onOpenProductionStage']>();
  function Tab() {
    const studio = useStudio(over.production ?? exampleProduction());
    return (
      <ScreeningTab
        studio={studio}
        host={host}
        onPlaceChange={onPlaceChange}
        onOpenProductionStage={onOpenProductionStage}
        makeStage={makeStage}
        startWorker={startWorker}
      />
    );
  }
  const view = render(<Tab />);
  return {
    view,
    made,
    workers: () => ({ started, ended }),
    onPlaceChange,
    onOpenProductionStage,
  };
}

describe('ScreeningTab', () => {
  it('says it is getting the film ready, then shows the rough cut', async () => {
    harness();
    expect(screen.getByRole('status').textContent).toBe('Getting the film ready…');
    expect(await screen.findByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Where the film is' })).toBeTruthy();
    expect(screen.getAllByText('1. Ice shelf, morning').length).toBeGreaterThan(0);
  });

  it('makes its own shown stage, and a hidden one only to measure, which it lets go', async () => {
    const { made } = harness();
    await screen.findByRole('button', { name: 'Play' });
    const shown = made.filter((m) => !m.hidden);
    const hidden = made.filter((m) => m.hidden);
    expect(shown).toHaveLength(1);
    expect(hidden.length).toBeGreaterThan(0);
    for (const h of hidden) expect(h.stage.calls.some((c) => c.method === 'dispose')).toBe(true);
    expect(shown[0]!.stage.calls.some((c) => c.method === 'dispose')).toBe(false);
  });

  it('plays the film on the shown stage', async () => {
    const { made } = harness();
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeTruthy();
    const shown = made.find((m) => !m.hidden)!.stage;
    await waitFor(() => expect(shown.calls.some((c) => c.method === 'load')).toBe(true));
  });

  it('tells the App the place it is at', async () => {
    const { onPlaceChange } = harness();
    await screen.findByRole('button', { name: 'Play' });
    expect(onPlaceChange).toHaveBeenCalledWith({ scene: 's1', frame: 'f1' });
  });

  it('lets every stage and worker go when the learner leaves the tab', async () => {
    const { view, made, workers } = harness();
    await screen.findByRole('button', { name: 'Play' });
    view.unmount();
    for (const m of made) expect(m.stage.calls.some((c) => c.method === 'dispose')).toBe(true);
    expect(workers().ended).toBe(workers().started);
  });

  it("says so in plain words when this device can't make a stage", async () => {
    harness({ stage: async () => Promise.reject(new Error('no WebGL')) });
    expect(await screen.findByText(/can't show the film here/)).toBeTruthy();
  });
});
