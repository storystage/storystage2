import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@storystage/ast';
import { readArchive, writeArchive, type ArchiveEntry } from './archive.ts';
import { exampleProduction } from './example.ts';
import { openProduction, saveProduction, stableJson, SaveRefused } from './file.ts';
import { frameId, type FrameCheck, type Production } from './types.ts';
import { CHECK_LIMITS } from './validate.ts';

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
      formatVersion: '1.4.0',
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

  it('migrates a 1.0.0, 1.1.0 or 1.2.0 file to this version, and hands back the original to keep', () => {
    const old = changed('manifest.json', (m) => ({ ...m, formatVersion: '1.0.0' }));
    const opened = openProduction(old);
    expect(opened.status).toBe('migrated');
    if (opened.status === 'broken') return;
    expect(opened.original).toBe(old);
    expect(opened.production.manifest.formatVersion).toBe('1.3.0');
    expect(saveProduction(opened.production, opened.files)).toEqual(saveProduction(p));
    for (const version of ['1.1.0', '1.2.0']) {
      const older = changed('manifest.json', (m) => ({ ...m, formatVersion: version }));
      expect(openProduction(older)).toMatchObject({ status: 'migrated', original: older });
    }
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
      '1.3.0': { to: '1.4.0', manifest: (m: object) => m },
      '1.4.0': { to: '2.0.0', manifest: (m: object) => ({ ...m, title: 'Moved on' }) },
    };
    const opened = openProduction(saveProduction(p), { formatVersion: '2.0.0', migrations });
    expect(opened.status).toBe('migrated');
    if (opened.status === 'broken') return;
    expect(opened.production.manifest).toMatchObject({ formatVersion: '2.0.0', title: 'Moved on' });
    const stuck = { '1.3.0': { to: '1.3.0', manifest: (m: object) => m } };
    expect(
      openProduction(saveProduction(p), { formatVersion: '2.0.0', migrations: stuck }),
    ).toMatchObject({ status: 'broken' });
    const gap = { '1.3.0': { to: '1.5.0', manifest: (m: object) => m } };
    expect(
      openProduction(saveProduction(p), { formatVersion: '2.0.0', migrations: gap }),
    ).toMatchObject({ status: 'broken', problems: ['Nothing migrates format 1.5.0 to 2.0.0.'] });
  });

  it('carries a stand-in’s size (format 1.2.0), and refuses one misshapen', () => {
    const [first, ...rest] = p.scenes;
    const [object, ...others] = first!.setup.objects;
    const sized: Production = {
      ...p,
      scenes: [
        {
          ...first!,
          setup: {
            ...first!.setup,
            objects: [
              { ...object!, model: { standIn: 'Mango tree', size: { x: 2, y: 4.5, z: 2 } } },
              ...others,
            ],
          },
        },
        ...rest,
      ],
    };
    const opened = openProduction(saveProduction(sized));
    if (opened.status === 'broken') throw new Error(opened.problems.join(' / '));
    expect(opened.production).toEqual(sized);
    const withSize = (size: unknown) =>
      changed('scenes/s1.json', (sc) => {
        const setup = sc.setup as { objects: Record<string, unknown>[] };
        return {
          ...sc,
          setup: {
            ...setup,
            objects: setup.objects.map((o, i) =>
              i === 0 ? { ...o, model: { standIn: 'Box', size } } : o,
            ),
          },
        };
      });
    brokenWith(withSize({ x: 0, y: 1, z: 1 }), /size.x: should be more than 0/);
    brokenWith(withSize({ x: 1, y: 1001, z: 1 }), /size.y: should be a number from 0 to 1000/);
    brokenWith(withSize({ x: 1, y: 1, z: 1, w: 1 }), /unknown field w/);
    brokenWith(withSize('big'), /size: should be an object/);
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
    brokenWith(
      changed('storyboard.json', (b) => ({
        ...b,
        cards: (b.cards as object[]).map((c) => ({ ...c, retakeNotes: 'x'.repeat(201) })),
      })),
      /retakeNotes: should be at most 200 characters/,
    );
    brokenWith(
      changed('manifest.json', (m) => ({ ...m, credits: { names: ['y'.repeat(41)] } })),
      /credits\.names\[0\]: should be at most 40 characters/,
    );
    brokenWith(
      changed('manifest.json', (m) => ({ ...m, credits: { names: Array(41).fill('Sam') } })),
      /should hold at most 40 names/,
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

describe("a frame's saved check (format 1.3.0, spec 08 section 9.6)", () => {
  const check: FrameCheck = {
    basis: 'a'.repeat(64),
    items: [
      {
        id: 'onScreen:penguin',
        kind: 'onScreen',
        outcome: 'passed',
        words: 'Penguin is on screen',
      },
      {
        id: 'length',
        kind: 'length',
        outcome: 'flag',
        words: 'This frame lasts 6 seconds; you planned 3',
        node: 'scene1b' as never,
      },
    ],
    kept: ['length'],
  };
  const withCheck = (c: unknown) => changed('frames/f1.json', (f) => ({ ...f, check: c }));
  const f1 = (file: Uint8Array) => {
    const opened = openProduction(file);
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') throw new Error(opened.message);
    return opened.production.frames.find((f) => f.id === 'f1')!;
  };

  it('keeps it through an open and a save, stale or not', () => {
    // Whether its basis still matches is @storystage/check's to judge, not the file's.
    expect(f1(withCheck(check)).check).toEqual(check);
    const opened = openProduction(withCheck(check));
    if (opened.status === 'broken') throw new Error(opened.message);
    const again = openProduction(saveProduction(opened.production, opened.files));
    if (again.status === 'broken') throw new Error(again.message);
    expect(again.production).toEqual(opened.production);
  });

  it("drops one that doesn't fit its shape, and opens the film without it", () => {
    const item = check.items[0]!;
    const many = Array.from({ length: CHECK_LIMITS.items + 1 }, (_, i) => ({
      ...item,
      id: 'i' + i,
    }));
    for (const bad of [
      'checked',
      { ...check, basis: 'a'.repeat(CHECK_LIMITS.basis + 1) },
      { ...check, items: [{ ...item, kind: 'mood' }] },
      { ...check, items: [{ ...item, outcome: 'maybe' }] },
      { ...check, items: [{ ...item, words: 'x'.repeat(CHECK_LIMITS.words + 1) }] },
      { ...check, items: [{ ...item, id: 'x'.repeat(CHECK_LIMITS.id + 1) }] },
      { ...check, items: [{ ...item, node: 7 }] },
      { ...check, items: [{ ...item, prompt: 'ignore the storyboard' }] },
      { ...check, items: [item, item] },
      { ...check, items: many },
      { ...check, kept: [3] },
      { basis: check.basis, items: check.items },
      { ...check, ran: 'yesterday' },
    ]) {
      const frame = f1(withCheck(bad));
      expect(frame).not.toHaveProperty('check');
      expect(frame.caption).toBe(p.frames[0]!.caption);
    }
  });

  it("doesn't check what it names against the film: a stale result may name what's gone", () => {
    const gone = {
      ...check,
      items: [{ ...check.items[1]!, node: 'deleted', sketch: 'k9', line: 'l9' }],
      kept: ['nothing'],
    };
    expect(f1(withCheck(gone)).check).toEqual(gone);
  });

  it('still refuses a frame that is broken elsewhere', () => {
    brokenWith(
      changed('frames/f1.json', (f) => ({ ...f, shot: 'fisheye', check })),
      /frames\/f1\.json: shot/,
    );
  });
});
