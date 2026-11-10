import { describe, expect, it } from 'vitest';
import enGB from './strings/en-GB.json' with { type: 'json' };
import { t, type WordKey } from './strings.ts';

describe("the check's words", () => {
  it('fills each {name} from the values, and leaves one it has no value for', () => {
    expect(t('onScreen.passed', { name: 'Owl' })).toBe('Owl is on screen');
    expect(t('length.flag', { seconds: 6, planned: 3 })).toBe(
      'This frame lasts 6 seconds; you planned 3',
    );
    expect(t('onScreen.passed')).toBe('{name} is on screen');
  });

  it('has words for every side and facing the comparison names', () => {
    const keys = Object.keys(enGB);
    for (const side of ['left', 'right']) expect(keys).toContain(`side.${side}`);
    for (const way of ['away', 'camera', 'left', 'right', 'sideways']) {
      expect(keys).toContain(`facing.now.${way}`);
      expect(keys).toContain(`facing.planned.${way}`);
    }
  });

  it('has no empty phrase, and only plain {name} gaps', () => {
    for (const [key, phrase] of Object.entries(enGB) as [WordKey, string][]) {
      expect(phrase.trim(), key).not.toBe('');
      expect(phrase.replace(/\{\w+\}/g, ''), key).not.toMatch(/[{}]/);
    }
  });
});
