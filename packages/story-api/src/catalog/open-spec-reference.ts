/**
 * WP4.8: the tables in the open specification's readable reference (`docs/story-api/README.md`)
 * and its crosswalk annex (`crosswalk.md`), rendered from the published catalog itself, so the
 * text and `story-api.json` can't disagree. `scripts/open-spec-cli.ts` writes them between
 * `<!-- reference:name -->` markers. Not exported from the package: only the tools use it.
 */
import type { Catalog } from './open-spec.ts';

const code = (s: string) => `\`${s}\``;
const codes = (list: readonly string[]) => list.map(code).join(', ') || '—';
const cell = (s: string) => s.replaceAll('|', '\\|');

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

type Param = Catalog['blocks'][number]['params'][number];
const signature = (params: readonly Param[]) =>
  params.map((p) => code(`${p.name}: ${p.type}`) + (p.range ? ` (${p.range})` : '')).join(', ') ||
  '—';

const vector = ({ x, y, z }: { x: number; y: number; z: number }) => {
  const axis = x !== 0 ? 'X' : y !== 0 ? 'Y' : 'Z';
  return `${x + y + z > 0 ? '+' : '-'}${axis}`;
};

const space = (c: Catalog) => {
  const rows = (['move', 'turn', 'roll'] as const).flatMap((block) =>
    Object.entries(c.space[block]).map(([direction, v]) => [
      code(block),
      code(direction),
      vector(v),
    ]),
  );
  return `${c.space.axes} Units: ${c.space.units}.\n\n${table(['Block', 'Direction', 'Axis'], rows)}`;
};

const classes = (c: Catalog) =>
  table(
    ['Class', 'Extends', 'Kind', 'Words', 'From Alice'],
    c.classes.map((k) => [
      code(k.name),
      k.extends ? code(k.extends) : '—',
      k.abstract ? 'abstract' : 'concrete',
      k.words,
      codes(k.fromAlice),
    ]),
  );

const types = (c: Catalog) =>
  [
    `- **Basic:** ${codes(c.types.basic)}.`,
    `- **References** to something outside a program: ${codes(c.types.references)}. A program writes ${codes(c.types.writtenAsText)} as text, and a joint as a value of \`JointId\` (section 6.3).`,
    `- **Classes** as types: each class in section 3, except that the \`Text\` class's type is \`TextModel\`, because \`Text\` is words. A list of anything is written with \`[]\`: \`Biped[]\`.`,
    '',
    table(
      ['Value type', 'Values', 'Origin'],
      c.values.map((v) => [code(v.name), v.values.map((x) => code(x.name)).join(', '), v.origin]),
    ),
  ].join('\n');

const details = (c: Catalog) =>
  table(
    ['Detail', 'Type', 'Default', 'Limit', 'Words'],
    c.details.map((d) => [
      code(d.name),
      code(d.type),
      d.default === null ? (d.defaultMeans ?? '—') : code(String(d.default)),
      d.range ?? '—',
      d.words,
    ]),
  );

const blocks = (origin: 'alice' | 'storystage') => (c: Catalog) =>
  table(
    ['Class', 'Block', 'Kind', 'Parameters', 'Returns', 'Details', 'Words'],
    c.blocks
      .filter((b) => b.origin === origin)
      .map((b) => [
        code(b.class),
        code(b.name),
        b.kind,
        signature(b.params),
        'returns' in b && b.returns ? code(b.returns) : '—',
        codes(b.details),
        b.words,
      ]),
  );

const events = (c: Catalog) =>
  table(
    ['Event', 'Needs', 'Gives the handler', 'Details', 'Words'],
    c.events.map((e) => [
      code(e.name),
      signature(e.needs),
      signature(e.gives),
      codes(e.details),
      e.words,
    ]),
  );

const dropped = (c: Catalog) =>
  table(
    ['Left out', 'Why'],
    c.dropped.map((d) => [codes(d.members), d.why]),
  );

const crosswalk = (c: Catalog) =>
  table(
    ['Block or event', 'From Alice', 'BML 1.0', 'Unreal Engine concept'],
    [
      ...c.blocks.map((b) => [
        code(`${b.class}.${b.name}`),
        codes(b.fromAlice),
        'bml' in b.crosswalk && b.crosswalk.bml ? code(b.crosswalk.bml) : '—',
        b.crosswalk.unreal,
      ]),
      ...c.events.map((e) => [code(e.name), codes(e.fromAlice), '—', e.crosswalk.unreal]),
    ],
  );

const version = (c: Catalog) =>
  `**Version ${c.version}, ${c.status === 'draft' ? 'a draft for comment' : 'stable'}.** ${c.blocks.length} blocks, ${c.events.length} events, ${c.details.length} details and ${c.values.length} value types.`;

export const REFERENCE_TABLES: Readonly<Record<string, (c: Catalog) => string>> = {
  version,
  space,
  classes,
  types,
  details,
  'alice-blocks': blocks('alice'),
  'new-blocks': blocks('storystage'),
  events,
  dropped,
  crosswalk,
};

/** `markdown` with each marked block that it has replaced by its current table. */
export function withReferenceTables(markdown: string, catalog: Catalog): string {
  let text = markdown;
  for (const [name, render] of Object.entries(REFERENCE_TABLES)) {
    const open = `<!-- reference:${name} -->`;
    const close = `<!-- /reference:${name} -->`;
    const start = text.indexOf(open);
    if (start < 0) continue;
    const end = text.indexOf(close, start);
    if (end < 0) throw new Error(`${open} has no ${close}.`);
    text = `${text.slice(0, start + open.length)}\n${render(catalog)}\n${text.slice(end)}`;
  }
  return text;
}
