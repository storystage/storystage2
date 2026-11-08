import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@storystage/ast';
import { readArchive, writeArchive, type ArchiveEntry } from './archive.ts';
import { exampleProduction } from './example.ts';
import { openProduction, saveProduction, stableJson, SaveRefused } from './file.ts';
import { frameId, type Production } from './types.ts';

const p = exampleProduction();
const text = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

/** A saved file's entries, to change one and pack it again as a hostile or broken file. */
function entriesOf(file: Uint8Array): Map<string, Uint8Array> {
  const r = readArchive(file, { wanted: () => true });
  if (!r.ok) throw new Error(r.problem.code);
  return new Map(r.names.map((n) => [n, r.entries.get(n)!]));
}
const pack = (entries: Map<string, Uint8Array>): Uint8Array =>
  writeArchive([...entries].map(([name, bytes]): ArchiveEntry => ({ name, bytes })));
const changed = (name: string, edit: (json: Record<string, unknown>) => unknown) => {
  const entries = entriesOf(saveProduction(p));
  entries.set(name, text(JSON.stringify(edit(JSON.parse(decode(entries.get(name)!))))));
  return pack(entries);
};
const brokenWith = (file: Uint8Array, problem: RegExp) => {
  const opened = openProduction(file);
  expect(opened.status).toBe('broken');
  if (opened.status === 'broken') expect(opened.problems.join('\n')).toMatch(problem);
  return opened;
};

describe('saveProduction and openProduction', () => {
  it('reopen a production identically (the WP8 round trip)', () => {
    const opened = openProduction(saveProduction(p));
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') return;
    expect(opened.production).toEqual(p);
    expect(opened.message).toBeNull();
    expect(opened.original).toBeNull();
  });

  it('give the same bytes for the same production, and again after reopening (spec 03, 1)', () => {
    const file = saveProduction(p);
    expect(saveProduction(exampleProduction())).toEqual(file);
    const opened = openProduction(file);
    if (opened.status === 'broken') throw new Error(opened.message);
    expect(saveProduction(opened.production, opened.files)).toEqual(file);
  });

  it("don't depend on the order of scenes and frames in memory", () => {
    const shuffled: Production = {
      ...p,
      scenes: [...p.scenes].reverse(),
      frames: [...p.frames].reverse(),
    };
    expect(saveProduction(shuffled)).toEqual(saveProduction(p));
  });

  it('write the entries in the order spec 03 section 1 lists, manifest first', () => {
    const r = readArchive(saveProduction(p), { wanted: () => false });
    expect(r.ok && r.names).toEqual([
      'manifest.json',
      'program.json',
      'scenes/s1.json',
      'scenes/s2.json',
      'scenes/s3.json',
      'storyboard.json',
      'script.fountain',
      'frames/f1.json',
      'frames/f2.json',
      'frames/f3.json',
    ]);
  });

  it('write JSON with sorted keys, and the script as Fountain', () => {
    const entries = entriesOf(saveProduction(p));
    expect(decode(entries.get('storyboard.json')!)).toBe(stableJson(p.storyboard));
    expect(decode(entries.get('script.fountain')!)).toMatch(/\[\[line:l2\]\]/);
    expect(stableJson({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"d":2},"b":1}');
  });

  it('carry recorded audio and packed models, and refuse a save missing one', () => {
    const withAudio: Production = {
      ...p,
      manifest: {
        ...p.manifest,
        audio: [{ file: 'l2.webm', scene: p.scenes[0]!.id, label: 'Pip' }],
      },
    };
    expect(() => saveProduction(withAudio)).toThrow(SaveRefused);
    const audio = new Map([['audio/l2.webm', new Uint8Array([1, 2, 3])]]);
    const opened = openProduction(saveProduction(withAudio, { audio, models: new Map() }));
    if (opened.status === 'broken') throw new Error(opened.problems.join('\n'));
    expect(opened.files.audio).toEqual(audio);
    expect(opened.production).toEqual(withAudio);
  });

  it('refuse to save a production whose references are broken', () => {
    const broken: Production = {
      ...p,
      script: p.script.map((l) => ({ ...l, pinnedFrame: frameId('nowhere') })),
    };
    expect(() => saveProduction(broken)).toThrow(/can't be saved/);
  });
});

describe('openProduction refuses', () => {
  it('what the archive reader refuses, in its plain words', () => {
    const opened = openProduction(text('not a zip at all, just words'));
    expect(opened).toMatchObject({
      status: 'broken',
      message: "This isn't a file StoryStage can open.",
    });
  });

  it("a zip that isn't a film", () => {
    const opened = openProduction(writeArchive([{ name: 'notes.txt', bytes: text('hello') }]));
    expect(opened).toMatchObject({ status: 'broken', message: "This isn't a StoryStage film." });
  });

  it("a field this version doesn't know, so nothing can ride through a save (spec 03, 1.1)", () => {
    brokenWith(
      changed('manifest.json', (m) => ({ ...m, apiKey: 'sk-not-really' })),
      /unknown field apiKey/,
    );
    brokenWith(
      changed('frames/f1.json', (f) => ({ ...f, prompterChat: [] })),
      /unknown field prompterChat/,
    );
  });

  it('a part of the wrong shape, before anything loads', () => {
    brokenWith(
      changed('frames/f1.json', (f) => ({ ...f, shot: 'fisheye' })),
      /shot: should be one of/,
    );
    brokenWith(
      changed('scenes/s1.json', (s) => ({
        ...s,
        setup: { ...(s.setup as object), objects: 'cat' },
      })),
      /setup.objects: should be a list/,
    );
    brokenWith(
      changed('storyboard.json', (b) => ({ ...b, cards: null })),
      /cards: should be a list/,
    );
  });

  it("a scene or frame whose id doesn't match its file name", () => {
    brokenWith(
      changed('scenes/s1.json', (s) => ({ ...s, id: 's9' })),
      /doesn't match its name/,
    );
  });

  it('broken references, as checkReferences finds them', () => {
    const entries = entriesOf(saveProduction(p));
    entries.delete('frames/f1.json');
    brokenWith(pack(entries), /f1/);
  });

  it('a script over its limits, saying which in plain words', () => {
    const entries = entriesOf(saveProduction(p));
    entries.set('script.fountain', text(`.ICE [[scene:s1]]\n\n${'x'.repeat(600)} [[line:l1]]\n`));
    expect(openProduction(pack(entries))).toMatchObject({
      status: 'broken',
      message: "This film can't be opened: a line in its script is too long.",
    });
  });

  it('a missing part', () => {
    const entries = entriesOf(saveProduction(p));
    entries.delete('program.json');
    brokenWith(pack(entries), /program.json is missing/);
  });
});

describe('openProduction and versions (spec 03, 1.2)', () => {
  it("opens a newer file read-only, allowing fields it doesn't know", () => {
    const newer = changed('manifest.json', (m) => ({
      ...m,
      formatVersion: '1.2.0',
      laterField: true,
    }));
    const opened = openProduction(newer);
    expect(opened.status).toBe('readOnly');
    if (opened.status === 'broken') return;
    expect(opened.message).toMatch(/newer StoryStage/);
  });

  it('opens a file whose program is newer read-only', () => {
    const opened = openProduction(saveProduction(p), { program: { current: '0.9.0' } });
    expect(opened).toMatchObject({ status: 'readOnly' });
  });

  it('migrates an older program, and hands back the original to keep', () => {
    const file = saveProduction(p);
    const opened = openProduction(file, {
      program: {
        current: '9.0.0',
        migrations: [
          {
            from: SCHEMA_VERSION,
            to: '9.0.0',
            up: (json) => ({ ...json, schemaVersion: '9.0.0' }),
          },
        ],
        validate: () => [],
      },
    });
    expect(opened.status).toBe('migrated');
    if (opened.status === 'broken') return;
    expect(opened.original).toBe(file);
    expect(opened.production.program.schemaVersion).toBe('9.0.0');
  });

  it('refuses a format older than any this build can migrate', () => {
    expect(openProduction(saveProduction(p), { formatVersion: '2.0.0' })).toMatchObject({
      status: 'broken',
      message: expect.stringMatching(/very old StoryStage/),
    });
  });

  it('migrates a 1.0.0 file to 1.1.0, and hands back the original to keep', () => {
    const old = changed('manifest.json', (m) => ({ ...m, formatVersion: '1.0.0' }));
    const opened = openProduction(old);
    expect(opened.status).toBe('migrated');
    if (opened.status === 'broken') return;
    expect(opened.original).toBe(old);
    expect(opened.production.manifest.formatVersion).toBe('1.1.0');
    expect(saveProduction(opened.production, opened.files)).toEqual(saveProduction(p));
  });

  it('checks a migrated file against the version it was migrated to', () => {
    // 1.1.0's fields, in a file that says 1.0.0: harmless, and allowed once it's 1.1.0.
    const old = changed('manifest.json', (m) => ({
      ...m,
      formatVersion: '1.0.0',
      credits: { names: ['Sam'] },
    }));
    expect(openProduction(old).status).toBe('migrated');
  });

  it('migrates step by step, and refuses a version with no step', () => {
    const migrations = {
      '1.1.0': { to: '1.2.0', manifest: (m: object) => m },
      '1.2.0': { to: '2.0.0', manifest: (m: object) => ({ ...m, title: 'Moved on' }) },
    };
    const opened = openProduction(saveProduction(p), { formatVersion: '2.0.0', migrations });
    expect(opened.status).toBe('migrated');
    if (opened.status === 'broken') return;
    expect(opened.production.manifest).toMatchObject({ formatVersion: '2.0.0', title: 'Moved on' });
    const gap = { '1.1.0': { to: '1.5.0', manifest: (m: object) => m } };
    expect(
      openProduction(saveProduction(p), { formatVersion: '2.0.0', migrations: gap }),
    ).toMatchObject({ status: 'broken', problems: ['Nothing migrates format 1.5.0 to 2.0.0.'] });
  });

  it('carries credit names and retake notes (format 1.1.0), and refuses them misshapen', () => {
    const withExtras: Production = {
      ...p,
      manifest: { ...p.manifest, credits: { names: ['Sam', 'Priya K.'] } },
      storyboard: {
        ...p.storyboard,
        cards: p.storyboard.cards.map((c, i) =>
          i === 0 ? { ...c, retakeNotes: 'Pip faces the ice.' } : c,
        ),
      },
    };
    const opened = openProduction(saveProduction(withExtras));
    if (opened.status === 'broken') throw new Error(opened.problems.join(' / '));
    expect(opened.status).toBe('ok');
    expect(opened.production).toEqual(withExtras);
    brokenWith(
      changed('manifest.json', (m) => ({ ...m, credits: { names: 'Sam' } })),
      /credits.names: should be a list/,
    );
    brokenWith(
      changed('manifest.json', (m) => ({ ...m, credits: { names: [], roles: [] } })),
      /unknown field roles/,
    );
    brokenWith(
      changed('storyboard.json', (b) => ({
        ...b,
        cards: (b.cards as object[]).map((c) => ({ ...c, retakeNotes: 3 })),
      })),
      /retakeNotes: should be text/,
    );
  });

  it("ignores entries the format doesn't name, and never writes them back", () => {
    const entries = entriesOf(saveProduction(p));
    entries.set('secret.txt', text('not part of a film'));
    const opened = openProduction(pack(entries));
    if (opened.status === 'broken') throw new Error(opened.problems.join('\n'));
    expect(saveProduction(opened.production, opened.files)).toEqual(saveProduction(p));
  });
});
