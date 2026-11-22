/**
 * Spec 14, 6.4: each study task's success test, through the real runtime on the fake stage and
 * the check's own run (`traceScene`). It passes on the task done right, however it's built, and
 * fails on the film as it opens and on near misses.
 */
import {
  nodeId,
  type Expression,
  type ListenerDecl,
  type NodeId,
  type Statement,
} from '@storystage/ast';
import { traceScene } from '@storystage/check';
import { openProduction, saveProduction, type Production } from '@storystage/production';
import {
  inMemoryPorts,
  serve,
  type FromRuntime,
  type Port,
  type Timers,
  type ToRuntime,
} from '@storystage/runtime';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY } from '@storystage/story-api';
import { checkProgram } from '@storystage/story-api/program-check';
import { describe, expect, it } from 'vitest';
import type { StudyTask } from './events.ts';
import { STUDY_TASKS, TASK_SCENE, checkTask, studyTask } from './tasks.ts';

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

function startWorker() {
  const { main, worker } = inMemoryPorts();
  const timers: Timers = { now: () => 0, every: () => () => undefined };
  serve(worker, STORY_LIBRARY, timers);
  const port: Port<ToRuntime, FromRuntime> = main;
  return { port, terminate: () => undefined };
}

// ---- Building a learner's blocks ------------------------------------------------------------

let n = 0;
const id = () => nodeId(`blk${(n++).toString().padStart(4, '0')}`);

/** The field of `name` in the task film's scene type. */
function fieldOf(p: Production, name: string): NodeId {
  return p.program.types[0]!.fields.find((f) => f.name === name)!.id;
}
const ref = (p: Production, name: string): Expression => ({
  id: id(),
  kind: 'fieldRef',
  target: { id: id(), kind: 'this' },
  field: fieldOf(p, name),
});
const call = (
  p: Production,
  who: string,
  name: string,
  args: Record<string, Expression>,
): Statement => ({
  id: id(),
  kind: 'call',
  target: ref(p, who),
  callee: { kind: 'story', name },
  args,
  details: {},
});
const text = (value: string): Expression => ({ id: id(), kind: 'text', value });
const num = (value: number): Expression => ({ id: id(), kind: 'number', value });
const dir = (type: 'MoveDirection' | 'TurnDirection', value: string): Expression => ({
  id: id(),
  kind: 'enum',
  type,
  value,
});
const together = (body: Statement[]): Statement => ({ id: id(), kind: 'doTogether', body });
const count = (times: number, body: Statement[]): Statement => ({
  id: id(),
  kind: 'count',
  times: { id: id(), kind: 'wholeNumber', value: times },
  body,
});
const jump = (p: Production) => [
  call(p, 'dinoKid', 'move', { direction: dir('MoveDirection', 'up'), amount: num(0.5) }),
  call(p, 'dinoKid', 'move', { direction: dir('MoveDirection', 'down'), amount: num(0.5) }),
];

/** The film with `body` as its method, and `listeners` on its scene. */
function withCode(
  p: Production,
  body: readonly Statement[],
  listeners: readonly ListenerDecl[] = [],
): Production {
  const [type, ...rest] = p.program.types;
  const method = { ...type!.methods[0]!, body };
  return {
    ...p,
    program: { ...p.program, types: [{ ...type!, methods: [method], listeners }, ...rest] },
  };
}

async function outcome(task: StudyTask, production: Production) {
  expect(checkProgram(production.program)).toEqual([]);
  await settle();
  const run = await traceScene({
    production,
    stage: new FakeStage(),
    startWorker,
    scene: TASK_SCENE,
    events: studyTask(task).events,
  });
  return checkTask(task, run);
}

const film = (task: StudyTask) => studyTask(task).film();

// ---- The tests ---------------------------------------------------------------------------------

describe('the study tasks (spec 14, 6.4)', () => {
  it('are five, with words, and T1 to T3 hold the editor', () => {
    expect(STUDY_TASKS.map((d) => [d.task, d.holdsEditor])).toEqual([
      ['T1', true],
      ['T2', true],
      ['T3', true],
      ['T4', false],
      ['T5', false],
    ]);
    for (const d of STUDY_TASKS)
      for (const w of [d.title, d.instruction, d.hint]) expect(w).toMatch(/\w/);
  });

  it('each opens as a film that saves and opens again, with its storyboard ready for code', () => {
    for (const d of STUDY_TASKS) {
      const p = d.film();
      const opened = openProduction(saveProduction(p));
      expect(opened.status, d.task).toBe('ok');
      expect(p.storyboard.logline && p.storyboard.synopsis).toBeTruthy();
      expect(p.frames.filter((f) => f.scene === TASK_SCENE)).toHaveLength(1);
      // A fresh copy each time, so a task can't change the next learner's film.
      expect(d.film()).not.toBe(p);
    }
  });

  it('fails each film as it opens', async () => {
    for (const d of STUDY_TASKS) expect(await outcome(d.task, d.film()), d.task).toBe('notYet');
  });

  it('T1: Teddy walks to the tree, then says Hello; not the other way round', async () => {
    const p = film('T1');
    const walk = () => call(p, 'teddy', 'walkTo', { target: ref(p, 'tree') });
    const hello = (words = 'Hello!') => call(p, 'teddy', 'say', { text: text(words) });
    expect(await outcome('T1', withCode(p, [walk(), hello()]))).toBe('success');
    expect(await outcome('T1', withCode(p, [hello(), walk()]))).toBe('notYet');
    expect(await outcome('T1', withCode(p, [walk(), hello('Goodbye')]))).toBe('notYet');
    expect(await outcome('T1', withCode(p, [hello()]))).toBe('notYet');
  });

  it('T2: Polybot moves while Teddy turns to watch, together; in order isn’t enough', async () => {
    const p = film('T2');
    const go = () => call(p, 'polybot', 'moveTo', { target: ref(p, 'fence') });
    const watch = () => call(p, 'teddy', 'turnToFace', { target: ref(p, 'polybot') });
    expect(await outcome('T2', withCode(p, [together([go(), watch()])]))).toBe('success');
    expect(await outcome('T2', withCode(p, [go(), watch()]))).toBe('notYet');
    expect(await outcome('T2', withCode(p, [together([go()])]))).toBe('notYet');
  });

  it('T3: Dino kid jumps three times, with a count or without; two or four isn’t it', async () => {
    const p = film('T3');
    expect(await outcome('T3', withCode(p, [count(3, jump(p))]))).toBe('success');
    expect(await outcome('T3', withCode(p, [...jump(p), ...jump(p), ...jump(p)]))).toBe('success');
    expect(await outcome('T3', withCode(p, [count(2, jump(p))]))).toBe('notYet');
    expect(await outcome('T3', withCode(p, [count(4, jump(p))]))).toBe('notYet');
    // Up three times, never down.
    const up = () =>
      call(p, 'dinoKid', 'move', { direction: dir('MoveDirection', 'up'), amount: num(0.5) });
    expect(await outcome('T3', withCode(p, [up(), up(), up()]))).toBe('notYet');
  });

  it('T4: Autumn says Woof when she’s clicked, and not before', async () => {
    const p = film('T4');
    const woof = () => call(p, 'autumn', 'say', { text: text('Woof') });
    const onClick: ListenerDecl = {
      id: id(),
      kind: 'listener',
      event: 'clickOnObject',
      args: {},
      details: {},
      params: [],
      body: [woof()],
    };
    expect(await outcome('T4', withCode(p, [], [onClick]))).toBe('success');
    expect(await outcome('T4', withCode(p, [woof()]))).toBe('notYet');
    expect(await outcome('T4', withCode(p, [woof()], [onClick]))).toBe('notYet');
  });

  it('T5: Red Riding Hood ends facing Grandmother, however the turn is fixed', async () => {
    const p = film('T5');
    const turn = p.program.types[0]!.methods[0]!.body[0]!;
    const left = {
      ...turn,
      args: { ...(turn as { args: object }).args, direction: dir('TurnDirection', 'left') },
    };
    expect(await outcome('T5', withCode(p, [left as Statement]))).toBe('success');
    const face = call(p, 'redRidingHood', 'turnToFace', { target: ref(p, 'grandmother') });
    expect(await outcome('T5', withCode(p, [face]))).toBe('success');
    expect(await outcome('T5', withCode(p, []))).toBe('notYet');
  });

  it('a run stopped by an error is an error, not a miss', () => {
    expect(checkTask('T1', { samples: [], said: [], error: { words: 'stopped' } })).toBe('error');
  });
});
