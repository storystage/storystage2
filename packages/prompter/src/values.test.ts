import { describe, expect, it } from 'vitest';
import type { NodeId, TypeDecl } from '@storystage/ast';
import { listItems, listText, toValue, type SceneObjects } from './values.ts';

const scene: SceneObjects = {
  type: {
    fields: ['penguin', 'fox', 'tree'].map((name) => ({ id: `f-${name}`, kind: 'field', name })),
  } as unknown as TypeDecl,
  classOf: (field) => (field.name === 'tree' ? 'Prop' : 'Flyer'),
};
let n = 0;
const mint = () => `n${++n}` as NodeId;

describe('toValue: lists (spec 04, section 3)', () => {
  it('reads a list as its items, separated by commas, each by the type of one item', () => {
    expect(toValue('penguin, fox,tree', 'Thing[]', scene, mint)).toMatchObject({
      ok: true,
      expression: {
        kind: 'arrayOf',
        of: { kind: 'story', name: 'Thing' },
        items: [{ field: 'f-penguin' }, { field: 'f-fox' }, { field: 'f-tree' }],
      },
    });
    expect(toValue('1, 2.5', 'Number[]', scene, mint)).toMatchObject({
      ok: true,
      expression: { items: [{ value: 1 }, { value: 2.5 }] },
    });
  });

  it('says which item is wrong, and that a list needs one', () => {
    expect(toValue('penguin, dragon', 'Thing[]', scene, mint)).toEqual({
      ok: false,
      message: "There's no dragon in this scene.",
    });
    expect(toValue(' , ', 'Thing[]', scene, mint)).toEqual({
      ok: false,
      message: 'Give one or more, separated by commas, such as "owl, cat".',
    });
  });

  it('writes a list one way, so a step and a block compare by their items', () => {
    expect(listItems(' owl ,cat,, ')).toEqual(['owl', 'cat']);
    expect(listText('owl,cat')).toBe(listText('owl, cat'));
  });
});
