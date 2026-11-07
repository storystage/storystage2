import { describe, expect, it } from 'vitest';
import { checkBoundaries, type WorkspacePackage } from './boundaries.ts';

const pkg = (name: string, deps: string[] = []): WorkspacePackage => ({
  name: `@storystage/${name}`,
  dir: `packages/${name}`,
  dependencies: Object.fromEntries(deps.map((d) => [`@storystage/${d}`, 'workspace:*'])),
});

describe('checkBoundaries', () => {
  it('accepts the layout in the workplan', () => {
    const errors = checkBoundaries([
      pkg('ast'),
      pkg('story-api', ['ast']),
      pkg('runtime', ['ast', 'story-api']),
      pkg('studio', ['ast', 'runtime', 'story-api']),
    ]);
    expect(errors).toEqual([]);
  });

  it('refuses any dependency from ast', () => {
    expect(checkBoundaries([pkg('ast', ['stage']), pkg('stage')])).toEqual([
      '@storystage/ast depends on @storystage/stage; it may depend only on nothing.',
    ]);
  });

  it('keeps runtime to ast and story-api', () => {
    expect(checkBoundaries([pkg('runtime', ['stage']), pkg('stage')])).toHaveLength(1);
  });

  it('refuses dependencies on studio and desktop', () => {
    const errors = checkBoundaries([
      pkg('stage', ['studio', 'desktop']),
      pkg('studio'),
      pkg('desktop'),
    ]);
    expect(errors).toHaveLength(2);
  });

  it('requires workspace:* ranges', () => {
    const prompter: WorkspacePackage = {
      ...pkg('prompter'),
      dependencies: { '@storystage/stage': '^0.0.0' },
    };
    expect(checkBoundaries([pkg('stage'), prompter])[0]).toMatch(/use "workspace:\*"/);
  });

  it('finds cycles', () => {
    const errors = checkBoundaries([pkg('a', ['b']), pkg('b', ['c']), pkg('c', ['a'])]);
    expect(errors).toEqual([
      'Dependency cycle: @storystage/a -> @storystage/b -> @storystage/c -> @storystage/a.',
    ]);
  });

  it('keeps Babylon.js inside the stage', () => {
    const uses = (name: string): WorkspacePackage => ({
      ...pkg(name),
      dependencies: { '@babylonjs/core': '^9.31.1' },
    });
    expect(checkBoundaries([uses('stage')])).toEqual([]);
    expect(checkBoundaries([uses('runtime'), uses('story-api')])).toEqual([
      '@storystage/runtime depends on @babylonjs/core; only the stage may use Babylon.js.',
      '@storystage/story-api depends on @babylonjs/core; only the stage may use Babylon.js.',
    ]);
  });

  it('ignores third-party dependencies', () => {
    const ast: WorkspacePackage = { ...pkg('ast'), dependencies: { zod: '^4.0.0' } };
    expect(checkBoundaries([ast])).toEqual([]);
  });
});
