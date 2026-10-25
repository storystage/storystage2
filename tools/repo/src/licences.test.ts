import { describe, expect, it } from 'vitest';
import {
  findProblems,
  fromPnpmLicences,
  licenceVerdict,
  renderNotice,
  type Dependency,
} from './licences.ts';

const dep = (name: string, licence: string): Dependency => ({ name, versions: ['1.0.0'], licence });

describe('licenceVerdict', () => {
  it.each([
    ['MIT', 'allowed'],
    ['Apache-2.0', 'allowed'],
    ['MPL-2.0', 'allowed'],
    ['GPL-3.0-only', 'build-only'],
    ['LGPL-2.1', 'build-only'],
    ['LGPL-3.0-or-later', 'build-only'],
    ['AGPL-3.0-only', 'disallowed'],
    ['SSPL-1.0', 'disallowed'],
    ['CC-BY-NC-4.0', 'disallowed'],
    ['UNLICENSED', 'disallowed'],
    ['Some custom thing', 'unknown'],
    ['', 'unknown'],
  ] as const)('%s is %s', (licence, verdict) => {
    expect(licenceVerdict(licence)).toBe(verdict);
  });

  it('takes the better side of OR and the worse side of AND', () => {
    expect(licenceVerdict('(MIT OR GPL-3.0-only)')).toBe('allowed');
    expect(licenceVerdict('MIT AND GPL-3.0-only')).toBe('build-only');
    expect(licenceVerdict('Apache-2.0 OR AGPL-3.0-only')).toBe('allowed');
    expect(licenceVerdict('(MIT AND Zlib) OR AGPL-3.0-only')).toBe('allowed');
  });
});

describe('findProblems', () => {
  it('refuses GPL linked into the app but allows it in build tools', () => {
    const problems = findProblems([dep('a', 'GPL-3.0-only')], [dep('b', 'GPL-3.0-only')]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({ linked: true, verdict: 'build-only' });
  });

  it('refuses AGPL anywhere', () => {
    expect(findProblems([], [dep('tool', 'AGPL-3.0-only')])).toHaveLength(1);
  });

  it('allows OFL-1.1 for font packages only (decision 0031)', () => {
    const fonts = [
      dep('@fontsource/atkinson-hyperlegible', 'OFL-1.1'),
      dep('@fontsource-variable/bricolage-grotesque', 'OFL-1.1'),
    ];
    expect(findProblems(fonts, [])).toEqual([]);
    expect(findProblems([dep('some-widget', 'OFL-1.1')], [])).toHaveLength(1);
    expect(findProblems([dep('@fontsource/x', 'GPL-3.0-only')], [])).toHaveLength(1);
  });

  it('refuses unknown licences until they are reviewed', () => {
    expect(findProblems([dep('a', 'Custom')], [])).toHaveLength(1);
    const exceptions = [
      { package: 'a@1.0.0', licence: 'Custom', reason: 'read it', approved: 'U' },
    ];
    expect(findProblems([dep('a', 'Custom')], [], exceptions)).toEqual([]);
  });
});

describe('renderNotice', () => {
  it('is sorted and marks GPL build tools', () => {
    const text = renderNotice(
      'HEAD',
      [dep('zed', 'MIT'), dep('alpha', 'ISC')],
      [dep('gcc', 'GPL-3.0')],
    );
    expect(text.indexOf('alpha')).toBeLessThan(text.indexOf('zed'));
    expect(text).toContain('gcc  1.0.0  GPL-3.0  [build only: GPL family]');
  });
});

describe('fromPnpmLicences', () => {
  it('flattens the pnpm output and leaves out workspace packages', () => {
    const deps = fromPnpmLicences({
      MIT: [
        { name: 'react', versions: ['19.0.0'] },
        { name: '@storystage/ast', versions: ['0.0.0'] },
      ],
    });
    expect(deps).toEqual([{ name: 'react', versions: ['19.0.0'], licence: 'MIT' }]);
  });
});
