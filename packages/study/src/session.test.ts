import { describe, expect, it } from 'vitest';
import {
  CHECKS,
  CHOICE,
  EASE,
  ENDS,
  HELP,
  TASKS,
  isStudyEvent,
  type StudyEvent,
} from './events.ts';
import { StudySession, localDate, type SessionContext } from './session.ts';
import { StudyStore } from './store.ts';
import { memoryFiles } from './test-store.ts';

const CONTEXT: SessionContext = {
  date: '2027-02-01',
  version: '1.0.0',
  classCode: 'S1-C3',
  ageBand: '9-11',
  editorDefault: 'tiles',
  editorLocked: false,
  editor: 'tiles',
};

function setup() {
  const files = memoryFiles();
  const store = new StudyStore(files);
  let clock = 1_000;
  const errors: unknown[] = [];
  const session = new StudySession({
    store,
    context: CONTEXT,
    now: () => clock,
    onError: (e) => errors.push(e),
  });
  const tick = (ms: number) => void (clock += ms);
  const events = async () => {
    await session.flush();
    return (await store.readSession(session.code))?.events ?? null;
  };
  return { files, store, session, tick, events, errors };
}

describe('a study session (spec 14, 6.3 to 6.6)', () => {
  it('keeps no log at all when it opens no task and makes no switch', async () => {
    const { files, session, tick } = setup();
    tick(5_000);
    session.edited();
    session.undone();
    session.help('learn');
    session.checked('notYet');
    session.close();
    await session.flush();
    expect(files.files.size).toBe(0);
  });

  it('logs a switch outside a task, after the session’s own event', async () => {
    const { session, tick, events } = setup();
    tick(2_500);
    session.switched('tiles', 'blocks');
    expect(await events()).toEqual([
      { kind: 'session', t: 0, ...CONTEXT },
      { kind: 'switch', t: 2_500, from: 'tiles', to: 'blocks' },
    ]);
  });

  it('counts edits, undos, redos, help and checks only while a task is open', async () => {
    const { session, tick, events } = setup();
    session.edited();
    tick(1_000);
    expect(session.openTask('T1', 'tiles', true)).toBe(true);
    tick(1_000);
    session.edited();
    session.undone();
    session.redone();
    session.help('hint');
    session.checked('notYet');
    tick(1_000);
    session.checked('success');
    session.endTask('success');
    session.edited();
    session.answer('ease', 'easy');
    session.answer('choice', 'dontMind');
    session.help('learn');
    expect((await events())?.map((e) => e.kind)).toEqual([
      'session',
      'task',
      'edit',
      'undo',
      'redo',
      'help',
      'check',
      'check',
      'end',
      'answer',
      'answer',
    ]);
    expect(session.current()).toEqual({ kind: 'idle' });
  });

  it('asks the two questions after a task, and a task done can’t be opened again', async () => {
    const { session, events } = setup();
    session.openTask('T2', 'blocks', true);
    expect(session.openTask('T3', 'blocks', true)).toBe(false);
    session.endTask('timeUp');
    expect(session.current()).toEqual({ kind: 'asking', task: 'T2' });
    session.answer('choice', 'tiles');
    session.answer('choice', 'blocks');
    session.answer('ease', 'hard');
    expect(session.current()).toEqual({ kind: 'idle' });
    expect([...session.done()]).toEqual(['T2']);
    expect(session.openTask('T2', 'blocks', true)).toBe(false);
    expect(session.openTask('T3', 'blocks', true)).toBe(true);
    const answers = (await events())?.filter((e) => e.kind === 'answer');
    expect(answers?.map((e) => e.kind === 'answer' && e.value)).toEqual(['tiles', 'hard']);
  });

  it('ends a task left open as stopped, with its questions skipped', async () => {
    const { session, events } = setup();
    session.openTask('T4', 'tiles', false);
    session.close();
    expect((await events())?.slice(-3)).toEqual([
      { kind: 'end', t: 0, outcome: 'stopped' },
      { kind: 'answer', t: 0, question: 'ease', value: 'skipped' },
      { kind: 'answer', t: 0, question: 'choice', value: 'skipped' },
    ]);
  });

  it('tells its listeners when the phase changes', () => {
    const { session } = setup();
    let told = 0;
    const stop = session.subscribe(() => told++);
    session.openTask('T1', 'tiles', true);
    session.endTask('success');
    session.close();
    stop();
    session.openTask('T2', 'tiles', true);
    expect(told).toBe(3);
  });

  it('holds only the listed fields and words, whatever happens in it', async () => {
    const { session, tick, events } = setup();
    for (const task of TASKS) {
      tick(700);
      session.openTask(task, 'tiles', task <= 'T3');
      session.switched('tiles', 'blocks');
      session.edited();
      for (const via of HELP) session.help(via);
      for (const outcome of CHECKS) session.checked(outcome);
      session.endTask(ENDS[TASKS.indexOf(task) % ENDS.length]!);
      session.answer('ease', EASE[0]);
      session.answer('choice', CHOICE[2]);
    }
    const all = (await events()) as StudyEvent[];
    expect(all.length).toBeGreaterThan(40);
    for (const event of all) expect(isStudyEvent(event)).toBe(true);
    // Every word in the file is one of the fixed ones, the date, the version, or the class code.
    const allowed = new Set<unknown>([
      ...TASKS,
      ...HELP,
      ...CHECKS,
      ...ENDS,
      ...EASE,
      ...CHOICE,
      'blocks',
      'tiles',
      'ease',
      'choice',
      ...['session', 'task', 'switch', 'edit', 'undo', 'redo', 'help', 'check', 'end', 'answer'],
      CONTEXT.date,
      CONTEXT.version,
      CONTEXT.classCode,
      CONTEXT.ageBand,
    ]);
    for (const event of all)
      for (const value of Object.values(event))
        if (typeof value === 'string') expect(allowed).toContain(value);
  });

  it('gives a write that fails to onError, and goes on', async () => {
    const { files, session, errors } = setup();
    files.write = () => Promise.reject(new Error('full'));
    session.switched('tiles', 'blocks');
    session.openTask('T1', 'blocks', true);
    await session.flush();
    expect(errors).toHaveLength(2);
    expect(session.current()).toEqual({ kind: 'task', task: 'T1' });
  });

  it('a new session has a new code', () => {
    expect(setup().session.code).not.toBe(setup().session.code);
  });

  it('dates a session by the device’s local day, with no time', () => {
    expect(localDate(new Date(2027, 1, 3, 23, 59))).toBe('2027-02-03');
  });
});
