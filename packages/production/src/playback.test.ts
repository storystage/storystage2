import { describe, expect, it } from 'vitest';
import { nodeId, type ListenerDecl } from '@storystage/ast';
import { micros } from '@storystage/story-api';
import { exampleProduction } from './example.ts';
import {
  SCENE_START_LIMIT,
  firstScene,
  nextScene,
  waitsForViewer,
  type NextScene,
} from './playback.ts';
import { sceneId, type Production } from './types.ts';

// The example's running order: s1 (cut), s2 (fade to black, 1 s), s3 (crossfade, 0.5 s).
const p = exampleProduction();
const [s1, s2, s3] = ['s1', 's2', 's3'].map(sceneId) as [
  ReturnType<typeof sceneId>,
  ReturnType<typeof sceneId>,
  ReturnType<typeof sceneId>,
];
const finished = { kind: 'finished' } as const;

describe('firstScene', () => {
  it('is the first in running order, or none', () => {
    expect(firstScene(p)).toBe('s1');
    expect(firstScene({ ...p, manifest: { ...p.manifest, runningOrder: [] } })).toBeNull();
  });
});

describe('nextScene', () => {
  it('plays the running order, each scene ending with its own transition', () => {
    expect(nextScene(p, s1, finished, 1)).toEqual({
      kind: 'scene',
      scene: 's2',
      transition: { kind: 'cut', duration: 0 },
    });
    expect(nextScene(p, s2, finished, 2)).toEqual({
      kind: 'scene',
      scene: 's3',
      transition: { kind: 'fadeToBlack', duration: micros(1) },
    });
  });

  it("ends the film after the last scene, ignoring the last scene's transition", () => {
    expect(nextScene(p, s3, finished, 3)).toEqual({ kind: 'end', fadeOut: null });
  });

  it("goes to a scene with the ended scene's transition, and carries on from there", () => {
    expect(nextScene(p, s3, { kind: 'goToScene', scene: 's1' }, 3)).toEqual({
      kind: 'scene',
      scene: 's1',
      transition: { kind: 'crossfade', duration: micros(0.5) },
    });
    expect(nextScene(p, s1, finished, 4)).toMatchObject({ scene: 's2' });
  });

  it('crossfades into a scene, whatever the running order says', () => {
    expect(nextScene(p, s1, { kind: 'crossfade', scene: 's3', duration: micros(1) }, 1)).toEqual({
      kind: 'scene',
      scene: 's3',
      transition: { kind: 'crossfade', duration: micros(1) },
    });
  });

  it('fades to black into the next scene, or ends the film in black after the last', () => {
    const fade = { kind: 'fadeToBlack', duration: micros(2) } as const;
    expect(nextScene(p, s1, fade, 1)).toEqual({
      kind: 'scene',
      scene: 's2',
      transition: { kind: 'fadeToBlack', duration: micros(2) },
    });
    expect(nextScene(p, s3, fade, 3)).toEqual({ kind: 'end', fadeOut: micros(2) });
  });

  it("refuses a scene the production doesn't have, in goToScene or crossfade", () => {
    expect(nextScene(p, s1, { kind: 'goToScene', scene: 's9' }, 1)).toEqual({
      kind: 'noSuchScene',
      scene: 's9',
    });
    expect(nextScene(p, s1, { kind: 'crossfade', scene: 'gone', duration: 0 }, 1)).toMatchObject({
      kind: 'noSuchScene',
    });
  });

  it('stops a film that keeps going back, after the scene start limit', () => {
    const back = { kind: 'goToScene', scene: 's1' } as const;
    let result: NextScene = { kind: 'end', fadeOut: null };
    let started = 1;
    for (; started <= SCENE_START_LIMIT; started++) {
      result = nextScene(p, s1, back, started);
      if (result.kind !== 'scene') break;
    }
    expect(result).toEqual({ kind: 'tooManyScenes', limit: SCENE_START_LIMIT });
    expect(started).toBe(SCENE_START_LIMIT);
  });

  it('cuts to the next scene from a scene not in the running order', () => {
    expect(nextScene(p, sceneId('lost'), { kind: 'goToScene', scene: 's2' }, 1)).toEqual({
      kind: 'scene',
      scene: 's2',
      transition: { kind: 'cut', duration: 0 },
    });
  });
});

describe('waitsForViewer', () => {
  const withListener = (event: string): Production => {
    const listener: ListenerDecl = {
      id: nodeId('scene1l'),
      kind: 'listener',
      event,
      args: {},
      details: {},
      params: [],
      body: [],
    };
    return {
      ...p,
      program: {
        ...p.program,
        types: p.program.types.map((t, i) => (i === 0 ? { ...t, listeners: [listener] } : t)),
      },
    };
  };

  it('is true for a scene listening for a click or a key, which waits for the viewer', () => {
    for (const event of ['clickOnScreen', 'clickOnObject', 'keyPress', 'arrowKeyPress']) {
      const q = withListener(event);
      expect(waitsForViewer(q.program, q, s1)).toBe(true);
      expect(waitsForViewer(q.program, q, s2)).toBe(false);
    }
  });

  it("is false for timers, collisions and the like, which don't keep a scene going", () => {
    for (const event of ['timer', 'collisionStart', 'proximityEnter', 'viewEnter']) {
      const q = withListener(event);
      expect(waitsForViewer(q.program, q, s1)).toBe(false);
    }
    expect(waitsForViewer(p.program, p, s1)).toBe(false);
  });
});
