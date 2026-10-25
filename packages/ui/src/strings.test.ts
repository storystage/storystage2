import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import enGB from './strings/en-GB.json' with { type: 'json' };
import { createStrings, format } from './strings.ts';

describe('format', () => {
  it('fills named values', () => {
    expect(format('Scene {scene} · Frame {frame}', { scene: 2, frame: '2.3' })).toBe(
      'Scene 2 · Frame 2.3',
    );
  });

  it('refuses a placeholder with no value', () => {
    expect(() => format('Make {actor} say it')).toThrow('No value for {actor}');
  });
});

describe('createStrings', () => {
  const s = createStrings(enGB);

  it('looks up a key', () => {
    expect(s.t('mode.production')).toBe('Production stage');
  });

  it('chooses the plural form for the count', () => {
    expect(s.plural('count.frames', 1)).toBe('1 frame');
    expect(s.plural('count.frames', 9)).toBe('9 frames');
    expect(s.plural('count.scenes', 0)).toBe('0 scenes');
  });

  it('refuses a key that has no string', () => {
    expect(() => s.t('mode.backstage' as keyof typeof enGB)).toThrow(
      'No string for "mode.backstage"',
    );
  });
});

/** Every `src/strings/*.json` in the workspace's apps and packages. */
function stringFiles(): string[] {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const files: string[] = [];
  for (const group of ['apps', 'packages']) {
    for (const pkg of readdirSync(join(root, group))) {
      const dir = join(root, group, pkg, 'src', 'strings');
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir)) if (f.endsWith('.json')) files.push(join(dir, f));
    }
  }
  return files;
}

/**
 * Words the learner never sees (CLAUDE.md rule 9, 07-ux §3). "Edit" is allowed as a button that
 * edits; "an edit" as a noun for a change is not.
 */
const BANNED =
  /\b(AST|nodes?|fields?|invocations?|tokens?|schemas?|APIs?)\b|\b(an|the|this|that|your|undo)\s+edits?\b|\bedits\b/i;

describe('the words on screen', () => {
  const files = stringFiles();

  it('finds this package’s strings', () => {
    expect(files.some((f) => f.includes(join('ui', 'src', 'strings')))).toBe(true);
  });

  it.each(files)('%s uses none of the words the learner never sees', (file) => {
    const messages = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    const found = Object.entries(messages).filter(([, text]) => BANNED.test(text));
    expect(found).toEqual([]);
  });

  it('catches the banned words, and allows Edit as a button', () => {
    for (const text of [
      'Drag the node here',
      'Your API key',
      'Undo edit',
      'The schema changed',
      'Edits saved',
    ]) {
      expect(BANNED.test(text), text).toBe(true);
    }
    for (const text of ['Edit', 'Edit the credits', 'Make cat say Hello', 'Add cat']) {
      expect(BANNED.test(text), text).toBe(false);
    }
  });
});
