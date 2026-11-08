import { describe, expect, it } from 'vitest';
import {
  BUDGETS_ARE_PROVISIONAL,
  ITEM_BUDGETS,
  SCENE_BUDGET,
  budgetFor,
  checkScene,
} from './budget.ts';

const person = { section: 'cast', budget: { triangles: 20_000, textureMaxPx: 1024 } } as const;
const crate = { section: 'props', budget: { triangles: 2_000, textureMaxPx: 512 } } as const;

describe('budgets', () => {
  it("use spike 1.2's working figures until the reference devices have run", () => {
    expect(BUDGETS_ARE_PROVISIONAL).toBe(true);
    expect(budgetFor({ section: 'cast' })).toEqual({ triangles: 20_000, textureMaxPx: 1024 });
    expect(SCENE_BUDGET.triangles).toBe(100_000);
  });

  it('give every section a budget no bigger than a character', () => {
    for (const budget of Object.values(ITEM_BUDGETS)) {
      expect(budget.triangles).toBeGreaterThan(0);
      expect(budget.triangles).toBeLessThanOrEqual(ITEM_BUDGETS.cast.triangles);
      expect([512, 1024, 2048]).toContain(budget.textureMaxPx);
    }
  });
});

describe('checkScene', () => {
  it('passes a scene within the budget', () => {
    const r = checkScene([person, person, person, crate, crate]);
    expect(r.triangles).toBe(64_000);
    expect(r.fits).toBe(true);
    expect(r.message).toBeNull();
  });

  it('counts every copy on the stage: two cats cost twice one cat', () => {
    expect(checkScene([person, person]).triangles).toBe(40_000);
  });

  it('warns in plain words when a scene has too much detail', () => {
    const r = checkScene(Array.from({ length: 6 }, () => person));
    expect(r.triangles).toBe(120_000);
    expect(r.fits).toBe(false);
    expect(r.message).toMatch(/slow/);
    expect(r.message).not.toMatch(/triangle|texture|budget|memory/i);
  });

  it('estimates picture memory, and warns when that is too much', () => {
    const big = { section: 'set', budget: { triangles: 1_000, textureMaxPx: 2048 } } as const;
    const one = checkScene([big]);
    // 2048 × 2048 pixels, 4 bytes each, plus a third for the smaller copies (mipmaps).
    expect(one.textureMegabytes).toBeCloseTo((2048 * 2048 * 4 * 4) / 3 / 2 ** 20, 5);
    const many = checkScene(Array.from({ length: 6 }, () => big));
    expect(many.fits).toBe(false);
    expect(many.message).toMatch(/slow/);
  });

  it('is happy with an empty scene', () => {
    expect(checkScene([])).toEqual({
      triangles: 0,
      textureMegabytes: 0,
      fits: true,
      message: null,
    });
  });
});
