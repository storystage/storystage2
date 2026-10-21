import type { Stage } from '@storystage/stage';
import { FakeStage } from '@storystage/stage/testing';
import { describe, expect, it } from 'vitest';
import { reportText } from './report.ts';
import { SelfTestFailure, check, runSelfTest, type SelfTestStep } from './runner.ts';
import { STEPS, type SelfTestContext } from './steps.ts';

const fake: SelfTestContext = { makeStage: () => new FakeStage() };

describe('the self-test on the fake stage', () => {
  it('passes, with saving reported as not ready yet', async () => {
    const report = await runSelfTest(STEPS, fake);
    const failures = report.results.filter((r) => r.status === 'fail');
    expect(failures).toEqual([]);
    expect(report.passed).toBe(true);
    expect(report.results.map((r) => [r.id, r.status])).toEqual([
      ['production', 'pass'],
      ['stage', 'pass'],
      ['rehearse', 'pass'],
      ['export', 'pass'],
      ['undo', 'pass'],
      ['save', 'notReady'],
    ]);
  });

  it('writes a plain report that ends with SELFTEST PASS', async () => {
    const text = reportText(await runSelfTest(STEPS, fake));
    expect(text).toMatch(/5 of 6 checks passed, 1 not ready yet/);
    expect(text).toMatch(/✓ Rehearse each scene, twice, and check both runs match/);
    expect(text).toMatch(/For now: moves set by the self-test/);
    expect(text.trim().split('\n').at(-1)).toBe('SELFTEST PASS');
    for (const word of ['AST', 'node', 'token', 'schema', 'API'])
      expect(text).not.toMatch(new RegExp(`\\b${word}\\b`));
  });
});

describe('the self-test finds problems', () => {
  it('fails when the stage plays a scene differently twice', async () => {
    let runs = 0;
    const flaky: SelfTestContext = {
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
    const rehearse = report.results.find((r) => r.id === 'rehearse')!;
    expect(rehearse.status).toBe('fail');
    expect(rehearse.detail).toMatch(/played differently the second time/);
    expect(report.passed).toBe(false);
    expect(reportText(report).trim().split('\n').at(-1)).toBe('SELFTEST FAIL');
  });

  it('fails a step whose stage cannot load, and carries on with the rest', async () => {
    const broken: SelfTestContext = {
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

const micros15 = 1_500_000;
