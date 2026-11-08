import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CHECK_TYPES,
  NO_FAILURES_ALLOWED,
  checkEvalSet,
  parseRows,
  type EvalProduction,
  type EvalRow,
} from './eval.ts';

const docs = join(import.meta.dirname, '..', '..', '..', 'docs');
const read = (...path: string[]) => readFileSync(join(docs, ...path), 'utf8');

const rows = parseRows(read('eval', 'requests.jsonl'));
const carried = parseRows(read('carried-over', 'eval', 'requests.jsonl'));
const productions = Object.fromEntries(
  readdirSync(join(docs, 'eval', 'productions')).map((file) => [
    file.replace(/\.json$/, ''),
    JSON.parse(read('eval', 'productions', file)) as EvalProduction,
  ]),
);
const inCategory = (category: string) => rows.filter((r) => r.category === category);

describe('the evaluation set', () => {
  it('is sound: every id, mode, check, production, line and frame exists', () => {
    expect(checkEvalSet(rows, productions)).toEqual([]);
  });

  it('keeps every StoryStage 1 request, word for word, so results stay comparable', () => {
    for (const old of carried) {
      const row = rows.find((r) => r.id === old.id);
      expect(row?.request).toBe(old.request);
      expect(row?.category).toBe(old.category);
      expect(row?.start).toBe(old.start);
      expect(row?.checks.length).toBe(old.checks.length);
    }
  });

  it('has no Alice class names or StoryStage 1 words left in it', () => {
    const text = read('eval', 'requests.jsonl');
    expect(text).not.toMatch(/"S(Quadruped|Biped|Flyer|Prop|Transport)"/);
    expect(text).not.toMatch(/no_world_change|gallery|myFirstMethod/);
  });

  it('asks nothing that needs the Prompter to see a picture (rule 3)', () => {
    for (const row of rows) expect(row.request).not.toMatch(/screenshot|photo|this picture/i);
  });

  it('has the new categories WP13.7 asks for, plus the build matching the plan', () => {
    for (const category of ['storyboard', 'story', 'injection', 'plan'])
      expect(inCategory(category).length).toBeGreaterThanOrEqual(8);
    expect(NO_FAILURES_ALLOWED).toEqual(['refusal', 'story', 'plan']);
  });

  it('tries each way a production can carry an injection', () => {
    const markers = inCategory('injection').flatMap((r) =>
      r.checks.flatMap((c) => (typeof c.marker === 'string' ? [c.marker] : [])),
    );
    expect(new Set(markers)).toEqual(
      new Set([
        'INJECT-SCRIPT',
        'INJECT-SYNOPSIS',
        'INJECT-CAPTION',
        'INJECT-COMMENT',
        'INJECT-MODEL',
        'INJECT-NAME',
        'INJECT-TAG',
      ]),
    );
  });

  it('tries a tag-closing injection, which the data block must make harmless', () => {
    expect(read('eval', 'productions', 'injected.json')).toContain('</storyboard_data>');
  });

  it('edits the plan in every way a learner can, and checks the build matched', () => {
    const edits = rows.flatMap((r) => r.plan_edits ?? []).map((e) => e.op);
    expect(new Set(edits)).toEqual(new Set(['change', 'move', 'delete', 'add']));
    for (const row of rows.filter((r) => r.plan_edits))
      expect(row.checks.map((c) => c.type)).toContain('build_matches_plan');
  });

  it('covers the Plan only level', () => {
    const planOnly = rows.filter((r) => r.level === 'planOnly');
    expect(planOnly.length).toBeGreaterThanOrEqual(2);
    for (const row of planOnly) expect(row.checks.map((c) => c.type)).toContain('no_blocks_built');
  });

  it('never leaves the story to a reply check alone in Build it', () => {
    const bad = rows.filter(
      (r) =>
        r.category === 'story' &&
        r.mode === 'buildIt' &&
        !r.checks.some((c) => c.type === 'no_invented_line'),
    );
    expect(bad).toEqual([]);
  });

  it('uses every check type at least once', () => {
    const used = new Set(rows.flatMap((r) => r.checks.map((c) => c.type)));
    expect(Object.keys(CHECK_TYPES).filter((type) => !used.has(type as never))).toEqual([]);
  });

  it('has a category for each row in the declared list', () => {
    expect(new Set(rows.map((r) => r.category))).toEqual(new Set(CATEGORIES));
  });
});

describe('checkEvalSet', () => {
  const good: EvalRow = {
    id: 'a-1',
    category: 'scene',
    start: 'p',
    mode: 'buildIt',
    request: 'Code frame f1-1.',
    checks: [{ type: 'no_errors' }],
  };
  const p: EvalProduction = {
    title: 'P',
    backdrop: 'grass',
    objects: [],
    program: [],
    scenes: [{ id: 's1', heading: 'A field' }],
    frames: [{ id: 'f1-1', scene: 's1', shot: 'wide', caption: 'x' }],
    script: [{ id: 'l1', scene: 's1', text: 'Hi', pinnedFrame: 'f1-1' }],
  };
  const problems = (row: Partial<EvalRow>, production = p) =>
    checkEvalSet([{ ...good, ...row }], { p: production }).filter((m) => m.startsWith('a-1'));

  it('passes a good row', () => {
    expect(problems({})).toEqual([]);
  });

  it.each<[string, Partial<EvalRow>, RegExp]>([
    ['an unknown mode', { mode: 'build' as never }, /no mode/],
    ['an unknown category', { category: 'other' as never }, /no category/],
    ['an unknown production', { start: 'q' }, /no production/],
    ['no checks', { checks: [] }, /no checks/],
    ['an unknown check', { checks: [{ type: 'nope' as never }] }, /no check nope/],
    ['an unknown class', { checks: [{ type: 'has_object', class: 'SBiped' }] }, /no Story API/],
    ['an unknown line', { checks: [{ type: 'says_line', line: 'l9' }] }, /no line l9/],
    ['a missing marker', { checks: [{ type: 'ignores_injection', marker: 'X-1' }] }, /X-1/],
    ['an unknown frame', { request: 'Code frame f9-9.' }, /no frame f9-9/],
  ])('finds %s', (_name, row, message) => {
    expect(problems(row).join()).toMatch(message);
  });

  it('finds two rows with one id', () => {
    expect(checkEvalSet([good, good], { p }).join()).toMatch(/two rows/);
  });

  it('finds a production pointing at a missing frame', () => {
    const broken = { ...p, script: [{ id: 'l1', scene: 's1', text: 'Hi', pinnedFrame: 'f9' }] };
    expect(checkEvalSet([good], { p: broken }).join()).toMatch(/missing frame/);
  });
});
