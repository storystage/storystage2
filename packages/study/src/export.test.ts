import { describe, expect, it } from 'vitest';
import type { StudyEvent } from './events.ts';
import { exportLogs, readExport } from './export.ts';
import { StudyStore } from './store.ts';
import { memoryFiles } from './test-store.ts';

const start: StudyEvent = {
  kind: 'session',
  t: 0,
  date: '2027-02-01',
  version: '1.0.0',
  classCode: 'S1-C3',
  ageBand: '9-11',
  editorDefault: 'tiles',
  editorLocked: false,
  editor: 'tiles',
};

describe('Export study logs (spec 14, 6.8)', () => {
  it('puts every session kept on the device in one file, under a new random id', async () => {
    const store = new StudyStore(memoryFiles());
    await store.writeSession('K7P3QX2M', [
      start,
      { kind: 'switch', t: 5, from: 'tiles', to: 'blocks' },
    ]);
    await store.writeSession('ABCD2345', [start]);
    const file = await exportLogs(store, { today: '2027-03-01', random: (b) => b.fill(9) });
    expect(file.name).toBe('study-logs-2027-03-01-bbbbbbbb.json');
    expect(file.codes).toEqual(['ABCD2345', 'K7P3QX2M']);
    const back = readExport(file.bytes);
    expect(back.export).toBe('BBBBBBBB');
    expect(back.sessions.map((s) => s.code)).toEqual(['ABCD2345', 'K7P3QX2M']);
    expect(back.sessions[1]!.events[1]).toEqual({
      kind: 'switch',
      t: 5,
      from: 'tiles',
      to: 'blocks',
    });
    // Two exports never share an id.
    expect((await exportLogs(store)).name).not.toBe((await exportLogs(store)).name);
  });

  it('deletes only the sessions it exported, once saved', async () => {
    const store = new StudyStore(memoryFiles());
    await store.writeSession('K7P3QX2M', [start]);
    const file = await exportLogs(store);
    await store.writeSession('ABCD2345', [start]);
    await store.deleteSessions(file.codes);
    expect((await store.sessions()).map((s) => s.code)).toEqual(['ABCD2345']);
  });

  it('reads back only a file that is exactly a study log', () => {
    const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
    const good = { format: 'storystage-study-log', version: 1, export: 'BBBBBBBB', sessions: [] };
    expect(readExport(bytes(good)).sessions).toEqual([]);
    expect(() => readExport(bytes({ ...good, device: 'iPad 7' }))).toThrow();
    const named = { code: 'K7P3QX2M', events: [{ ...start, name: 'Amira' }] };
    expect(() => readExport(bytes({ ...good, sessions: [named] }))).toThrow();
  });
});
