import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY, micros } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { demoProduction, sceneId } from '@storystage/production';
import { reportText } from './report.ts';
import { SelfTestFailure, check, runSelfTest, type SelfTestStep } from './runner.ts';
import { STEPS, type SelfTestContext } from './steps.ts';

/** A runtime over in-memory ports, as the worker runs it in the app. */
function startRuntime() {
  const { main, worker } = inMemoryPorts();
  const timers: Timers = { now: () => 0, every: () => () => undefined };
  serve(worker, STORY_LIBRARY, timers);
  return { port: main };
}

const fake: SelfTestContext = { makeStage: () => new FakeStage(), startRuntime };

describe('the self-test on the fake stage', () => {
  it('passes every step', async () => {
    const report = await runSelfTest(STEPS, fake);
    const failures = report.results.filter((r) => r.status === 'fail');
    expect(failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.results.map((r) => [r.id, r.status])).toEqual([
      ['production', 'pass'],
      ['stage', 'pass'],
      ['rehearse', 'pass'],
      ['frames', 'pass'],
      ['state', 'pass'],
      ['export', 'pass'],
      ['undo', 'pass'],
      ['save', 'pass'],
    ]);
  });

  it('writes a plain report that ends with SELFTEST PASS', async () => {
    const text = reportText(await runSelfTest(STEPS, fake));
    expect(text).toMatch(/8 of 8 checks passed/);
    expect(text).toMatch(/✓ Play the whole film’s code, twice, and check both runs match/);
    expect(text).toMatch(/For now: checks that 150 frames come out the same every time/);
    expect(text).toMatch(
      /For now: this device draws with this stage only, so each frame was checked twice/,
    );
    expect(text.trim().split('\n').at(-1)).toBe('SELFTEST PASS');
    for (const word of ['AST', 'node', 'token', 'schema', 'API'])
      expect(text).not.toMatch(new RegExp(`\\b${word}\\b`));
  });
});

describe('the self-test finds problems', () => {
  it('fails when the stage plays a scene differently twice', async () => {
    let runs = 0;
    const flaky: SelfTestContext = {
      startRuntime,
      makeStage: () => {
        const stage = new FakeStage();
        const n = runs++;
        const hash = stage.stateHash.bind(stage);
        // Every second stage drifts, as a renderer with a timing bug would.
        stage.stateHash = () => hash() + (n % 2 && stage.time() > micros15 ? 1 : 0);
        return stage;
      },
    };
    const report = await runSelfTest(STEPS, flaky);
    const frames = report.results.find((r) => r.id === 'frames')!;
    expect(frames.status).toBe('fail');
    expect(frames.detail).toMatch(/played differently the second time/);
    expect(report.passed).toBe(false);
    expect(reportText(report).trim().split('\n').at(-1)).toBe('SELFTEST FAIL');
  });

  it('fails a step whose stage cannot load, and carries on with the rest', async () => {
    const broken: SelfTestContext = {
      startRuntime,
      makeStage: () => {
        const stage = new FakeStage();
        stage.load = () => Promise.reject(new Error('no WebGL'));
        return stage as Stage;
      },
    };
    const report = await runSelfTest(STEPS, broken);
    expect(report.results.find((r) => r.id === 'stage')!.detail).toBe(
      'Something went wrong: no WebGL',
    );
    expect(report.results.find((r) => r.id === 'undo')!.status).toBe('pass');
  });

  it('makes an MP4 where the device can, and checks it is one', async () => {
    const made = (bytes: number[]) => async () => new Uint8Array(bytes).buffer;
    const mp4 = [
      0,
      0,
      0,
      24,
      ...'ftypisom'.split('').map((c) => c.charCodeAt(0)),
      ...new Array(2000).fill(0),
    ];
    const good = await runSelfTest(STEPS, { ...fake, exportFive: made(mp4) });
    expect(good.results.find((r) => r.id === 'export')).toMatchObject({
      status: 'pass',
      standIn: null,
    });
    const bad = await runSelfTest(STEPS, { ...fake, exportFive: made(new Array(2000).fill(0)) });
    expect(bad.results.find((r) => r.id === 'export')).toMatchObject({
      status: 'fail',
      detail: 'The export didn’t make an MP4 file.',
    });
  });

  it('fails when the film’s own code goes wrong', async () => {
    const demo = demoProduction();
    // The running order names a scene the film hasn't got.
    const broken = {
      ...demo,
      manifest: {
        ...demo.manifest,
        runningOrder: [
          ...demo.manifest.runningOrder,
          { scene: sceneId('gone'), transition: { kind: 'cut' as const, duration: micros(0) } },
        ],
      },
    };
    const report = await runSelfTest(
      STEPS,
      { ...fake, production: () => broken },
      { timeLimitMs: 4000 },
    );
    const rehearse = report.results.find((r) => r.id === 'rehearse')!;
    expect(rehearse.status).toBe('fail');
    expect(rehearse.detail).toMatch(/^The film stopped with a problem: /);
  });

  it('stops a step that takes too long', async () => {
    const slow: SelfTestStep<null> = {
      id: 'slow',
      title: 'Wait forever',
      run: () => new Promise(() => {}),
    };
    const report = await runSelfTest([slow], null, { timeLimitMs: 50 });
    expect(report.results[0]).toMatchObject({
      status: 'fail',
      detail: 'This took longer than 50 milliseconds.',
    });
  });

  it('reports each step as it finishes', async () => {
    const seen: string[] = [];
    const steps: SelfTestStep<null>[] = [
      { id: 'a', title: 'A', run: async () => check(true, 'never') },
      {
        id: 'b',
        title: 'B',
        run: async () => {
          throw new SelfTestFailure('B is broken.');
        },
      },
    ];
    const report = await runSelfTest(steps, null, {
      onStep: (r) => seen.push(`${r.id}:${r.status}`),
    });
    expect(seen).toEqual(['a:pass', 'b:fail']);
    expect(report.results[1]!.detail).toBe('B is broken.');
  });
});

describe('scene state on every renderer (WP18.2)', () => {
  /** A stage whose state drifts from half a second into a scene, as a renderer with its own maths would. */
  const drifting = () => {
    const stage = new FakeStage();
    const hash = stage.stateHash.bind(stage);
    stage.stateHash = () => hash() + (stage.time() > micros(0.5) ? 1 : 0);
    return stage;
  };
  const stateOf = async (context: SelfTestContext) => {
    const report = await runSelfTest(STEPS, context);
    return report.results.find((r) => r.id === 'state')!;
  };

  it('passes when every renderer gives the same scene state, frame for frame', async () => {
    const state = await stateOf({
      ...fake,
      renderers: [
        { name: 'WebGL2', makeStage: () => new FakeStage() },
        { name: 'WebGPU', makeStage: () => new FakeStage() },
      ],
    });
    expect(state).toMatchObject({ status: 'pass', standIn: null });
  });

  it('says on which renderer, and from which frame, a film differs', async () => {
    const state = await stateOf({
      ...fake,
      renderers: [
        { name: 'WebGL2', makeStage: () => new FakeStage() },
        { name: 'WebGPU', makeStage: drifting },
      ],
    });
    expect(state.status).toBe('fail');
    expect(state.detail).toMatch(
      /^On WebGPU, “The Lost Penguin \(demo\)” differed from WebGL2 at frame \d+\.$/,
    );
  });

  it('checks the film open in the studio as well as the demo', async () => {
    const demo = demoProduction();
    const open = { ...demo, manifest: { ...demo.manifest, title: 'Owl’s first flight' } };
    let made = 0;
    // The open film is played after the demo: its second run drifts.
    const state = await stateOf({
      ...fake,
      openFilm: () => open,
      renderers: [
        { name: 'WebGL2', makeStage: () => new FakeStage() },
        { name: 'WebGPU', makeStage: () => (made++ === 1 ? drifting() : new FakeStage()) },
      ],
    });
    expect(state.detail).toMatch(/^On WebGPU, “Owl’s first flight” differed from WebGL2/);
  });

  it('plays the demo once a renderer when the open film is the demo', async () => {
    let made = 0;
    const counting = () => {
      made++;
      return new FakeStage();
    };
    const state = await stateOf({
      ...fake,
      openFilm: () => demoProduction(),
      renderers: [
        { name: 'WebGL2', makeStage: counting },
        { name: 'WebGPU', makeStage: counting },
      ],
    });
    expect(state.status).toBe('pass');
    expect(made).toBe(2);
  });
});

const micros15 = 1_500_000;
