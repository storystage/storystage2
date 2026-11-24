import { describe, expect, it } from 'vitest';
import { shownSoundWords, soundWords } from './codeWords.ts';
import { RAIN } from './testing.ts';

// The film's sounds as the code editors word them (7.17).

describe('soundWords', () => {
  it('offers each sound by its label, written as its id, for a sound only', () => {
    const words = soundWords(() => [RAIN]);
    expect(words.references?.('Audio')).toEqual([{ value: 'sn1', words: 'Rain' }]);
    expect(words.references?.('SceneId')).toEqual([]);
    expect(words.referenceWord?.('Audio', 'sn1')).toBe('Rain');
    expect(words.referenceWord?.('Audio', 'sn9')).toBeUndefined();
    expect(words.referenceWord?.('SceneId', 'sn1')).toBeUndefined();
  });

  it('reads the film’s sounds each time, so one imported since is offered', () => {
    const film = shownSoundWords([]);
    const words = film.words;
    expect(words.references?.('Audio')).toEqual([]);
    film.show([RAIN]);
    expect(words.references?.('Audio')).toEqual([{ value: 'sn1', words: 'Rain' }]);
    expect(words.referenceWord?.('Audio', 'sn1')).toBe('Rain');
  });
});
