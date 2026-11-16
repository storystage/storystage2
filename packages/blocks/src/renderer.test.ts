import { COLOR_TOKENS } from '@storystage/ui/tokens';
import { describe, expect, it } from 'vitest';
import { blockTypes } from './definitions.ts';
import { FAMILIES, familyOf } from './renderer.ts';
import { LISTENER, METHOD, USER_CALL, nodeType, storyStatementType } from './shapes.ts';

describe('the Alice-like look (14-editors 3i.5)', () => {
  it('gives every block a family, screen 02’s for moves, speech and camera', () => {
    for (const type of blockTypes()) expect(FAMILIES).toContain(familyOf(type));
    expect(familyOf(storyStatementType('move'))).toBe('move');
    expect(familyOf(storyStatementType('say'))).toBe('speech');
    expect(familyOf(storyStatementType('frameShot'))).toBe('camera');
    expect(familyOf(nodeType('doTogether'))).toBe('control');
    expect(familyOf(nodeType('number'))).toBe('value');
    expect(familyOf(METHOD)).toBe('method');
    expect(familyOf(LISTENER)).toBe('method');
    expect(familyOf(USER_CALL)).toBe('yours');
  });

  it('has a colour and a colour for its words in the tokens, for each coloured family', () => {
    const tokens = COLOR_TOKENS as readonly string[];
    for (const f of FAMILIES.filter((f) => !['control', 'method', 'value'].includes(f))) {
      expect(tokens).toContain(`block-${f}`);
      expect(tokens).toContain(`on-block-${f}`);
    }
  });
});
