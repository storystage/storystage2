import { exampleProduction, type Production } from '@storystage/production';
import { micros } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { TITLE_CARD, bylineFor, titleCard } from './titles.ts';

const titled = (title: string): Production => {
  const p = exampleProduction();
  return { ...p, manifest: { ...p.manifest, title } };
};

describe('titleCard', () => {
  it("shows the production's title and the byline for 4 seconds", () => {
    expect(titleCard(titled('The Lost Kite'), 'A film by Willow Class')).toEqual({
      title: 'The Lost Kite',
      byline: 'A film by Willow Class',
      duration: micros(4),
    });
    expect(TITLE_CARD).toBe(micros(4));
  });

  it('calls an empty title "Untitled film", and leaves an empty byline out', () => {
    expect(titleCard(titled('   '), '  ')).toEqual({
      title: 'Untitled film',
      byline: null,
      duration: micros(4),
    });
  });
});

describe('bylineFor', () => {
  it("is written from the learners' names", () => {
    expect(bylineFor(['Ana'])).toBe('A film by Ana');
    expect(bylineFor(['Ana', 'Sam'])).toBe('A film by Ana and Sam');
    expect(bylineFor(['Ana', 'Pip', ' ', 'Sam'])).toBe('A film by Ana, Pip and Sam');
  });

  it('is empty with no names', () => {
    expect(bylineFor([])).toBe('');
  });
});
