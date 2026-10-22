/**
 * The schedule model (WP0.10). Reads `tools/plan/schedule.yaml`, checks it, and works out the
 * earliest-start schedule, each item's slack and the critical path, plus two simulations: a cap
 * on parallel Claude Code sessions (workplan 5a, "How many lanes?") and the session roster
 * (handover/README.md). Ported from the handover's schedule.py, capsim.py and sessions.py, and
 * gives the same numbers.
 */
import { parse } from 'yaml';

/** The release candidate and the pilot: the two ends that slack is measured against. */
export const RELEASE = 'RC';
export const PILOT = 'WP19';

export interface Item {
  id: string;
  label: string;
  lane: string;
  /** C (Claude Code session), U (owner) or C+U. */
  who: string;
  weeks: number;
  basis: string;
  after: string[];
  /** Actual dates, YYYY-MM-DD. */
  started?: string;
  finished?: string;
}

export interface Session {
  id: string;
  brief: string;
  area: string;
  firstRelease: string[];
  later: string[];
}

export interface Plan {
  week0: string;
  laterLanes: string[];
  laneCaps: number[];
  recommendedLanes: number;
  bases: Record<string, string>;
  items: Item[];
  sessions: Session[];
}

export interface Scheduled extends Item {
  /** Earliest start and finish, latest finish and slack, in weeks from week 0. */
  es: number;
  ef: number;
  lf: number;
  slack: number;
  /** A later strand: starts after the release candidate; slack runs to the end of the plan. */
  later: boolean;
}

export interface Schedule {
  plan: Plan;
  items: Map<string, Scheduled>;
  /** The release candidate's start, the pilot's end and the end of the whole plan. */
  rc: number;
  pilotEnd: number;
  end: number;
}

const ITEM_FIELDS = [
  'id',
  'label',
  'lane',
  'who',
  'weeks',
  'basis',
  'after',
  'started',
  'finished',
];
const SESSION_FIELDS = ['brief', 'area', 'first_release', 'later'];
const TOP_FIELDS = [
  'week0',
  'later_lanes',
  'lane_caps',
  'recommended_lanes',
  'bases',
  'items',
  'sessions',
];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

/** Parses and checks the schedule file. Every problem is reported, in plain words. */
export function readPlan(text: string): { plan?: Plan; errors: string[] } {
  const errors: string[] = [];
  let raw: unknown;
  try {
    raw = parse(text);
  } catch (e) {
    return { errors: [`schedule.yaml is not valid YAML: ${(e as Error).message}`] };
  }
  if (!isRecord(raw)) return { errors: ['schedule.yaml should be a map of settings.'] };
  const unknown = (where: string, r: Raw, allowed: string[]) => {
    for (const k of Object.keys(r))
      if (!allowed.includes(k)) errors.push(`${where}: unknown field "${k}".`);
  };
  unknown('schedule.yaml', raw, TOP_FIELDS);

  const week0 = typeof raw.week0 === 'string' && DATE.test(raw.week0) ? raw.week0 : '';
  if (!week0) errors.push('week0 should be a date, YYYY-MM-DD.');
  const laterLanes = isStrings(raw.later_lanes) ? raw.later_lanes : [];
  if (!isStrings(raw.later_lanes)) errors.push('later_lanes should be a list of lane names.');
  const laneCaps =
    Array.isArray(raw.lane_caps) && raw.lane_caps.every((n) => Number.isInteger(n) && n > 0)
      ? (raw.lane_caps as number[])
      : [];
  if (!laneCaps.length) errors.push('lane_caps should be a list of whole numbers.');
  const recommendedLanes = typeof raw.recommended_lanes === 'number' ? raw.recommended_lanes : 0;
  if (!laneCaps.includes(recommendedLanes))
    errors.push('recommended_lanes should be one of lane_caps.');
  const bases: Record<string, string> = {};
  if (isRecord(raw.bases))
    for (const [k, v] of Object.entries(raw.bases))
      if (typeof v === 'string') bases[k] = v;
      else errors.push(`bases: "${k}" should be a sentence.`);
  else errors.push('bases should map each basis to a sentence explaining it.');

  const items: Item[] = [];
  if (!Array.isArray(raw.items)) errors.push('items should be a list.');
  for (const [n, r] of (Array.isArray(raw.items) ? raw.items : []).entries()) {
    const where = `items[${n}]${isRecord(r) && typeof r.id === 'string' ? ` (${r.id})` : ''}`;
    if (!isRecord(r)) {
      errors.push(`${where} should be a map.`);
      continue;
    }
    unknown(where, r, ITEM_FIELDS);
    const text = (k: string) => {
      if (typeof r[k] === 'string' && r[k]) return r[k];
      errors.push(`${where}: ${k} is missing.`);
      return '';
    };
    const item: Item = {
      id: text('id'),
      label: text('label'),
      lane: text('lane'),
      who: text('who'),
      weeks: typeof r.weeks === 'number' && r.weeks >= 0 ? r.weeks : 0,
      basis: text('basis'),
      after: isStrings(r.after) ? r.after : [],
    };
    if (typeof r.weeks !== 'number' || r.weeks < 0)
      errors.push(`${where}: weeks should be a number of weeks.`);
    if (!isStrings(r.after)) errors.push(`${where}: after should be a list of item ids.`);
    if (item.basis && !(item.basis in bases))
      errors.push(`${where}: basis "${item.basis}" is not one of the bases.`);
    for (const k of ['started', 'finished'] as const) {
      if (r[k] === undefined) continue;
      if (typeof r[k] === 'string' && DATE.test(r[k])) item[k] = r[k];
      else errors.push(`${where}: ${k} should be a date, YYYY-MM-DD.`);
    }
    if (item.finished && !item.started) errors.push(`${where}: finished but never started.`);
    if (item.started && item.finished && item.finished < item.started)
      errors.push(`${where}: finished before it started.`);
    items.push(item);
  }

  const ids = new Set<string>();
  for (const it of items) {
    if (ids.has(it.id)) errors.push(`${it.id} is listed twice.`);
    ids.add(it.id);
  }
  for (const it of items)
    for (const d of it.after)
      if (!ids.has(d)) errors.push(`${it.id} waits for ${d}, which isn't an item.`);
  for (const id of [RELEASE, PILOT]) if (!ids.has(id)) errors.push(`The item ${id} is missing.`);
  errors.push(...findCycles(items));

  const sessions: Session[] = [];
  const owner = new Map<string, string>();
  if (!isRecord(raw.sessions)) errors.push('sessions should map each session to its items.');
  for (const [id, r] of Object.entries(isRecord(raw.sessions) ? raw.sessions : {})) {
    if (!isRecord(r) || !isStrings(r.first_release) || !isStrings(r.later)) {
      errors.push(`sessions.${id}: needs brief, area, first_release and later.`);
      continue;
    }
    unknown(`sessions.${id}`, r, SESSION_FIELDS);
    if (typeof r.brief !== 'string' || typeof r.area !== 'string')
      errors.push(`sessions.${id}: brief and area should be text.`);
    for (const i of [...r.first_release, ...r.later]) {
      if (!ids.has(i)) errors.push(`sessions.${id} lists ${i}, which isn't an item.`);
      if (owner.has(i)) errors.push(`${i} is in both ${owner.get(i)} and ${id}.`);
      owner.set(i, id);
    }
    sessions.push({
      id,
      brief: String(r.brief),
      area: String(r.area),
      firstRelease: r.first_release,
      later: r.later,
    });
  }

  if (errors.length) return { errors };
  return {
    plan: { week0, laterLanes, laneCaps, recommendedLanes, bases, items, sessions },
    errors,
  };
}

function findCycles(items: Item[]): string[] {
  const after = new Map(items.map((it) => [it.id, it.after]));
  const state = new Map<string, 'visiting' | 'done'>();
  const errors: string[] = [];
  const visit = (id: string, path: string[]) => {
    if (state.get(id) === 'done' || !after.has(id)) return;
    if (state.get(id) === 'visiting') {
      errors.push(`A loop of dependencies: ${[...path.slice(path.indexOf(id)), id].join(' → ')}.`);
      return;
    }
    state.set(id, 'visiting');
    for (const d of after.get(id)!) visit(d, [...path, id]);
    state.set(id, 'done');
  };
  for (const it of items) visit(it.id, []);
  return errors;
}

/** Earliest start for every item, then slack against the pilot's end (first-release work) or
 * the end of the whole plan (later strands). */
export function schedule(plan: Plan): Schedule {
  const by = new Map(plan.items.map((it) => [it.id, it]));
  const es = new Map<string, number>();
  const start = (id: string): number => {
    const known = es.get(id);
    if (known !== undefined) return known;
    const s = Math.max(0, ...by.get(id)!.after.map((d) => start(d) + by.get(d)!.weeks));
    es.set(id, s);
    return s;
  };
  for (const it of plan.items) start(it.id);
  const ef = (id: string) => es.get(id)! + by.get(id)!.weeks;
  const end = Math.max(...plan.items.map((it) => ef(it.id)));
  const pilotEnd = ef(PILOT);

  const successors = new Map(plan.items.map((it) => [it.id, [] as string[]]));
  for (const it of plan.items) for (const d of it.after) successors.get(d)!.push(it.id);
  const isLater = (it: Item) => plan.laterLanes.includes(it.lane);
  const latestFinish = (members: Set<string>, finish: number) => {
    const lf = new Map<string, number>();
    const visit = (id: string): number => {
      const known = lf.get(id);
      if (known !== undefined) return known;
      const next = successors.get(id)!.filter((x) => members.has(x));
      const v = Math.min(finish, ...next.map((x) => visit(x) - by.get(x)!.weeks));
      lf.set(id, v);
      return v;
    };
    for (const id of members) visit(id);
    return lf;
  };
  const release = new Set(plan.items.filter((it) => !isLater(it)).map((it) => it.id));
  const lfRelease = latestFinish(release, pilotEnd);
  const lfAll = latestFinish(new Set(by.keys()), end);

  const items = new Map<string, Scheduled>();
  for (const it of plan.items) {
    const lf = release.has(it.id) ? lfRelease.get(it.id)! : lfAll.get(it.id)!;
    items.set(it.id, {
      ...it,
      es: es.get(it.id)!,
      ef: ef(it.id),
      lf,
      slack: Math.round((lf - ef(it.id)) * 100) / 100,
      later: !release.has(it.id),
    });
  }
  return { plan, items, rc: es.get(RELEASE)!, pilotEnd, end };
}

/** First-release items with no slack. */
export const criticalPath = (s: Schedule) =>
  [...s.items.values()].filter((it) => !it.later && it.slack === 0).map((it) => it.id);

const STEP = 0.5;
const EPS = 1e-9;
const MAX_WEEKS = 200;

/**
 * At most `cap` Claude Code items at once (owner-only items aren't capped). First-release work
 * goes first, then the least slack. Returns the release candidate, the pilot's end and the end.
 */
export function simulateCap(s: Schedule, cap: number) {
  const ids = [...s.items.keys()];
  const it = (id: string) => s.items.get(id)!;
  const usesSession = (id: string) => it(id).who.includes('C') && it(id).weeks > 0;
  const start = new Map<string, number>();
  const finish = new Map<string, number>();
  let running: string[] = [];
  for (let t = 0; finish.size < ids.length && t <= MAX_WEEKS; t += STEP) {
    for (const id of running)
      if (start.get(id)! + it(id).weeks <= t + EPS) finish.set(id, start.get(id)! + it(id).weeks);
    running = running.filter((id) => !finish.has(id));
    for (let changed = true; changed;) {
      // Repeat, so work after a zero-length milestone can start at the same time.
      changed = false;
      const ready = ids
        .filter((id) => !start.has(id) && it(id).after.every((d) => finish.has(d)))
        .sort((a, b) => Number(it(a).later) - Number(it(b).later) || it(a).slack - it(b).slack);
      for (const id of ready) {
        const inUse = running.filter((r) => it(r).who.includes('C')).length;
        if (usesSession(id) && inUse >= cap) continue;
        start.set(id, t);
        changed = true;
        if (it(id).weeks === 0) finish.set(id, t);
        else running.push(id);
      }
    }
  }
  return {
    rc: finish.get(RELEASE)!,
    pilotEnd: finish.get(PILOT)!,
    end: Math.max(...finish.values()),
  };
}

/** Each session works its own items one at a time, in its listed order. Owner-only items and
 * milestones belong to no session and start as soon as they can. */
export function simulateRoster(s: Schedule) {
  const ids = [...s.items.keys()];
  const it = (id: string) => s.items.get(id)!;
  const sessionOf = new Map<string, string>();
  const position = new Map<string, number>();
  for (const session of s.plan.sessions)
    [...session.firstRelease, ...session.later].forEach((id, n) => {
      sessionOf.set(id, session.id);
      position.set(id, n);
    });
  const start = new Map<string, number>();
  const finish = new Map<string, number>();
  const busy = new Map<string, string | null>(s.plan.sessions.map((x) => [x.id, null]));
  for (let t = 0; finish.size < ids.length && t <= MAX_WEEKS; t += STEP) {
    for (const [lane, id] of busy)
      if (id && start.get(id)! + it(id).weeks <= t + EPS) {
        finish.set(id, start.get(id)! + it(id).weeks);
        busy.set(lane, null);
      }
    for (let changed = true; changed;) {
      changed = false;
      const ready = ids
        .filter((id) => !start.has(id) && it(id).after.every((d) => finish.has(d)))
        .sort(
          (a, b) =>
            Number(it(a).later) - Number(it(b).later) ||
            (position.get(a) ?? 0) - (position.get(b) ?? 0) ||
            it(a).slack - it(b).slack,
        );
      for (const id of ready) {
        const lane = sessionOf.get(id) ?? `_${id}`;
        if (sessionOf.has(id) && busy.get(lane)) continue;
        start.set(id, t);
        changed = true;
        if (it(id).weeks === 0) finish.set(id, t);
        else busy.set(lane, id);
      }
    }
  }
  return { start, finish };
}

/** The most items in progress at once on the earliest-start schedule, and when. */
export function peak(s: Schedule) {
  const counts: [number, number][] = [];
  for (let t = 0; t < s.end; t += STEP)
    counts.push([
      t,
      [...s.items.values()].filter((x) => x.es <= t + 0.01 && t + 0.01 < x.ef).length,
    ]);
  const most = Math.max(...counts.map(([, n]) => n));
  const at = counts.filter(([, n]) => n === most).map(([t]) => t);
  return { count: most, from: at[0]!, to: at.at(-1)! + STEP };
}
