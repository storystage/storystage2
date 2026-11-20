/**
 * WP3.1: what ships in Backstage, for the licence audit (`docs/legal/licence-audit.md`).
 *
 * - `shippedTable`: the shipped models by source and licence, with a credit line from each, for
 *   the owner's sign-off. The audit's section 1 judges each source; this shows what was taken.
 * - `auditProblems`: every shipped item checked against the audit's section 2 (an allowed
 *   licence, a credit line, the item's own page and the date it was retrieved, and a CC BY
 *   model's credit saying it was changed).
 */
import { SHIPPED_LICENCES, type BackstageManifest } from '@storystage/backstage';

type Item = BackstageManifest['items'][number];

/** Each source's name in the audit, by the first part of a Backstage id. */
export const SOURCE_NAMES: Readonly<Record<string, string>> = {
  'blender-studio': 'Blender Studio',
  gobkit: "Gobkit's free animal packs",
  kaykit: 'KayKit',
  makehuman: 'MakeHuman people',
  osa: 'Open Source Avatars',
  polypizza: 'Poly Pizza',
  scottishmaritime: 'Scottish Maritime Museum (on Sketchfab)',
  sketchfab: 'Sketchfab, per item',
  smithsonian: 'Smithsonian Open Access',
  storybook: 'Storybook cast, KayKit models and characters made from their parts',
  storystage: "Backdrops' grounds, from ambientCG and Poly Haven textures",
  styloo: 'Styloo, Animals Asset Pack',
  vrmc: 'VRM Consortium (Seed-san)',
  vuena: 'Vuena, Free Low-Poly Animals',
};

const sourceOf = (item: Item) => item.id.split('/')[0]!;

/** Text for a Markdown table cell: backslashes first, then the bars that would end the cell. */
const cell = (text: string) => text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');

/** The shipped models by source and licence, as a Markdown table. */
export function shippedTable(manifest: BackstageManifest): string {
  const groups = new Map<string, Item[]>();
  for (const item of manifest.items) {
    const key = `${sourceOf(item)}\u0000${item.licence}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const rows = [...groups.entries()]
    .map(([key, items]) => {
      const [source, licence] = key.split('\u0000') as [string, string];
      return { source: SOURCE_NAMES[source] ?? source, licence, items };
    })
    .sort((a, b) => a.source.localeCompare(b.source) || a.licence.localeCompare(b.licence));
  return [
    '| Source | Licence | Models | For example |',
    '|---|---|---|---|',
    ...rows.map(
      (r) => `| ${r.source} | ${r.licence} | ${r.items.length} | ${cell(r.items[0]!.credit)} |`,
    ),
    `| **All** | | **${manifest.items.length}** | |`,
  ].join('\n');
}

/** Each shipped item that breaks a rule in the audit's section 2, in words. */
export function auditProblems(manifest: BackstageManifest): string[] {
  const problems: string[] = [];
  for (const item of manifest.items) {
    const p = (m: string) => problems.push(`${item.id}: ${m}`);
    if (!(SHIPPED_LICENCES as readonly string[]).includes(item.licence))
      p(`licence "${item.licence}" may not ship.`);
    if (!item.credit?.trim()) p('has no credit line.');
    if (item.licence === 'public-domain' && !item.publicDomain?.startsWith('docs/legal/'))
      p('is public domain but names no record in docs/legal/.');
    if (!item.source?.url?.startsWith('https://')) p("has no https link to the item's own page.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(item.source?.retrieved ?? ''))
      p('has no date it was retrieved.');
    if (
      item.licence.startsWith('CC-BY') &&
      item.files.model.endsWith('.glb') &&
      !item.credit.includes('changed for StoryStage')
    )
      p("is a CC BY model whose credit line doesn't say it was changed for StoryStage.");
  }
  return problems;
}
