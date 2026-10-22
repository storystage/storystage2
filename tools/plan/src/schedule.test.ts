import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { actual, blocks, fill, roundHalfEven, sectionOf } from './render.ts';
import { criticalPath, readPlan, schedule, simulateCap, simulateRoster } from './schedule.ts';

const real = readFileSync(new URL('../schedule.yaml', import.meta.url), 'utf8');

/** A small plan: A then B and C together, then the release candidate and the pilot. */
const small = (extra = '') => `
week0: 2026-10-19
later_lanes: [Later]
lane_caps: [1, 2]
recommended_lanes: 2
bases:
  guess: A guess.
items:
  - { id: A, label: A, lane: L, who: C, weeks: 1, basis: guess, after: [] }
  - { id: B, label: B, lane: L, who: C, weeks: 2, basis: guess, after: [A] }
  - { id: C, label: C, lane: L, who: C, weeks: 1, basis: guess, after: [A] }
  - { id: RC, label: Release candidate, lane: L, who: '—', weeks: 0, basis: guess, after: [B, C] }
  - { id: WP19, label: Pilot, lane: L, who: U, weeks: 1, basis: guess, after: [RC] }
${extra}
sessions:
  S1: { brief: S1.md, area: All of it, first_release: [A, B, C], later: [] }
`;

const plan = (text: string) => {
  const { plan, errors } = readPlan(text);
  expect(errors).toEqual([]);
  return plan!;
};

describe('the real schedule', () => {
  const s = schedule(plan(real));

  it('gives the workplan dates: release candidate week 18.5, pilot ends week 24.5', () => {
    expect(s.rc).toBe(18.5);
    expect(s.pilotEnd).toBe(24.5);
    expect(s.end).toBe(29.5);
  });

  it('has the critical path in workplan section 5a', () => {
    expect(criticalPath(s)).toEqual(
      expect.arrayContaining(['WP0', 'WP1', 'WP5a', 'WP4b', 'WP7', 'WP10b', 'WP13c', 'WP18b']),
    );
  });

  it('gives what each lane cap costs, as section 5a says', () => {
    expect(simulateCap(s, 8)).toMatchObject({ rc: 18.5, pilotEnd: 24.5 });
    expect(simulateCap(s, 6)).toMatchObject({ rc: 22.5, pilotEnd: 28.5 });
    expect(simulateCap(s, 4)).toMatchObject({ rc: 31.5, pilotEnd: 38 });
  });

  it('puts every item except the release candidate under a section 6 heading', () => {
    const orphans = [...s.items.keys()].filter((id) => !sectionOf(id));
    expect(orphans).toEqual(['RC']);
  });
});

describe('readPlan', () => {
  it('reads a good plan', () => {
    expect(plan(small()).items.map((it) => it.id)).toEqual(['A', 'B', 'C', 'RC', 'WP19']);
  });

  it.each([
    ['an unknown dependency', small().replace('after: [A] }', 'after: [Z] }'), 'B waits for Z'],
    ['a loop', small().replace('after: [] }', 'after: [C] }'), 'A loop of dependencies'],
    ['a repeated id', small().replace('id: C,', 'id: B,'), 'B is listed twice'],
    [
      'an unknown basis',
      small().replace('basis: guess, after: []', 'basis: hope, after: []'),
      'basis "hope"',
    ],
    [
      'a misspelt field',
      small().replace(
        'weeks: 1, basis: guess, after: [] }',
        'weeks: 1, basis: guess, after: [], strated: 2026-10-20 }',
      ),
      'unknown field "strated"',
    ],
    [
      'finishing before starting',
      small().replace('after: [] }', 'after: [], started: 2026-10-21, finished: 2026-10-20 }'),
      'finished before it started',
    ],
    [
      'an item in two sessions',
      small().replace(
        'later: [] }',
        'later: [] }\n  S2: { brief: S2.md, area: Again, first_release: [A], later: [] }',
      ),
      'A is in both S1 and S2',
    ],
    ['no pilot', small().replace('id: WP19', 'id: WP20'), 'The item WP19 is missing'],
  ])('reports %s', (_, text, message) => {
    const { plan, errors } = readPlan(text);
    expect(plan).toBeUndefined();
    expect(errors.join('\n')).toContain(message);
  });

  it('reports YAML that does not parse', () => {
    expect(readPlan('items: [').errors[0]).toContain('not valid YAML');
  });
});

describe('schedule', () => {
  const s = schedule(plan(small()));

  it('starts each item when what it waits for has finished', () => {
    expect(s.items.get('B')).toMatchObject({ es: 1, ef: 3, slack: 0 });
    expect(s.items.get('C')).toMatchObject({ es: 1, ef: 2, slack: 1 });
    expect(s.rc).toBe(3);
    expect(s.pilotEnd).toBe(4);
  });

  it('runs B and C one after the other when only one lane is allowed, B first (less slack)', () => {
    expect(simulateCap(s, 1)).toMatchObject({ rc: 4, pilotEnd: 5 });
    expect(simulateCap(s, 2)).toMatchObject({ rc: 3, pilotEnd: 4 });
  });

  it('runs a session’s items one at a time, in its order', () => {
    const { start } = simulateRoster(s);
    expect([start.get('A'), start.get('B'), start.get('C')]).toEqual([0, 1, 3]);
  });
});

describe('rendering', () => {
  it('rounds halves to even, like the original Python', () => {
    expect([10.5, 31.5, 24.5, 3.2].map(roundHalfEven)).toEqual([10, 32, 24, 3]);
  });

  it('shows what actually happened', () => {
    const base = schedule(plan(small())).items.get('A')!;
    expect(actual(base)).toBe('');
    expect(actual({ ...base, started: '2026-10-21' })).toBe('started 21 Oct');
    expect(actual({ ...base, started: '2026-10-20', finished: '2026-10-21' })).toBe(
      '0.3 (20–21 Oct)',
    );
    expect(actual({ ...base, started: '2026-10-28', finished: '2026-11-03' })).toBe(
      '1 (28 Oct–3 Nov)',
    );
  });

  it('maps item ids to section 6 headings', () => {
    expect(['WP11a', 'WP1.1', 'WP1g', 'WP0s', 'WP10', 'RC'].map(sectionOf)).toEqual([
      '11',
      '1',
      '1',
      '0',
      '10',
      undefined,
    ]);
  });

  it('cites each section’s items and what they wait for', () => {
    const s = schedule(plan(real));
    expect(blocks(s)['docs/WORKPLAN.md']!.wp11).toBe(
      '\n**Schedule items** (`tools/plan/schedule.yaml`): WP11a after WP1; WP11b after WP8, WP11a, WP12b; WP11c after WP10b, WP11b.\n',
    );
  });
});

describe('fill', () => {
  const doc = 'Intro\n<!-- schedule:a -->\nold\n<!-- /schedule:a -->\nEnd\n';

  it('replaces what is between the markers, and nothing else', () => {
    expect(fill(doc, { a: '\nnew\n' })).toEqual({
      text: 'Intro\n<!-- schedule:a -->\nnew\n<!-- /schedule:a -->\nEnd\n',
      errors: [],
    });
  });

  it('reports a missing block, a repeated one and an unknown one', () => {
    expect(fill(doc, { b: '' }).errors).toEqual([
      'an unknown block "a"',
      'the block "b" should appear once, as <!-- schedule:b --> … <!-- /schedule:b -->',
    ]);
    expect(fill(doc + doc, { a: '' }).errors).toHaveLength(1);
  });
});
