import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import { readArchive, writeArchive } from './archive.ts';
import { openProduction, saveProduction } from './file.ts';
import { isFramePlan, withFramePlan } from './plan.ts';
import { FORMAT_VERSION, type FramePlan, type PlanStep, type Production } from './types.ts';
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
  holds: 0,
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

// Format 1.8.0, spec 04 section 6.8: a repeat step holds the `holds` steps right after it.
describe('a plan’s repeat steps (format 1.8.0, spec 04 section 6.8)', () => {
  const repeat = (times: number, holds: number) =>
    step({
      words: `Repeat ${times} times:`,
      kind: 'repeat',
      actor: '',
      action: '',
      target: '',
      details: [],
      repeat: times,
      holds,
    });
  const hop = (up: boolean) =>
    step({ words: up ? 'Hop up' : 'Hop down', action: 'move', target: '' });
  const looped: FramePlan = {
    agreedAt: plan.agreedAt,
    shown: [repeat(3, 2), hop(true), hop(false), step()],
    agreed: [repeat(3, 2), hop(true), hop(false), step()],
  };

  it('keeps a repeat step holding the steps after it, through a save and an open', () => {
    expect(isFramePlan(looped)).toBe(true);
    expect(isFramePlan({ ...looped, agreed: [step(), repeat(2, 1), hop(true)] })).toBe(true);
    const opened = openProduction(saveProduction(withFramePlan(p, frame, looped)));
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') return;
    expect(opened.dropped).toEqual([]);
    expect(opened.production.frames.find((f) => f.id === frame)!.plan).toEqual(looped);
  });

  it('checks only what keeps the plan readable', () => {
    const bad: unknown[] = [
      { ...looped, agreed: [step({ holds: 1 }), step()] },
      { ...looped, agreed: [repeat(3, 0), hop(true)] },
      { ...looped, agreed: [repeat(3, 2), hop(true)] },
      { ...looped, agreed: [hop(true), repeat(3, 1)] },
      { ...looped, agreed: [repeat(1, 1), hop(true)] },
      { ...looped, agreed: [repeat(3, 1.5), hop(true), hop(false)] },
      { ...looped, agreed: [repeat(3, -1), hop(true)] },
      { ...looped, agreed: [repeat(3, PLAN_LIMITS.steps), hop(true)] },
      { ...looped, agreed: [{ ...hop(true), holds: undefined }] },
    ];
    for (const v of bad) expect(isFramePlan(v), JSON.stringify(v)?.slice(0, 120)).toBe(false);
    // What a repeat may hold is the Prompter's plan check (6.3): rules that may change.
    const when = step({ kind: 'when', action: 'whenClicked', target: '' });
    expect(isFramePlan({ ...looped, agreed: [repeat(2, 1), when] })).toBe(true);
    expect(isFramePlan({ ...looped, agreed: [repeat(2, 2), repeat(2, 1), hop(true)] })).toBe(true);
  });

  /** A saved file as an older version wrote it: its manifest's version and its frames, changed. */
  const asWritten = (production: Production, version: string, frame: (f: unknown) => unknown) => {
    const read = readArchive(saveProduction(production), { wanted: () => true });
    if (!read.ok) throw new Error(read.problem.code);
    const json = (b: Uint8Array) =>
      JSON.parse(new TextDecoder().decode(b)) as Record<string, unknown>;
    const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v));
    return writeArchive(
      read.names.map((name) => {
        const b = read.entries.get(name)!;
        if (name === 'manifest.json')
          return { name, bytes: bytes({ ...json(b), formatVersion: version }) };
        if (/^frames\/.*\.json$/.test(name)) return { name, bytes: bytes(frame(json(b))) };
        return { name, bytes: b };
      }),
    );
  };
  const withoutHolds = (f: unknown) => {
    const fr = f as { plan?: FramePlan };
    if (!fr.plan) return fr;
    const strip = (steps: readonly PlanStep[]) => steps.map(({ holds: _holds, ...rest }) => rest);
    return {
      ...fr,
      plan: { ...fr.plan, shown: strip(fr.plan.shown), agreed: strip(fr.plan.agreed) },
    };
  };

  it('gives every step of a plan kept before 1.8.0 holds 0 when the file opens', () => {
    const old = asWritten(withFramePlan(p, frame, { ...plan, done: [1] }), '1.7.0', withoutHolds);
    const opened = openProduction(old);
    expect(opened.status).toBe('migrated');
    if (opened.status === 'broken') return;
    expect(opened.original).toBe(old);
    expect(opened.dropped).toEqual([]);
    expect(opened.production.frames.find((f) => f.id === frame)!.plan).toEqual({
      ...plan,
      done: [1],
    });
    for (const version of ['1.6.0', '1.0.0'])
      expect(
        openProduction(asWritten(withFramePlan(p, frame, plan), version, withoutHolds)).status,
      ).toBe('migrated');
  });

  it('drops a 1.8.0 or later plan whose steps have no holds, never the file', () => {
    const opened = openProduction(
      asWritten(withFramePlan(p, frame, plan), FORMAT_VERSION, withoutHolds),
    );
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') return;
    expect('plan' in opened.production.frames.find((f) => f.id === frame)!).toBe(false);
    expect(opened.dropped?.[0]).toMatch(/plan\.shown\[0\]: .*holds.*\(the plan is dropped\)/);
  });
});
