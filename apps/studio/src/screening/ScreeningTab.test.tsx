import { basisFor } from '@storystage/check';
import { browserHost, type HostInterface } from '@storystage/host';
import { exampleProduction, type Production, type ProductionFiles } from '@storystage/production';
import type { ImportWorker } from '@storystage/backstage-import/worker-client';
import type { EncoderBackend, FilmExport, Frame } from '@storystage/export';
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
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ExportJob } from '@storystage/screening';
import { useModelSource } from '../stage/useModelSource.ts';
import { useStudio } from '../studio.ts';
import { exportSlot } from './exportSlot.ts';
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

const NO_FILES: ProductionFiles = { audio: new Map(), models: new Map() };

/** An encoder that keeps nothing, and a compositor with one frame-sized buffer. */
const FAKE_ENCODING = {
  backend: {
    canEncodeVideo: async () => true,
    canEncodeAudio: async () => true,
    open: async () => ({
      addFrame: async () => undefined,
      addAudio: async () => undefined,
      finish: async () => new ArrayBuffer(8),
      cancel: async () => undefined,
    }),
  } satisfies EncoderBackend,
  compositor: (size: { width: number; height: number }) => {
    const frame: Frame = {
      kind: 'rgba',
      width: size.width,
      height: size.height,
      data: new Uint8ClampedArray(size.width * size.height * 4),
    };
    return { frame: () => frame };
  },
};

/** An import worker that answers a film check with `result`. */
const checkingWorker = (result: unknown) => (): ImportWorker => {
  let answer: ((event: { data: unknown }) => void) | null = null;
  return {
    postMessage: () => queueMicrotask(() => answer?.({ data: { type: 'filmChecked', result } })),
    addEventListener: (type: string, listener: (event: { data: unknown }) => void) => {
      if (type === 'message') answer = listener;
    },
    terminate: () => undefined,
  } as ImportWorker;
};

function harness(
  over: {
    stage?: StageMaker;
    production?: Production;
    files?: ProductionFiles;
    importWorker?: () => ImportWorker;
    saveFilm?: (film: FilmExport) => Promise<void>;
  } = {},
) {
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
  const slot = exportSlot<ExportJob>();
  let latest: ReturnType<typeof useStudio> | null = null;
  /** What the App holds for the tab: the studio, the one model source and the export slot. */
  function Tab({ active = true, shown = true }: { active?: boolean; shown?: boolean }) {
    const studio = useStudio(over.production ?? exampleProduction());
    latest = studio;
    const models = useModelSource(
      host,
      studio.production,
      over.files ?? NO_FILES,
      over.importWorker ? { startWorker: over.importWorker } : {},
    );
    if (!shown) return null;
    return (
      <ScreeningTab
        studio={studio}
        host={host}
        active={active}
        onPlaceChange={onPlaceChange}
        onOpenProductionStage={onOpenProductionStage}
        models={models}
        exports={slot}
        makeStage={makeStage}
        startWorker={startWorker}
        {...(over.saveFilm ? { saveFilm: over.saveFilm } : {})}
        exportOptions={FAKE_ENCODING}
      />
    );
  }
  const view = render(<Tab />);
  return {
    view,
    slot,
    /** The studio as the tab last saw it. */
    studio: () => latest!,
    /** Shows or hides the tab, as Learn or Settings opening over it does. */
    setActive: (active: boolean) => view.rerender(<Tab active={active} />),
    /** Leaves the tab for another, or comes back: the tab unmounts, the App doesn't. */
    setShown: (shown: boolean) => view.rerender(<Tab shown={shown} />),
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

  it('pauses and stops drawing while Learn or Settings is over it, and draws again after', async () => {
    const drawing: string[] = [];
    const { setActive } = harness({
      stage: async () =>
        Object.assign(new FakeStage(), {
          startLive: () => drawing.push('start'),
          stopLive: () => drawing.push('stop'),
        }),
    });
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Pause' });
    setActive(false);
    expect(await screen.findByRole('button', { name: 'Play' })).toBeTruthy();
    expect(drawing.at(-1)).toBe('stop');
    setActive(true);
    expect(drawing.at(-1)).toBe('start');
  });

  it("names a film's packed models that didn't pass the check, which show as outlines", async () => {
    const p = exampleProduction();
    const gran = {
      folder: 'gran',
      item: { displayName: 'Gran' },
    } as unknown as Production['manifest']['models'][number];
    harness({
      production: { ...p, manifest: { ...p.manifest, models: [gran] } },
      importWorker: checkingWorker({
        checked: [],
        refused: [{ folder: 'gran', name: 'Gran', reason: 'Its model is missing from the film.' }],
      }),
    });
    expect(await screen.findByText('Gran: Its model is missing from the film.')).toBeTruthy();
    expect(screen.getByText('Some models this film carries show as outlines here:')).toBeTruthy();
  });

  it('exports the film from its dialog, on a hidden stage it lets go, and saves it', async () => {
    const saved: FilmExport[] = [];
    const { made, studio } = harness({ saveFilm: async (film) => void saved.push(film) });
    await screen.findByRole('button', { name: 'Play' });
    await userEvent.click(screen.getByRole('button', { name: 'Export film' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export film' });
    expect(dialog).toBeTruthy();
    // Opening it checks the film first, on a hidden stage of its own.
    await waitFor(
      () => expect(studio().production.frames.every((f) => f.check !== undefined)).toBe(true),
      { timeout: 10_000 },
    );
    const before = made.length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export film' }));
    expect(
      await screen.findByText(
        'The Lost Penguin is saved, with its captions beside it.',
        {},
        { timeout: 10_000 },
      ),
    ).toBeTruthy();
    expect(saved).toHaveLength(1);
    expect(saved[0]!.vtt).toContain('PIP: Oh no, the ice is moving!');
    const forExport = made.slice(before).filter((m) => m.hidden);
    expect(forExport).toHaveLength(1);
    expect(forExport[0]!.stage.calls.some((c) => c.method === 'dispose')).toBe(true);
  }, 20_000);

  it('goes on exporting when the learner changes tab (Keep working), and shows it on coming back', async () => {
    let release = () => {};
    const saving = new Promise<void>((ok) => (release = ok));
    const saved: FilmExport[] = [];
    const { slot, setShown } = harness({
      saveFilm: async (film) => {
        await saving;
        saved.push(film);
      },
    });
    await screen.findByRole('button', { name: 'Play' });
    await userEvent.click(screen.getByRole('button', { name: 'Export film' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export film' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Export film' }));
    setShown(false);
    expect(slot.get()?.state.kind).toBe('running');
    release();
    await waitFor(() => expect(slot.get()?.state.kind).toBe('done'), { timeout: 10_000 });
    expect(saved).toHaveLength(1);
    setShown(true);
    await screen.findByRole('button', { name: 'Play' });
    await userEvent.click(screen.getByRole('button', { name: 'Export film' }));
    expect(
      await screen.findByText('The Lost Penguin is saved, with its captions beside it.'),
    ).toBeTruthy();
  }, 20_000);

  it('writes retake notes to the scene’s card as one undo step, without measuring the film again', async () => {
    const { studio, made } = harness();
    await screen.findByRole('button', { name: 'Play' });
    const measured = made.filter((m) => m.hidden).length;
    const box = screen.getByRole('textbox', { name: 'Notes for scene 1' });
    await userEvent.type(box, 'Pip slower');
    await userEvent.tab();
    const card = studio().production.storyboard.cards.find((c) => c.id === 's1');
    expect(card?.retakeNotes).toBe('Pip slower');
    expect(studio().undoLabel).toBe('Retake notes for scene 1');
    expect(made.filter((m) => m.hidden).length).toBe(measured);
  });

  it("compares a frame's sketch with a still drawn on the shown stage", async () => {
    const { made } = harness();
    await screen.findByRole('button', { name: 'Play' });
    expect(screen.getByRole('heading', { name: 'Compare with storyboard' })).toBeTruthy();
    expect(screen.getByText('Frame 1.1')).toBeTruthy();
    const shown = made.find((m) => !m.hidden)!.stage;
    await waitFor(() => expect(shown.calls.some((c) => c.method === 'picture')).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    expect(await screen.findByText('Frame 2.1')).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Notes for scene 2' })).toBeTruthy();
  });

  it('keeps the still with the sketch beside it when the arrows are pressed quickly', async () => {
    harness();
    await screen.findByRole('button', { name: 'Play' });
    const next = screen.getByRole('button', { name: 'Next frame' });
    await userEvent.click(next);
    await userEvent.click(next);
    expect(await screen.findByText('Frame 3.1')).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('img', { name: /for frame 3.1$/ })).toBeTruthy());
    expect(screen.queryByRole('img', { name: /for frame 2.1$/ })).toBeNull();
  });

  it('pauses the film for an arrow, and follows the film again on Play', async () => {
    harness();
    await userEvent.click(await screen.findByRole('button', { name: 'Play' }));
    await screen.findByRole('button', { name: 'Pause' });
    await userEvent.click(screen.getByRole('button', { name: 'Next frame' }));
    expect(await screen.findByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.getByText('Frame 2.1')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    // Compare follows the film again: the frame playing, not the one chosen.
    await waitFor(() => expect(screen.queryByText('Frame 2.1')).toBeNull(), { timeout: 5_000 });
  });

  it('checks the whole film on a hidden stage it lets go, and saves the results with no undo step', async () => {
    const { studio, made } = harness();
    await screen.findByRole('button', { name: 'Play' });
    const undo = studio().undoLabel;
    const before = made.length;
    expect(screen.getByText(/frames haven’t been checked/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Check the whole film' }));
    await waitFor(
      () => expect(studio().production.frames.every((f) => f.check !== undefined)).toBe(true),
      { timeout: 10_000 },
    );
    await waitFor(() => expect(screen.queryByText(/haven’t been checked/)).toBeNull());
    expect(studio().undoLabel).toBe(undo);
    const forCheck = made.slice(before).filter((m) => m.hidden);
    expect(forCheck).toHaveLength(1);
    expect(forCheck[0]!.stage.calls.some((c) => c.method === 'dispose')).toBe(true);
  }, 20_000);

  it('keeps a flag as the learner’s own undo step', async () => {
    const p = exampleProduction();
    const flagged: Production = {
      ...p,
      frames: p.frames.map((f) => ({
        ...f,
        check: {
          basis: basisFor(p, f),
          items:
            f.id === 'f1'
              ? [{ id: 'a', kind: 'onScreen', outcome: 'flag', words: 'Pip isn’t there' }]
              : [],
          kept: [],
        },
      })),
    };
    const { studio } = harness({ production: flagged });
    await screen.findByRole('button', { name: 'Play' });
    expect(screen.getByText('Frame 1.1: Pip isn’t there')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Keep this flag on frame 1.1' }));
    expect(studio().production.frames.find((f) => f.id === 'f1')?.check?.kept).toEqual(['a']);
    expect(studio().undoLabel).toBe('Keep the flag on frame 1.1');
    expect(
      await screen.findByRole('button', { name: 'Kept on frame 1.1. Let it go' }),
    ).toBeTruthy();
  });

  it('checks the film first when Export film opens, and lists what it found', async () => {
    const { studio } = harness();
    await screen.findByRole('button', { name: 'Play' });
    await userEvent.click(screen.getByRole('button', { name: 'Export film' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export film' });
    await waitFor(
      () => expect(studio().production.frames.every((f) => f.check !== undefined)).toBe(true),
      { timeout: 10_000 },
    );
    await waitFor(() => expect(within(dialog).queryByText(/storyboard|look at/)).toBeTruthy());
    expect(within(dialog).queryByText('Checking the film against its storyboard…')).toBeNull();
  }, 20_000);

  it('stops a check that is running when the learner leaves the tab', async () => {
    // The check's hidden stage arrives only when let through, so the check is still running.
    let hold = false;
    let letThrough = () => {};
    const held = new Promise<void>((ok) => (letThrough = ok));
    const forCheck: FakeStage[] = [];
    const { setShown, studio } = harness({
      stage: async (_canvas, { hidden }) => {
        const stage = new FakeStage();
        if (hidden && hold) {
          await held;
          forCheck.push(stage);
        }
        return stage as Stage;
      },
    });
    await screen.findByRole('button', { name: 'Play' });
    hold = true;
    await userEvent.click(screen.getByRole('button', { name: 'Check the whole film' }));
    await screen.findByText(/Checking frame/);
    setShown(false);
    letThrough();
    await waitFor(() => expect(forCheck).toHaveLength(1));
    await waitFor(() => expect(forCheck[0]!.calls.some((c) => c.method === 'dispose')).toBe(true));
    expect(studio().production.frames.some((f) => f.check !== undefined)).toBe(false);
  });

  it("says so in plain words when this device can't make a stage", async () => {
    harness({ stage: async () => Promise.reject(new Error('no WebGL')) });
    expect(await screen.findByText(/can't show the film here/)).toBeTruthy();
  });
});
