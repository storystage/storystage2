import { describe, expect, it } from 'vitest';
import { wrapped } from './editor.ts';

// An error's words in Blockly's warning bubble, which draws a line per line of text.

describe('wrapped', () => {
  it('breaks the words into lines of about 50 characters, at spaces', () => {
    const words =
      'This loop goes round and round without taking any time, so StoryStage stopped it. Put a block that takes time inside it, or give it a way to end.';
    const lines = wrapped(words).split('\n');
    expect(lines.length).toBeGreaterThan(2);
    expect(lines.every((l) => l.length <= 50)).toBe(true);
    expect(lines.join(' ')).toBe(words);
  });

  it('leaves a short message as it is, and never breaks a long word', () => {
    expect(wrapped('No scene called Beach.')).toBe('No scene called Beach.');
    expect(wrapped(`${'a'.repeat(60)} b`)).toBe(`${'a'.repeat(60)}\nb`);
  });
});
