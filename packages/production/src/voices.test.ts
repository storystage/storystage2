import { describe, expect, it } from 'vitest';
import { nodeId, type EditOperation } from '@storystage/ast';
import { exampleProduction } from './example.ts';
import { openProduction, saveProduction } from './file.ts';
import { ProductionSession } from './session.ts';
import type { Production } from './types.ts';
import {
  BASE_VOICES,
  VOICES_MAX,
  checkCastVoice,
  keptVoices,
  renameVoices,
  voiceNames,
  type CastVoice,
} from './voices.ts';

const fox: CastVoice = {
  preset: 'animal',
  base: 'bm_george',
  pitch: 1.15,
  formant: 1.15,
  speed: 1,
  accent: 'british',
};
const penguin: CastVoice = { ...fox, preset: 'small-animal', base: 'bf_emma', pitch: 1.45 };

const withVoices = (voices: unknown): Production => {
  const p = exampleProduction();
  return { ...p, manifest: { ...p.manifest, voices: voices as Production['manifest']['voices'] } };
};

describe('checkCastVoice (spec 06 section 4.3)', () => {
  it('takes a voice within the limits, naming a base voice StoryStage ships', () => {
    expect(checkCastVoice(fox)).toEqual([]);
    expect(checkCastVoice({ ...fox, accent: 'american', base: 'am_adam' })).toEqual([]);
    expect(BASE_VOICES.british.woman).toContain('bf_emma');
  });

  it('says what is wrong with one that would reach the engine wrongly', () => {
    expect(checkCastVoice('fox')).toHaveLength(1);
    expect(checkCastVoice({ ...fox, preset: 'dragon' }).join()).toMatch(/preset/);
    expect(checkCastVoice({ ...fox, base: 'xx_unknown' }).join()).toMatch(/base/);
    // An American voice under a British accent is a voice we don't ship for it.
    expect(checkCastVoice({ ...fox, base: 'am_adam' }).join()).toMatch(/base/);
    expect(checkCastVoice({ ...fox, accent: 'scottish' }).join()).toMatch(/accent/);
    expect(checkCastVoice({ ...fox, pitch: 1.6 }).join()).toMatch(/pitch/);
    expect(checkCastVoice({ ...fox, formant: 0.6 }).join()).toMatch(/formant/);
    expect(checkCastVoice({ ...fox, speed: 2 }).join()).toMatch(/speed/);
    expect(checkCastVoice({ ...fox, speed: Number.NaN }).join()).toMatch(/speed/);
    expect(checkCastVoice({ ...fox, script: 'say hello' }).join()).toMatch(/unknown field/);
  });
});

describe('keptVoices and voiceNames (spec 03 section 1.6)', () => {
  const names = voiceNames(exampleProduction());

  it('names every set-up object, in any scene, once', () => {
    expect([...names].sort()).toEqual(['fox', 'penguin']);
  });

  it('keeps the voices that fit and name a character some scene has', () => {
    expect(keptVoices({ fox, penguin }, names)).toEqual({ fox, penguin });
    expect(keptVoices({ fox, owl: penguin }, names)).toEqual({ fox });
    expect(keptVoices({ fox, penguin: { ...penguin, pitch: 9 } }, names)).toEqual({ fox });
    expect(keptVoices({ owl: penguin }, names)).toBeUndefined();
    expect(keptVoices('fox', names)).toBeUndefined();
    expect(keptVoices(undefined, names)).toBeUndefined();
  });

  it('drops the whole field when it holds more than the limit', () => {
    const many = Object.fromEntries(
      Array.from({ length: VOICES_MAX + 1 }, (_, i) => [i ? `c${i}` : 'fox', fox]),
    );
    expect(keptVoices(many, names)).toBeUndefined();
  });
});

describe('voices in a file (format 1.4.0)', () => {
  it('keep through a save and an open', () => {
    const p = withVoices({ fox, penguin });
    const opened = openProduction(saveProduction(p));
    expect(opened.status).toBe('ok');
    if (opened.status !== 'broken')
      expect(opened.production.manifest.voices).toEqual({ fox, penguin });
  });

  it("drop one that doesn't fit, or whose character is gone, and still open the film", () => {
    const opened = openProduction(
      saveProduction(withVoices({ fox, owl: penguin, penguin: { ...penguin, base: 'nope' } })),
    );
    expect(opened.status).toBe('ok');
    if (opened.status !== 'broken') expect(opened.production.manifest.voices).toEqual({ fox });
    const none = openProduction(saveProduction(withVoices({ owl: penguin })));
    if (none.status !== 'broken') expect(none.production.manifest).not.toHaveProperty('voices');
    const junk = openProduction(saveProduction(withVoices('loud')));
    expect(junk.status).toBe('ok');
    if (junk.status !== 'broken') expect(junk.production.manifest).not.toHaveProperty('voices');
  });
});

describe('renaming a character (spec 03 section 1.6)', () => {
  const rename = (node: string, name: string): EditOperation => ({
    kind: 'rename',
    label: `Rename to ${name}`,
    node: nodeId(node),
    name,
  });

  it('carries the voice to the new name, and keeps it for the old name where it remains', () => {
    const next = renameVoices({ fox }, [['fox', 'rusty']], new Set(['rusty']));
    expect(next).toEqual({ rusty: fox });
    // Other scenes still have a fox: it keeps its voice, and the new name gets a copy.
    expect(renameVoices({ fox }, [['fox', 'rusty']], new Set(['rusty', 'fox']))).toEqual({
      fox,
      rusty: fox,
    });
    // The new name's own voice wins.
    expect(renameVoices({ fox, rusty: penguin }, [['fox', 'rusty']], new Set(['rusty']))).toEqual({
      rusty: penguin,
    });
    expect(renameVoices(undefined, [['fox', 'rusty']], new Set())).toBeUndefined();
  });

  it('happens in the same undo step as the rename in code', () => {
    const s = new ProductionSession(withVoices({ fox, penguin }));
    // Scene 1's fox field: scenes 2 and 3 keep their foxes.
    expect(s.apply([rename('scene1f', 'rusty')], 'Rename fox', 'code')).toEqual({ ok: true });
    expect(s.production().manifest.voices).toEqual({ fox, penguin, rusty: fox });
    s.undo();
    expect(s.production().manifest.voices).toEqual({ fox, penguin });
    expect(s.history().filter((h) => h.done)).toHaveLength(0);
  });
});
