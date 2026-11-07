import { describe, expect, it } from 'vitest';
import { EditSession } from './session.ts';
import { sampleProgram } from './testing.ts';
import { SCHEMA_VERSION } from './version.ts';
import { compareVersions, MIGRATIONS, openProgram, type Migration } from './versions.ts';

const raw = (version = SCHEMA_VERSION) => ({ ...sampleProgram(), schemaVersion: version });

describe('compareVersions', () => {
  it.each([
    ['1.0.0', '1.0.0', 0],
    ['1.0.1', '1.0.0', 1],
    ['1.0.0', '1.1.0', -1],
    ['2.0.0', '1.9.9', 1],
    ['1.10.0', '1.9.0', 1],
  ])('%s against %s', (a, b, expected) => {
    expect(Math.sign(compareVersions(a, b))).toBe(expected);
  });
});

describe('openProgram', () => {
  it('opens the current version', () => {
    const value = raw();
    const opened = openProgram(value);
    expect(opened.status).toBe('ok');
    if (opened.status === 'ok') expect(opened.program).toBe(value);
  });

  it.each([
    ['nothing', undefined],
    ['a number', 3],
    ['no version', { types: [] }],
    ['a bad version', { schemaVersion: 'new', types: [] }],
    ['a version as a number', { schemaVersion: 1, types: [] }],
  ])('calls %s broken', (_, value) => {
    const opened = openProgram(value);
    expect(opened.status).toBe('broken');
    if (opened.status === 'broken')
      expect(opened.message).toBe("This file can't be opened: part of it is damaged.");
  });

  it('calls an invalid program broken, with problems for developers', () => {
    const value = { ...raw(), types: [{ kind: 'nonsense' }] };
    const opened = openProgram(value);
    expect(opened.status).toBe('broken');
    if (opened.status === 'broken') expect(opened.problems.length).toBeGreaterThan(0);
  });

  it('has no migrations yet: 1.0.0 is the first version', () => {
    expect(MIGRATIONS).toEqual([]);
    expect(SCHEMA_VERSION).toBe('1.0.0');
  });

  describe('migrating', () => {
    const toV2: Migration = {
      from: '1.0.0',
      to: '2.0.0',
      up: (json) => ({ ...json, schemaVersion: '2.0.0', stepOne: true }),
    };
    const toV3: Migration = {
      from: '2.0.0',
      to: '3.0.0',
      up: ({ stepOne, ...json }) => ({ ...json, schemaVersion: '3.0.0', stepTwo: stepOne }),
    };
    /** Pretends this build reads version 3, and accepts what the fake migrations produce. */
    const options = {
      current: '3.0.0',
      migrations: [toV2, toV3],
      validate: (json: unknown) =>
        (json as { stepTwo?: boolean }).stepTwo === true
          ? []
          : [{ code: 'shape' as const, message: 'not migrated', node: null }],
    };

    it('chains migrations up to the current version', () => {
      const opened = openProgram(raw('1.0.0'), options);
      expect(opened.status).toBe('migrated');
      if (opened.status === 'migrated') {
        expect(opened.from).toBe('1.0.0');
        expect(opened.program).toMatchObject({ schemaVersion: '3.0.0', stepTwo: true });
      }
    });

    it('never changes what it was given, and hands the original back', () => {
      const value = raw('1.0.0');
      const before = JSON.stringify(value);
      const scribbler: Migration = {
        from: '1.0.0',
        to: '3.0.0',
        up: (json) => {
          (json as { types: unknown[] }).types.length = 0;
          return { ...json, schemaVersion: '3.0.0', stepTwo: true };
        },
      };
      const opened = openProgram(value, { ...options, migrations: [scribbler] });
      expect(JSON.stringify(value)).toBe(before);
      expect(opened.status).toBe('migrated');
      if (opened.status === 'migrated') expect(opened.original).toBe(value);
    });

    it('calls the result broken if it is not valid after migrating', () => {
      const opened = openProgram(raw('1.0.0'), {
        ...options,
        migrations: [toV2],
        current: '2.0.0',
      });
      expect(opened.status).toBe('broken');
    });

    it('calls a file broken if a migration fails', () => {
      const failing: Migration = {
        from: '1.0.0',
        to: '3.0.0',
        up: () => {
          throw new Error('no');
        },
      };
      expect(openProgram(raw('1.0.0'), { ...options, migrations: [failing] }).status).toBe(
        'broken',
      );
    });

    it('needs no migration within a major version, which only adds things', () => {
      const opened = openProgram(raw('1.0.0'), { current: '1.2.0', migrations: [] });
      expect(opened.status).toBe('migrated');
      if (opened.status === 'migrated') expect(opened.program.schemaVersion).toBe('1.2.0');
    });

    it('calls a file too old if nothing leads from its major version', () => {
      const opened = openProgram(raw('1.0.0'), { current: '3.0.0', migrations: [] });
      expect(opened.status).toBe('broken');
      if (opened.status === 'broken')
        expect(opened.message).toBe(
          "This film was made with a very old StoryStage, so this one can't open it.",
        );
    });

    it("doesn't trust a migration that goes backwards", () => {
      const loop: Migration = {
        from: '1.0.0',
        to: '1.0.0',
        up: (json) => json,
      };
      expect(openProgram(raw('1.0.0'), { current: '3.0.0', migrations: [loop] }).status).toBe(
        'broken',
      );
    });
  });

  describe('a file from a newer version', () => {
    it('opens read-only, with a plain message', () => {
      const opened = openProgram(raw('2.0.0'));
      expect(opened.status).toBe('readOnly');
      if (opened.status === 'readOnly')
        expect(opened.message).toBe(
          'This film was made with a newer StoryStage. You can watch it and read its code, but not change it. Update StoryStage to change it.',
        );
    });

    it('opens with things it does not know', () => {
      const value = { ...raw('1.1.0'), mood: 'happy' };
      expect(openProgram(value).status).toBe('readOnly');
    });

    it("can't dodge the checks by claiming a future version", () => {
      const value = { ...raw('99.0.0'), types: [{ id: 'bad id', kind: 'type' }] };
      expect(openProgram(value).status).toBe('broken');
    });

    it('can not be edited in a session', () => {
      const opened = openProgram(raw('2.0.0'));
      if (opened.status !== 'readOnly') throw new Error('Expected read-only.');
      const session = new EditSession(opened.program, { readOnly: opened.message });
      expect(
        session.apply([{ kind: 'remove', label: 'x', node: opened.program.types[0]!.id }], 'x', 'x')
          .ok,
      ).toBe(false);
    });
  });
});
