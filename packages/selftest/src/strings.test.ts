import { describe, expect, it } from 'vitest';
import enGB from './strings/en-GB.json' with { type: 'json' };
import { STEPS } from './steps.ts';
import { t, type WordKey } from './strings.ts';

describe("the self-test's words", () => {
  it('fills each {name} from the values', () => {
    expect(t('problem.missing', { scene: 's2', object: 'fox' })).toBe('Scene s2 is missing fox.');
  });

  it('has a title for every step, from the strings file', () => {
    const titles = new Set(
      Object.entries(enGB).flatMap(([k, v]) => (k.startsWith('step.') ? [v] : [])),
    );
    for (const step of STEPS) expect(titles, step.id).toContain(step.title);
  });

  it('has no empty phrase, and only plain {name} gaps', () => {
    for (const [key, phrase] of Object.entries(enGB) as [WordKey, string][]) {
      expect(phrase.trim(), key).not.toBe('');
      expect(phrase.replace(/\{\w+\}/g, ''), key).not.toMatch(/[{}]/);
    }
  });
});
