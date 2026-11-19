import { describe, expect, it } from 'vitest';
import type { BackstageManifest } from '@storystage/backstage';
import { auditProblems, shippedTable } from './audit.ts';

type Item = BackstageManifest['items'][number];

const item = (over: Partial<Omit<Item, 'id'>> & { id?: string } = {}): Item =>
  ({
    id: 'kaykit/Biped/knight',
    section: 'cast',
    class: 'Biped',
    displayName: 'Knight',
    files: { model: 'models/kaykit/Biped/knight.glb', thumbnail: 't.webp' },
    joints: [],
    defaultSize: { height: 2 },
    licence: 'CC0-1.0',
    credit: 'Knight by Kay Lousberg, KayKit (CC0)',
    source: { url: 'https://github.com/KayKit-Game-Assets/x', retrieved: '2026-11-15' },
    ...over,
  }) as Item;

const manifest = (...items: Item[]): BackstageManifest =>
  ({ manifestVersion: '2.3.0', items }) as BackstageManifest;

describe('shippedTable', () => {
  it('counts the shipped models by source and licence, with a credit line from each', () => {
    const table = shippedTable(
      manifest(
        item(),
        item({ id: 'kaykit/Biped/mage', credit: 'Mage by Kay Lousberg, KayKit (CC0)' }),
        item({
          id: 'polypizza/Prop/chair',
          licence: 'CC-BY-3.0',
          credit: 'Chair by Google, CC BY 3.0 | via Poly Pizza, changed for StoryStage',
        }),
      ),
    );
    expect(table).toContain('| KayKit | CC0-1.0 | 2 | Knight by Kay Lousberg, KayKit (CC0) |');
    expect(table).toContain('| Poly Pizza | CC-BY-3.0 | 1 | Chair by Google, CC BY 3.0 \\| via');
    expect(table).toContain('| **All** | | **3** | |');
  });

  it('names an unknown source by its id', () => {
    expect(shippedTable(manifest(item({ id: 'newsource/Prop/x' })))).toContain('| newsource |');
  });

  it('escapes backslashes before bars, so a credit line stays in its cell', () => {
    const table = shippedTable(manifest(item({ credit: 'A\\|B' })));
    expect(table).toContain('| A\\\\\\|B |');
  });
});

describe('auditProblems', () => {
  it('passes an item that keeps every rule', () => {
    expect(auditProblems(manifest(item()))).toEqual([]);
  });

  it('names an item with a licence that may not ship, no credit, page or date', () => {
    const problems = auditProblems(
      manifest(
        item({ licence: 'not-sure' }),
        item({ id: 'a/B/c', credit: ' ' }),
        item({ id: 'a/B/d', source: { url: 'http://example.com' } }),
      ),
    );
    expect(problems).toEqual([
      'kaykit/Biped/knight: licence "not-sure" may not ship.',
      'a/B/c: has no credit line.',
      "a/B/d: has no https link to the item's own page.",
      'a/B/d: has no date it was retrieved.',
    ]);
  });

  it("wants a CC BY model's credit to say it was changed, but not a VRM kept as it was", () => {
    const ccby = { licence: 'CC-BY-4.0' as const, credit: 'Granny by Imagine, CC BY 4.0' };
    expect(auditProblems(manifest(item(ccby)))).toHaveLength(1);
    expect(
      auditProblems(manifest(item({ ...ccby, credit: `${ccby.credit}, changed for StoryStage` }))),
    ).toEqual([]);
    expect(
      auditProblems(
        manifest(item({ ...ccby, files: { model: 'models/x.vrm', thumbnail: 't.webp' } })),
      ),
    ).toEqual([]);
  });
});
