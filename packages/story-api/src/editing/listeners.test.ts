import type { Expression, ListenerDecl } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { field, ID, mint } from './testing.ts';
import { describer } from './words.ts';
import { scene } from './testing.ts';

// A click listener names what's clicked (the owner, 23 Nov 2026): its setOfVisuals detail.

const clicked = (details: Record<string, Expression>): ListenerDecl => ({
  id: mint(),
  kind: 'listener',
  event: 'clickOnObject',
  args: {},
  details,
  params: [],
  body: [],
});
const list = (...items: Expression[]): Expression => ({
  id: mint(),
  kind: 'arrayOf',
  of: { kind: 'story', name: 'Thing' },
  items,
});
const words = (l: ListenerDecl) => describer(scene()).inside(l, ID.scene);

describe('a click listener’s words', () => {
  it('names the object clicked', () => {
    expect(words(clicked({ setOfVisuals: list(field(ID.cat)) }))).toBe('when cat is clicked');
  });

  it('names each object, with or between them', () => {
    expect(
      words(clicked({ setOfVisuals: list(field(ID.cat), field(ID.chair), field(ID.rex)) })),
    ).toBe('when cat or chair or rex is clicked');
  });

  it('says an object, with none chosen', () => {
    expect(words(clicked({}))).toBe('when an object is clicked');
  });

  it('reads an empty list as the event, which the check marks (the owner, 24 Nov 2026)', () => {
    expect(words(clicked({ setOfVisuals: list() }))).toBe('when an object is clicked');
  });

  it('reads a list that isn’t written out by its own words', () => {
    const local = { id: mint(), kind: 'variableRef', variable: ID.height } as Expression;
    expect(words(clicked({ setOfVisuals: local }))).toBe('when height is clicked');
  });
});
