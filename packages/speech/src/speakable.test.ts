import { describe, expect, it } from 'vitest';
import { MAX_UTTERANCE, speakable } from './speakable.ts';

describe('speakable (spec 06, section 2.2)', () => {
  it('leaves plain text alone', () => {
    expect(speakable('The owl walks to the tree.')).toEqual(['The owl walks to the tree.']);
  });

  it('takes out markdown, tags and control characters, and collapses space', () => {
    expect(
      speakable(
        '## Done!\n**The** `move` block\u0007 moves <b>the cat</b>.\n\n> Try [this](http://x)',
      ),
    ).toEqual(['Done! The move block moves the cat. Try this']);
  });

  it('keeps punctuation that is part of the words', () => {
    expect(speakable("It's 2.5 metres - not 3!")).toEqual(["It's 2.5 metres - not 3!"]);
  });

  it('gives nothing for text with nothing to say', () => {
    expect(speakable('')).toEqual([]);
    expect(speakable(' \n** ** ')).toEqual([]);
  });

  it('splits long text at sentence ends, each piece within the limit', () => {
    const sentence = 'The cat walks slowly across the grass towards the old tree. ';
    const pieces = speakable(sentence.repeat(12));
    expect(pieces.length).toBeGreaterThan(1);
    for (const piece of pieces) {
      expect(piece.length).toBeLessThanOrEqual(MAX_UTTERANCE);
      expect(piece).toMatch(/tree\.$/);
    }
    expect(pieces.join(' ')).toBe(sentence.repeat(12).trim());
  });

  it('splits a sentence that is too long by itself at a space', () => {
    const pieces = speakable(`${'word '.repeat(100)}end.`);
    for (const piece of pieces) expect(piece.length).toBeLessThanOrEqual(MAX_UTTERANCE);
    expect(pieces.join(' ')).toBe(`${'word '.repeat(100)}end.`);
  });

  it('cuts a single word longer than the limit', () => {
    const pieces = speakable('x'.repeat(MAX_UTTERANCE + 10));
    expect(pieces.map((p) => p.length)).toEqual([MAX_UTTERANCE, 10]);
  });
});
