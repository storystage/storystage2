import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SIMS2_MODELS } from './sims.ts';

describe('SIMS2_MODELS', () => {
  it('is the licence audit’s list of Sims 2 models, as gallery keys', () => {
    const csv = readFileSync(
      new URL('../../../docs/legal/letters/cmu-sims2-models-left-out.csv', import.meta.url),
      'utf8',
    );
    const keys = csv
      .trim()
      .split(/\r?\n/)
      .slice(1)
      .map((row) => {
        const [, name, folder] = row.split(',');
        return `${folder}/${name}`;
      });
    expect(keys).toHaveLength(95);
    expect([...SIMS2_MODELS].sort()).toEqual(keys.sort());
  });
});
