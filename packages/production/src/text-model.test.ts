// Format 1.10.0: 3D text is `TextModel` in code, as `Text` is words (spec 02, section 1, rule 3;
// the owner's choice of 22 Nov 2026, found in S6's review of #642).
import { describe, expect, it } from 'vitest';
import { nodeId, validateProgram, type FieldDecl, type TypeDecl } from '@storystage/ast';
import { IDENTITY } from '@storystage/story-api';
import { readArchive, writeArchive } from './archive.ts';
import { exampleProduction } from './example.ts';
import { openProduction, saveProduction, type FormatMigrations } from './file.ts';
import { addObject } from './objects.ts';
import { FORMAT_VERSION, ZIP_LAYOUT, checkReferences, sceneId, type Production } from './types.ts';

const s1 = sceneId('s1');

function done(result: ReturnType<typeof addObject>): Production {
  if (!result.ok) throw new Error(JSON.stringify(result.refusal));
  return result.step.production;
}
const sceneType = (p: Production) => {
  const method = p.scenes.find((s) => s.id === s1)!.method;
  return p.program.types.find((t) => t.methods.some((m) => m.id === method))!;
};
const fieldOf = (p: Production, name: string) => sceneType(p).fields.find((f) => f.name === name)!;
const typeNamed = (p: Production, name: string) => p.program.types.find((t) => t.name === name)!;

/**
 * Scene 1 with two 3D texts, `title` and `signBoard`, the second of a learner's class `Sign
 * extends TextModel`, and words beside them: the scene's `caption` and the class's `motto`.
 */
function withTexts(): Production {
  const base = exampleProduction();
  const words = (id: string, name: string, value: string): FieldDecl => ({
    id: nodeId(id),
    kind: 'field',
    name,
    type: { kind: 'story', name: 'Text' },
    initial: { id: nodeId(`${id.slice(0, 6)}words`), kind: 'text', value },
  });
  const sign: TypeDecl = {
    id: nodeId('signclass'),
    kind: 'type',
    name: 'Sign',
    extends: { kind: 'story', name: 'TextModel' },
    fields: [words('mottofield', 'motto', 'Welcome')],
    methods: [],
    listeners: [],
  };
  const scene = sceneType(base);
  const p0: Production = {
    ...base,
    program: {
      ...base.program,
      types: [
        ...base.program.types.map((t) =>
          t.id === scene.id
            ? { ...t, fields: [...t.fields, words('captionfield', 'caption', 'Hi')] }
            : t,
        ),
        sign,
      ],
    },
  };
  const p1 = done(
    addObject(
      p0,
      s1,
      { model: { standIn: 'title' }, class: 'Text', name: 'Title', transform: IDENTITY },
      'Add title',
    ),
  );
  return done(
    addObject(
      p1,
      s1,
      {
        model: { standIn: 'sign' },
        class: 'Text',
        name: 'Sign board',
        transform: IDENTITY,
        type: { kind: 'user', type: sign.id },
      },
      'Add sign board',
    ),
  );
}

/** A saved file as an older build wrote it: 3D text typed `Text` in its program. */
function asWritten(p: Production, formatVersion: string): Uint8Array {
  const r = readArchive(saveProduction(p), { wanted: () => true });
  if (!r.ok) throw new Error(r.problem.code);
  const program = new TextDecoder().decode(r.entries.get(ZIP_LAYOUT.program)!);
  // Two in the program: the title's field and Sign's `extends`.
  expect(program.match(/"TextModel"/g)).toHaveLength(2);
  const edited = new Map(r.entries);
  edited.set(
    ZIP_LAYOUT.program,
    new TextEncoder().encode(program.replace(/"TextModel"/g, '"Text"')),
  );
  const manifest = JSON.parse(new TextDecoder().decode(r.entries.get(ZIP_LAYOUT.manifest)!));
  edited.set(
    ZIP_LAYOUT.manifest,
    new TextEncoder().encode(JSON.stringify({ ...manifest, formatVersion })),
  );
  return writeArchive(r.names.map((name) => ({ name, bytes: edited.get(name)! })));
}

describe('3D text is TextModel in code (format 1.10.0)', () => {
  it('types a 3D text added to a scene TextModel, as Text is words', () => {
    const p = withTexts();
    expect(fieldOf(p, 'title').type).toEqual({ kind: 'story', name: 'TextModel' });
    expect(fieldOf(p, 'signBoard').type).toEqual({ kind: 'user', type: nodeId('signclass') });
    expect(validateProgram(p.program)).toEqual([]);
    expect(checkReferences(p)).toEqual([]);
    const opened = openProduction(saveProduction(p));
    expect(opened.status).toBe('ok');
    if (opened.status !== 'broken') expect(opened.production).toEqual(p);
  });

  it("migrates a 1.9.0 file's 3D text to TextModel, keeps its words as words, and its original", () => {
    const p = withTexts();
    const old = asWritten(p, '1.9.0');
    const opened = openProduction(old);
    expect(opened.status).toBe('migrated');
    if (opened.status === 'broken') return;
    expect(opened.original).toBe(old);
    const q = opened.production;
    expect(q.manifest.formatVersion).toBe(FORMAT_VERSION);
    expect(fieldOf(q, 'title').type).toEqual({ kind: 'story', name: 'TextModel' });
    expect(typeNamed(q, 'Sign').extends).toEqual({ kind: 'story', name: 'TextModel' });
    // Words stay words: the scene's caption and the class's motto.
    expect(fieldOf(q, 'caption').type).toEqual({ kind: 'story', name: 'Text' });
    expect(typeNamed(q, 'Sign').fields[0]!.type).toEqual({ kind: 'story', name: 'Text' });
    expect(saveProduction(q, opened.files)).toEqual(saveProduction(p));
  });

  it('refuses a 1.10.0 file whose 3D text is words in code, saying so', () => {
    const opened = openProduction(asWritten(withTexts(), FORMAT_VERSION));
    expect(opened.status).toBe('broken');
    if (opened.status !== 'broken') return;
    // The title's field is words, and so is what Sign extends.
    for (const id of ['title', 'signBoard'])
      expect(opened.problems).toContain(
        `Scene s1: ${id} is 3D text in the set-up, but words in code: 3D text is TextModel, and Text is words.`,
      );
  });

  it("gives a migration's program step the scenes, and checks what it gives back", () => {
    const p = withTexts();
    let seen: string[] = [];
    const migrations: FormatMigrations = {
      [FORMAT_VERSION]: {
        to: '9.0.0',
        manifest: (m) => m,
        program: (program, scenes) => {
          seen = scenes.map((s) => s.id);
          const scene = sceneType(p);
          return {
            ...program,
            types: program.types.map((t) =>
              t.id === scene.id ? { ...t, fields: t.fields.filter((f) => f.name !== 'title') } : t,
            ),
          };
        },
      },
    };
    const opened = openProduction(saveProduction(p), { formatVersion: '9.0.0', migrations });
    expect(seen).toEqual(p.scenes.map((s) => s.id).sort());
    expect(opened).toMatchObject({ status: 'broken' });
    if (opened.status === 'broken')
      expect(opened.problems).toContain('Scene s1 sets up title, which has no field.');
  });
});
