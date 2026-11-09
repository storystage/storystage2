import { describe, expect, it } from 'vitest';
import { missingWords } from '../App.tsx';

describe('missingWords', () => {
  it('names up to three models by the last part of their ids, then how many more', () => {
    expect(missingWords(['class/Biped/big-robot', 'class/Prop/crate'])).toContain(
      ': big robot, crate.',
    );
    expect(
      missingWords([
        'class/Prop/a',
        'class/Prop/b',
        'class/Prop/c',
        'class/Prop/d',
        'class/Prop/e',
      ]),
    ).toContain(': a, b, c and 2 more.');
  });
});
