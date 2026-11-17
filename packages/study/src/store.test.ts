import { describe, expect, it } from 'vitest';
import type { StudyEvent } from './events.ts';
import { StudyStore } from './store.ts';
import { memoryFiles } from './test-store.ts';

const start = (date: string): StudyEvent => ({
  kind: 'session',
  t: 0,
  date,
  version: '1.0.0',
  classCode: null,
  ageBand: null,
  editorDefault: 'blocks',
  editorLocked: true,
  editor: 'blocks',
});
const task: StudyEvent = { kind: 'task', t: 10, task: 'T1', editor: 'blocks', held: true };

describe('the study’s store (spec 14, 6.7)', () => {
  it('keeps a file per session, and lists them oldest first with their tasks', async () => {
    const files = memoryFiles();
    const store = new StudyStore(files);
    await store.writeSession('K7P3QX2M', [start('2027-02-02'), task]);
    await store.writeSession('ABCD2345', [start('2027-02-01')]);
    expect([...files.files.keys()].sort()).toEqual([
      'sessions/abcd2345.json',
      'sessions/k7p3qx2m.json',
    ]);
    expect(await store.sessions()).toEqual([
      { code: 'ABCD2345', date: '2027-02-01', tasks: 0 },
      { code: 'K7P3QX2M', date: '2027-02-02', tasks: 1 },
    ]);
  });

  it('refuses to write anything that isn’t a session’s events', async () => {
    const store = new StudyStore(memoryFiles());
    await expect(store.writeSession('K7P3QX2M', [task])).rejects.toThrow();
    const named = { ...task, name: 'Amira' } as unknown as StudyEvent;
    await expect(store.writeSession('K7P3QX2M', [start('2027-02-01'), named])).rejects.toThrow();
    await expect(store.writeSession('../x', [start('2027-02-01')])).rejects.toThrow();
  });

  it('passes over a file that doesn’t read as a session, or carries more', async () => {
    const files = memoryFiles();
    const store = new StudyStore(files);
    const put = (name: string, value: unknown) =>
      files.write(['sessions', name], new TextEncoder().encode(JSON.stringify(value)));
    await put('k7p3qx2m.json', {
      format: 'storystage-study-session',
      version: 1,
      code: 'K7P3QX2M',
      events: [{ ...start('2027-02-01'), pupil: 'p1' }],
    });
    await files.write(['sessions', 'abcd2345.json'], new TextEncoder().encode('{'));
    expect(await store.sessions()).toEqual([]);
  });

  it('deletes the sessions it’s told to, and only those', async () => {
    const store = new StudyStore(memoryFiles());
    await store.writeSession('K7P3QX2M', [start('2027-02-01')]);
    await store.writeSession('ABCD2345', [start('2027-02-01')]);
    await store.deleteSessions(['K7P3QX2M', 'not a code']);
    expect((await store.sessions()).map((s) => s.code)).toEqual(['ABCD2345']);
  });

  it('keeps the teacher’s ticks for who takes part (6.2)', async () => {
    const store = new StudyStore(memoryFiles());
    expect(await store.takingPart()).toEqual(new Set());
    await store.setTakingPart('p1', true);
    await store.setTakingPart('p2', true);
    await store.setTakingPart('p1', false);
    expect(await store.takingPart()).toEqual(new Set(['p2']));
  });

  it('keeps the class code and age band, refusing a code that isn’t a short label', async () => {
    const store = new StudyStore(memoryFiles());
    expect(await store.settings()).toEqual({ classCode: null, ageBand: null });
    await store.setSettings({ classCode: 'S1-C3', ageBand: '6-8' });
    expect(await store.settings()).toEqual({ classCode: 'S1-C3', ageBand: '6-8' });
    await expect(store.setSettings({ classCode: 'Year 4 Oak', ageBand: null })).rejects.toThrow();
  });
});
