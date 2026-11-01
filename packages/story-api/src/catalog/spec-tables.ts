/**
 * WP4.1: the tables in `docs/spec/02-story-api.md`, written from the metadata so the spec and the
 * code can't disagree. `scripts/spec-cli.ts` puts them between `<!-- catalog:name -->` markers,
 * and `scripts/spec.test.ts` fails when the spec is out of date.
 */
import { DETAILS, IGNORED_DETAILS } from './details.ts';
import { CLASS_MAP, DROPPED, DROPPED_VALUES } from './dropped.ts';
import { ENTRIES, STAGE_CHANGES, STAGE_NEEDS } from './entries.ts';
import { EVENTS } from './events.ts';
import { ADDED_ENUMS, CLASS_PARENTS, ENUMS } from './types.ts';
import type { ApiClass, ApiEntry, DetailDef, EventDef, ParamDef } from './types.ts';
import words from '../strings/en-GB.json' with { type: 'json' };

const code = (s: string) => `\`${s}\``;
const codes = (list: readonly string[]) => list.map(code).join(', ');

function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`;
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

const signature = (params: readonly ParamDef[]) =>
  params.map((p) => code(`${p.name}: ${p.type}`) + (p.range ? ` (${p.range})` : '')).join(', ') ||
  '—';

const word = (key: string) => (words as Record<string, string>)[key] ?? '';
const phrase = (e: ApiEntry) => word(`entry.${e.on}.${e.name}`);
const eventPhrase = (e: EventDef) => word(`event.${e.name}`);

const defaultOf = (d: DetailDef) =>
  d.default === null ? (d.defaultMeans ?? '') : code(String(d.default));

const aliceClassesOf = (cls: ApiClass) =>
  Object.entries(CLASS_MAP)
    .filter(([, ours]) => ours === cls)
    .map(([alice]) => alice);

const classes = () =>
  table(
    ['Class', 'Extends', 'From Alice', 'On screen'],
    (Object.keys(CLASS_PARENTS) as ApiClass[]).map((cls) => [
      code(cls),
      CLASS_PARENTS[cls] ? code(CLASS_PARENTS[cls]) : '—',
      codes(aliceClassesOf(cls)) || '—',
      word(`class.${cls}`),
    ]),
  );

const entriesTable = (kind: ApiEntry['kind']) => {
  const entries = ENTRIES.filter((e) => e.kind === kind && e.task === '4.3');
  const rows = entries.map((e) => [
    code(e.on),
    code(e.name),
    signature(e.params),
    ...(e.kind === 'function' ? [code(e.returns)] : []),
    codes(e.details) || '—',
    phrase(e),
    code(e.runs),
  ]);
  const middle = kind === 'function' ? ['Returns'] : [];
  return table(['Class', 'Block', 'Parameters', ...middle, 'Details', 'On screen', 'Runs'], rows);
};

const details = () =>
  table(
    ['Detail', 'Type', 'Default', 'Limit', 'On screen'],
    Object.entries(DETAILS).map(([name, d]) => [
      code(name),
      code(d.type),
      defaultOf(d),
      d.range ?? '—',
      word(`detail.${name}`),
    ]),
  );

const values = () =>
  table(
    ['Type', 'Values', 'Origin'],
    Object.entries(ENUMS).map(([name, list]) => [
      code(name),
      list.join(', '),
      (ADDED_ENUMS as readonly string[]).includes(name) ? 'StoryStage' : 'Alice',
    ]),
  );

const events = () =>
  table(
    ['Event', 'Needs', 'Gives the handler', 'Details', 'From', 'On screen'],
    EVENTS.map((e) => [
      code(e.name),
      signature(e.args),
      signature(e.gives),
      codes(e.details) || '—',
      code(e.from),
      eventPhrase(e),
    ]),
  );

const added = () =>
  table(
    ['Class', 'Block', 'Parameters', 'Details', 'Task', 'On screen', 'Runs'],
    ENTRIES.filter((e) => e.task !== '4.3').map((e) => [
      code(e.on),
      code(e.name),
      signature(e.params),
      codes(e.details) || '—',
      e.task,
      phrase(e),
      code(e.runs),
    ]),
  );

const dropped = () => {
  const rows = DROPPED.map((g) => [codes(g.members), g.why]);
  rows.push(
    [codes(IGNORED_DETAILS), 'Alice’s source accepts these details and then ignores them.'],
    [
      Object.entries(DROPPED_VALUES)
        .map(([type, list]) =>
          list === 'rest' ? `\`${type}\` beyond the list in section 3a` : `\`${type}.${list[0]}\``,
        )
        .join(', '),
      'Function keys, keypads and input-method keys, which many school keyboards and iPads lack; “as often as possible”, which can’t work with the time-slice budget (6.3); and two constants no kept block uses.',
    ],
  );
  return table(['Dropped', 'Why'], rows);
};

const stage = () => {
  const needs = table(
    ['Need', 'What it asks for', 'Blocks'],
    Object.entries(STAGE_NEEDS).map(([name, what]) => {
      const users = [
        ...ENTRIES.filter((e) => e.runs === `needs:${name}`).map((e) => e.name),
        ...EVENTS.filter((e) => e.from === `needs:${name}`).map((e) => e.name),
      ];
      return [code(name), what, codes([...new Set(users)])];
    }),
  );
  return `${needs}\n\nChanges to commands the contract already has:\n\n${STAGE_CHANGES.map(
    (c) => `- ${c}`,
  ).join('\n')}`;
};

const crosswalk = () =>
  table(
    ['Block', 'BML 1.0', 'Unreal Engine concept'],
    [
      ...ENTRIES.map((e) => [code(`${e.on}.${e.name}`), e.bml ? code(e.bml) : '—', e.unreal]),
      ...EVENTS.map((e) => [code(e.name), '—', e.unreal]),
    ],
  );

export const SPEC_TABLES: Readonly<Record<string, () => string>> = {
  classes,
  procedures: () => entriesTable('procedure'),
  functions: () => entriesTable('function'),
  details,
  values,
  events,
  added,
  dropped,
  stage,
  crosswalk,
};

/** `markdown` with each marked block replaced by its current table. */
export function withSpecTables(markdown: string): string {
  return Object.entries(SPEC_TABLES).reduce((text, [name, render]) => {
    const open = `<!-- catalog:${name} -->`;
    const close = `<!-- /catalog:${name} -->`;
    const start = text.indexOf(open);
    const end = text.indexOf(close);
    if (start < 0 || end < 0) throw new Error(`The spec has no ${open} block.`);
    return `${text.slice(0, start + open.length)}\n${render()}\n${text.slice(end)}`;
  }, markdown);
}
