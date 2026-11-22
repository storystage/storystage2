import { describe, expect, it } from 'vitest';
import { ALICE_GROUNDS } from '@storystage/backstage';
import { GROUND_TYPES } from '@storystage/stage';

describe('ALICE_GROUNDS (S6, spec 19)', () => {
  it('names only grounds the stage has built in', () => {
    for (const [name, id] of Object.entries(ALICE_GROUNDS))
      expect(GROUND_TYPES, `${name} → ${id}`).toContain(id);
  });

  it('covers the ten appearances Alice’s starter worlds use', () => {
    expect(Object.keys(ALICE_GROUNDS).sort()).toEqual(
      [
        'BROWN_SAVANA_GRASS',
        'DARK_GRASS',
        'DRY_GRASS',
        'JUNGLE',
        'MARS',
        'MOON',
        'OCEAN',
        'SANDY_DESERT',
        'SNOW',
        'SWAMP',
      ].sort(),
    );
  });
});
