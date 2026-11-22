import { describe, expect, it } from 'vitest';
import { BASE_VOICES, castVoices, isCastVoice, switchAccent, voiceFor } from './presets.ts';

describe('castVoices', () => {
  it('gives people woman and man in turn, and animals an animal voice, in British by default', () => {
    const v = castVoices([
      { id: 'owl', storyClass: 'Flyer' },
      { id: 'child', storyClass: 'Biped' },
      { id: 'teacher', storyClass: 'Biped' },
      { id: 'cat', storyClass: 'Quadruped' },
    ]);
    expect(v.get('child')).toMatchObject({ preset: 'woman', base: 'bf_emma', accent: 'british' });
    // The owl comes first and also starts from a man's voice, so the teacher gets the next one.
    expect(v.get('owl')).toMatchObject({ preset: 'animal', base: 'bm_george', pitch: 1.15 });
    expect(v.get('teacher')).toMatchObject({ preset: 'man', base: 'bm_lewis' });
    expect(v.get('cat')).toMatchObject({ preset: 'animal', base: 'bm_daniel' });
  });

  it('keeps the learner’s own choice of preset', () => {
    const v = castVoices([{ id: 'owl', storyClass: 'Flyer', preset: 'big-animal' }]);
    expect(v.get('owl')).toMatchObject({ preset: 'big-animal', pitch: 0.8, speed: 0.9 });
  });

  it('gives no two characters the same voice while voices remain, then varies the pitch', () => {
    const cast = Array.from({ length: 6 }, (_, i) => ({
      id: `g${i}`,
      storyClass: 'Biped' as const,
      preset: 'woman' as const,
    }));
    const v = [...castVoices(cast).values()];
    expect(new Set(v.slice(0, 4).map((x) => x.base)).size).toBe(4);
    expect(v[4]).toMatchObject({ base: 'bf_emma', pitch: 1.06 });
    expect(v.every(isCastVoice)).toBe(true);
  });

  it('uses Kokoro’s American voices for the American accent', () => {
    const v = castVoices([{ id: 'a', storyClass: 'Biped' }], 'american');
    expect(v.get('a')).toMatchObject({ base: 'af_heart', accent: 'american' });
  });
});

describe('switchAccent', () => {
  it('keeps the preset and the character’s place, and changes the base voice', () => {
    const girl = voiceFor('girl', 'british', 1);
    const us = switchAccent(girl, 'american');
    expect(us).toMatchObject({ preset: 'girl', accent: 'american', base: 'af_bella' });
    expect(us.pitch).toBe(girl.pitch);
    expect(switchAccent(us, 'british')).toEqual(girl);
  });
});

describe('isCastVoice', () => {
  it('refuses a voice outside the limits or from the other accent', () => {
    const v = voiceFor('woman', 'british', 0);
    expect(isCastVoice(v)).toBe(true);
    expect(isCastVoice({ ...v, pitch: 2 })).toBe(false);
    expect(isCastVoice({ ...v, base: BASE_VOICES.american.woman[0]! })).toBe(false);
  });
});
