/**
 * Writes the parts of the workplan and the handover roster that come from the schedule, and
 * puts them between their markers: `<!-- schedule:NAME -->` … `<!-- /schedule:NAME -->`.
 */
import {
  peak,
  simulateCap,
  simulateRoster,
  type Plan,
  type Schedule,
  type Scheduled,
} from './schedule.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

/** Rounds halves to the even neighbour, as the original Python did (10.5 → 10, 31.5 → 32). */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x);
  if (Math.abs(x - floor - 0.5) > 1e-9) return Math.round(x);
  return floor % 2 === 0 ? floor : floor + 1;
}

const days = (weeks: number) => roundHalfEven(weeks * 7);
const dateOf = (plan: Plan, weeks: number) =>
  new Date(Date.parse(`${plan.week0}T00:00:00Z`) + days(weeks) * DAY_MS);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const short = (d: Date) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
const long = (d: Date) => `${short(d)} ${d.getUTCFullYear()}`;
const parseDate = (s: string) => new Date(`${s}T00:00:00Z`);
/** "week 18.5 (26 Feb 2027)" */
export const weekDate = (plan: Plan, weeks: number) => `${weeks} (${long(dateOf(plan, weeks))})`;

/** Earliest start, then lane, then id: the order of the dependency table and the chart. */
function byStart(s: Schedule): Scheduled[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...s.items.values()].sort(
    (a, b) => a.es - b.es || cmp(a.lane, b.lane) || cmp(a.id, b.id),
  );
}

/** What actually happened: "0.3 (20–21 Oct)", "started 21 Oct", or nothing yet. */
export function actual(it: Scheduled): string {
  if (!it.started) return '';
  const from = parseDate(it.started);
  if (!it.finished) return `started ${short(from)}`;
  const to = parseDate(it.finished);
  const weeks = Math.round(((to.getTime() - from.getTime()) / DAY_MS + 1) / 0.7) / 10;
  const span =
    it.started === it.finished
      ? short(from)
      : from.getUTCMonth() === to.getUTCMonth()
        ? `${from.getUTCDate()}–${short(to)}`
        : `${short(from)}–${short(to)}`;
  return `${weeks} (${span})`;
}

export function dependencyTable(s: Schedule): string {
  const rows = byStart(s)
    .filter((it) => it.weeks > 0)
    .map((it) =>
      [
        it.id,
        it.label,
        it.lane,
        it.after.join(', ') || '—',
        it.weeks,
        `wk ${weekDate(s.plan, it.es)}`,
        it.slack === 0 ? '**0 (critical)**' : it.slack,
        actual(it),
      ].join(' | '),
    );
  return [
    '| Item | Work | Lane | Depends on | Weeks (est.) | Earliest start | Slack (weeks) | Actual (weeks) |',
    '|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r} |`),
  ].join('\n');
}

export function chart(s: Schedule): string {
  const sorted = byStart(s);
  const lanes = [...new Set(sorted.map((it) => it.lane))];
  const name = (it: Scheduled) => it.label.replace(/: /g, ' - ').replace(/ \([^)]*\)$/, '');
  const line = (it: Scheduled) => {
    const crit = it.slack === 0 ? 'crit, ' : '';
    const when = `${iso(dateOf(s.plan, it.es))}, ${days(it.weeks)}d`;
    const tag = it.id.replace(/\./g, '_');
    return it.weeks === 0
      ? `    ${name(it)} :milestone, ${crit}${tag}, ${when}`
      : `    ${it.id} ${name(it)} :${crit}${tag}, ${when}`;
  };
  return [
    '```mermaid',
    'gantt',
    `    title StoryStage 2: earliest-start schedule (week 0 = ${long(dateOf(s.plan, 0))}; estimates)`,
    '    dateFormat YYYY-MM-DD',
    '    axisFormat %d %b',
    ...lanes.flatMap((lane) => [
      `    section ${lane}`,
      ...sorted.filter((it) => it.lane === lane).map(line),
    ]),
    '```',
  ].join('\n');
}

export function lanesTable(s: Schedule): string {
  const p = peak(s);
  const rows = [
    `| Unlimited (${p.count} at the peak, in weeks ${p.from}–${p.to}) | week ${weekDate(s.plan, s.rc)} | week ${weekDate(s.plan, s.pilotEnd)} |`,
    ...s.plan.laneCaps.map((cap) => {
      const r = simulateCap(s, cap);
      return cap === s.plan.recommendedLanes
        ? `| **${cap} (recommended)** | **week ${r.rc}** | **week ${r.pilotEnd}** |`
        : `| ${cap} | week ${r.rc} | week ${r.pilotEnd} |`;
    }),
  ];
  return ['| Parallel lanes | Release candidate | Pilot ends |', '|---|---|---|', ...rows].join(
    '\n',
  );
}

/** The section 6 numbers that items belong to: WP11a, WP11b → 11; WP1.1 → 1; RC → none. */
export const sectionOf = (id: string) => /^WP(\d+)(?!\d)/.exec(id)?.[1];

/** The line under a section 6 "Depends on", citing the schedule's items and what they wait for. */
export function sectionLine(s: Schedule, section: string): string {
  const parts = [...s.items.values()]
    .filter((it) => sectionOf(it.id) === section)
    .map((it) =>
      it.after.length ? `${it.id} after ${it.after.join(', ')}` : `${it.id} needs nothing first`,
    );
  return `**Schedule items** (\`tools/plan/schedule.yaml\`): ${parts.join('; ')}.`;
}

export function rosterSummary(s: Schedule): string {
  const { finish } = simulateRoster(s);
  const rc = finish.get('RC')!;
  const pilot = finish.get('WP19')!;
  const end = Math.max(...finish.values());
  const matches = rc === s.rc && pilot === s.pilotEnd;
  return (
    `With this split ${matches ? 'the schedule matches the workplan' : 'the schedule is later than the workplan'}: ` +
    `**release candidate week ${weekDate(s.plan, rc)}, pilot ends week ${weekDate(s.plan, pilot)}**, ` +
    `later strands done by week ${weekDate(s.plan, end)}.`
  );
}

export function rosterTable(s: Schedule): string {
  const { start } = simulateRoster(s);
  const rows = s.plan.sessions.map((x) => {
    const first = Math.min(...[...x.firstRelease, ...x.later].map((id) => start.get(id)!));
    const critical = x.firstRelease.filter((id) => s.items.get(id)!.slack === 0);
    return `| [${x.id}](${x.brief}) | ${x.area} | wk ${first} | ${x.firstRelease.join(' → ')} | ${x.later.join(', ') || '—'} | ${critical.join(', ') || '—'} |`;
  });
  return [
    '| Session | Area | Starts | Items before the release candidate | After it | Critical-path items |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/** Every generated block, by file and marker name. Tables and the chart sit between blank lines. */
export function blocks(s: Schedule): Record<string, Record<string, string>> {
  const spaced = (text: string) => `\n\n${text}\n\n`;
  const inline = (text: string) => `\n${text}\n`;
  const sections = [...new Set([...s.items.keys()].map(sectionOf).filter((n) => n !== undefined))];
  return {
    'docs/WORKPLAN.md': {
      lanes: spaced(lanesTable(s)),
      'dependency-table': spaced(dependencyTable(s)),
      chart: spaced(chart(s)),
      ...Object.fromEntries(sections.map((n) => [`wp${n}`, inline(sectionLine(s, n))])),
    },
    'handover/README.md': {
      'roster-summary': inline(rosterSummary(s)),
      roster: spaced(rosterTable(s)),
    },
  };
}

const MARKER = /<!-- (\/?)schedule:([\w-]+) -->/g;

/** Puts each block between its markers. Reports markers that are missing, repeated or unknown. */
export function fill(text: string, wanted: Record<string, string>) {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  for (const m of text.matchAll(MARKER)) if (!m[1]) seen.set(m[2]!, (seen.get(m[2]!) ?? 0) + 1);
  for (const name of seen.keys()) if (!(name in wanted)) errors.push(`an unknown block "${name}"`);
  let out = text;
  for (const [name, body] of Object.entries(wanted)) {
    const open = `<!-- schedule:${name} -->`;
    const close = `<!-- /schedule:${name} -->`;
    const from = out.indexOf(open);
    const to = out.indexOf(close);
    if (seen.get(name) !== 1 || from < 0 || to < from) {
      errors.push(`the block "${name}" should appear once, as ${open} … ${close}`);
      continue;
    }
    out = out.slice(0, from + open.length) + body + out.slice(to);
  }
  return { text: out, errors };
}
