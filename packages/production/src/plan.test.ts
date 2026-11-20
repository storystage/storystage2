import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import { openProduction, saveProduction } from './file.ts';
import { isFramePlan, withFramePlan } from './plan.ts';
import type { FramePlan, PlanStep, Production } from './types.ts';
import { PLAN_LIMITS } from './validate.ts';

const p = exampleProduction();
const frame = p.frames[0]!.id;

const step = (over: Partial<PlanStep> = {}): PlanStep => ({
  words: 'The penguin walks to the fox',
  kind: 'do',
  actor: 'penguin',
  action: 'moveToward',
  target: 'fox',
  details: [{ name: 'distance', value: '2' }],
  line: '',
  sketch: '',
  together: false,
  repeat: 1,
  why: 'So they meet in the middle of the stage.',
  ...over,
});

/** As the Prompter showed it, and as the learner built it: they made it 3 metres. */
const plan: FramePlan = {
  agreedAt: '2026-11-17T21:30:00.000Z',
  shown: [step(), step({ kind: 'when', action: 'whenClicked', target: '', together: true })],
  agreed: [
    step({ details: [{ name: 'distance', value: '3' }] }),
    step({ kind: 'when', action: 'whenClicked', target: '', together: true }),
  ],
};

describe('a frame’s agreed plan (format 1.6.0, spec 04 section 6.7)', () => {
  it('is kept through a save and an open, as shown and as agreed', () => {
    const planned = withFramePlan(p, frame, plan);
    const opened = openProduction(saveProduction(planned));
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') return;
    expect(opened.dropped).toEqual([]);
    expect(opened.production.frames.find((f) => f.id === frame)!.plan).toEqual(plan);
  });

  it('is set and taken away as a pure change, leaving other frames and an unknown frame alone', () => {
    const planned = withFramePlan(p, frame, plan);
    expect(planned.frames[0]!.plan).toEqual(plan);
    expect(planned.frames.slice(1)).toEqual(p.frames.slice(1));
    expect(p.frames[0]!.plan).toBeUndefined();
    const cleared = withFramePlan(planned, frame, null);
    expect('plan' in cleared.frames[0]!).toBe(false);
    expect(withFramePlan(p, 'no-such-frame' as never, plan)).toBe(p);
  });

  it('refuses to write a plan the format wouldn’t keep', () => {
    expect(() => withFramePlan(p, frame, { ...plan, agreedAt: 'yesterday' })).toThrow();
  });

  it('keeps only plans within their shape and limits', () => {
    expect(isFramePlan(plan)).toBe(true);
    expect(isFramePlan({ ...plan, shown: [], agreed: [] })).toBe(true);
    const bad: unknown[] = [
      null,
      { ...plan, agreedAt: '2026-11-17' },
      { ...plan, agreedAt: '2026-13-45T99:00:00Z' },
      { ...plan, extra: 1 },
      { agreedAt: plan.agreedAt, shown: plan.shown },
      { ...plan, shown: Array.from({ length: PLAN_LIMITS.steps + 1 }, () => step()) },
      { ...plan, agreed: [step({ kind: 'jump' as never })] },
      { ...plan, agreed: [step({ repeat: 0 })] },
      { ...plan, agreed: [step({ repeat: 1.5 })] },
      { ...plan, agreed: [step({ repeat: PLAN_LIMITS.repeat + 1 })] },
      { ...plan, agreed: [step({ words: 'x'.repeat(PLAN_LIMITS.text + 1) })] },
      { ...plan, agreed: [step({ together: 'yes' as never })] },
      {
        ...plan,
        agreed: [
          step({
            details: Array.from({ length: PLAN_LIMITS.details + 1 }, () => ({
              name: 'a',
              value: 'b',
            })),
          }),
        ],
      },
      { ...plan, agreed: [step({ details: [{ name: 'a', value: 'b', more: 'c' } as never] })] },
      { ...plan, agreed: [{ ...step(), why: undefined }] },
    ];
    for (const v of bad) expect(isFramePlan(v), JSON.stringify(v)?.slice(0, 80)).toBe(false);
  });

  // Format 1.7.0, spec 04 section 6.6: in Plan only, the steps code ticked off as built.
  it('keeps Plan only’s ticks: step numbers from 1, ascending, each once, none past the plan', () => {
    for (const done of [[], [1], [2], [1, 2]])
      expect(isFramePlan({ ...plan, done }), JSON.stringify(done)).toBe(true);
    for (const done of [[0], [3], [2, 1], [1, 1], [1.5], ['1'], {}, null])
      expect(isFramePlan({ ...plan, done }), JSON.stringify(done)).toBe(false);
    const ticked = withFramePlan(p, frame, { ...plan, done: [1] });
    const opened = openProduction(saveProduction(ticked));
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') return;
    expect(opened.production.frames.find((f) => f.id === frame)!.plan!.done).toEqual([1]);
  });

  it('is dropped whole when a file’s plan doesn’t fit, never the file', () => {
    const misshapen: Production = {
      ...p,
      frames: p.frames.map((f) =>
        f.id === frame ? { ...f, plan: { ...plan, agreed: [step({ repeat: -1 })] } } : f,
      ),
    };
    const opened = openProduction(saveProduction(misshapen));
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') return;
    expect('plan' in opened.production.frames.find((f) => f.id === frame)!).toBe(false);
    expect(opened.dropped).toEqual([
      expect.stringMatching(
        /frames\/.*\.json: plan\.agreed\[0\]\.repeat: .*\(the plan is dropped\)/,
      ),
    ]);
  });
});
