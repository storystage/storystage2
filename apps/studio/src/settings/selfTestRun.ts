/**
 * Running the self-test in the studio (WP18.1): on a hidden stage, the runtime worker and, where
 * the browser can encode, a real five-second MP4. Settings › Self-test and Report a problem
 * (WP18.5) both run it this way. The self-test, Babylon.js and the export load only when it runs.
 */
import type { Production } from '@storystage/production';
import type { SelfTestRenderer, SelfTestRuntime, StepResult } from '@storystage/selftest';
import { micros } from '@storystage/story-api';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';

/** The same seed as the Screening room's export, so a film plays the same in both. */
const SEED = 1;

export interface StudioSelfTestOptions {
  readonly models: Pick<ModelSourceHandle, 'source' | 'item'>;
  /** Tests give a stage maker that makes a `FakeStage`, and an in-memory runtime: then no MP4 is made. */
  readonly makeStage?: StageMaker;
  readonly startRuntime?: () => SelfTestRuntime;
  readonly onStep?: (result: StepResult) => void;
  /** The film open in the studio, if any: its scene state is checked on every renderer too. */
  readonly film?: () => Production | null;
}

export interface StudioSelfTestResult {
  /** The plain report, ending `SELFTEST PASS` or `SELFTEST FAIL`. */
  readonly text: string;
  readonly passed: boolean;
}

/** Runs every step. Never throws: a self-test that can't start is a failed run, in words. */
export async function runStudioSelfTest(o: StudioSelfTestOptions): Promise<StudioSelfTestResult> {
  try {
    const [selftest, stages, { startRuntimeWorker }, { exportFilm }] = await Promise.all([
      import('@storystage/selftest'),
      import('../stage/makeStage.ts'),
      import('@storystage/playback'),
      import('@storystage/export'),
    ]);
    const make = o.makeStage ?? stages.makeStage;
    const stage = () => make(stages.hiddenCanvas(), { hidden: true, models: o.models.source });
    // An MP4 only where this browser can encode one; the step says so otherwise.
    const canEncode = typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'function';
    const outcome = await selftest.runSelfTest(
      selftest.STEPS,
      {
        makeStage: stage,
        // Tests' fake stage has no renderer: the step runs it twice, and says so.
        ...(o.makeStage ? {} : { renderers: await renderers(o) }),
        ...(o.film ? { openFilm: o.film } : {}),
        startRuntime: o.startRuntime ?? startRuntimeWorker,
        ...(canEncode && !o.makeStage
          ? {
              exportFive: async (production) => {
                const hidden = await stage();
                try {
                  const film = await exportFilm({
                    production,
                    find: o.models.item,
                    stage: hidden,
                    startWorker: startRuntimeWorker,
                    seed: SEED,
                    titleCard: false,
                    limit: micros(5),
                  });
                  return film.mp4;
                } finally {
                  hidden.dispose();
                }
              },
            }
          : {}),
      },
      { timeLimitMs: 120_000, ...(o.onStep ? { onStep: o.onStep } : {}) },
    );
    return { text: selftest.reportText(outcome), passed: outcome.passed };
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return {
      text: `${words.t('selftest.couldNotStart', { why })}\n\nSELFTEST FAIL`,
      passed: false,
    };
  }
}

/**
 * The renderers this device has, for the scene state step (WP18.2): WebGL2 always, and WebGPU
 * where a WebGPU stage really starts (the stage falls back to WebGL2 without saying).
 */
async function renderers(o: StudioSelfTestOptions): Promise<SelfTestRenderer[]> {
  const [{ createBabylonStage }, { hiddenCanvas }] = await Promise.all([
    import('@storystage/stage/babylon'),
    import('../stage/makeStage.ts'),
  ]);
  const on = (renderer: 'webgl2' | 'webgpu') => () =>
    createBabylonStage({
      canvas: hiddenCanvas(),
      models: o.models.source,
      offscreen: true,
      renderer,
    });
  const list: SelfTestRenderer[] = [{ name: 'WebGL2', makeStage: on('webgl2') }];
  const gpu = (navigator as { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
  if (gpu && (await gpu.requestAdapter().catch(() => null))) {
    const tried = await on('webgpu')().catch(() => null);
    if (tried?.renderer === 'webgpu') list.push({ name: 'WebGPU', makeStage: on('webgpu') });
    tried?.dispose();
  }
  return list;
}

/** How many steps the self-test has, for progress. */
export const SELFTEST_STEPS = 8;
