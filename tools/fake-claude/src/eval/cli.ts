/**
 * Runs the evaluation set (`docs/eval/README.md`, "A live run" and "Recorded runs").
 *
 *   ANTHROPIC_API_KEY=… pnpm eval -- --live --pilot          the pilot: one row from each category
 *   ANTHROPIC_API_KEY=… pnpm eval -- --live --all --judge    every row, then the judge's grades
 *   pnpm eval -- --replay docs/eval/results/local/<run>      score a kept run again, for nothing
 *   pnpm eval -- --replay <run> --grades <run>/grades.csv    with the grades the owner confirmed
 *
 * A live run writes to `docs/eval/results/local/<date>-<who>-<model>/`, which git ignores. The
 * owner reads it, confirms the grades, and moves what is kept up to `docs/eval/results/`. The key
 * is read from the environment and only ever sent in one header; nothing here writes or prints it.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { parseRows, type EvalProduction, type EvalRow } from '../eval.ts';
import { httpTransport } from '../http-transport.ts';
import type { Recording } from '../recording.ts';
import { startFakeClaude } from '../server.ts';
import { scoreRow } from './checks.ts';
import { gradesCsv, judge, liveTransport, passesWhen, type Grade } from './live.ts';
import {
  readGrades,
  resultsCsv,
  summarise,
  usageCsv,
  withGrades,
  type RowResult,
} from './report.ts';
import { pilotRows, recordingOf, runRow, type RowRun } from './run.ts';

const root = join(import.meta.dirname, '..', '..', '..', '..');
const docs = join(root, 'docs', 'eval');
const read = (...p: string[]) => readFileSync(join(...p), 'utf8');

// pnpm passes its own `--` through; everything after it is ours.
const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    live: { type: 'boolean', default: false },
    replay: { type: 'string' },
    pilot: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
    rows: { type: 'string' },
    judge: { type: 'boolean', default: false },
    grades: { type: 'string' },
    who: { type: 'string', default: 'owner' },
    out: { type: 'string' },
  },
});

const rows = parseRows(read(docs, 'requests.jsonl'));
const starts: Record<string, EvalProduction> = Object.fromEntries(
  readdirSync(join(docs, 'productions')).map((f) => [
    f.replace(/\.json$/, ''),
    JSON.parse(read(docs, 'productions', f)) as EvalProduction,
  ]),
);

function chosen(): EvalRow[] {
  if (values.rows) {
    const ids = values.rows.split(',').map((s) => s.trim());
    const missing = ids.filter((id) => !rows.some((r) => r.id === id));
    if (missing.length) throw new Error(`No rows ${missing.join(', ')}.`);
    return rows.filter((r) => ids.includes(r.id));
  }
  if (values.all) return rows;
  if (values.pilot) return pilotRows(rows);
  throw new Error('Say which rows: --pilot, --all or --rows id,id.');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const busy = (run: RowRun) =>
  run.streams.some((s) =>
    s.some((e) => e.type === 'error' && (e.code === 'overloaded' || e.code === 'rate_limited')),
  );

async function main(): Promise<void> {
  const list = chosen();
  const key = process.env.ANTHROPIC_API_KEY ?? '';
  if (values.live === Boolean(values.replay)) throw new Error('Say --live or --replay <run>.');

  const runs: RowRun[] = [];
  if (values.live) {
    const transport = liveTransport(key);
    for (const row of list) {
      process.stdout.write(`${row.id} … `);
      let run = await runRow(row, starts[row.start]!, transport);
      // Once, after a pause, if the API was busy: a busy server isn't the Prompter's fault.
      if (busy(run)) {
        await sleep(30_000);
        run = await runRow(row, starts[row.start]!, transport);
      }
      runs.push(run);
      console.log(`${run.phase}, ${run.usage.requests} turn(s)`);
    }
  } else {
    const server = await startFakeClaude();
    try {
      for (const row of list) {
        const file = join(values.replay!, 'recordings', `${row.id}.json`);
        server.use(JSON.parse(read(file)) as Recording);
        runs.push(await runRow(row, starts[row.start]!, httpTransport(server.url)));
      }
    } finally {
      await server.close();
    }
  }

  let results: RowResult[] = runs.map((run) => ({
    row: run.row,
    scores: scoreRow(run),
    usage: run.usage,
  }));

  const date = new Date().toISOString().slice(0, 10);
  const out =
    values.out ??
    values.replay ??
    join(docs, 'results', 'local', `${date}-${values.who}-claude-opus-5-5`);
  mkdirSync(join(out, 'recordings'), { recursive: true });

  if (values.live) {
    for (const run of runs)
      writeFileSync(
        join(out, 'recordings', `${run.row.id}.json`),
        `${JSON.stringify(recordingOf(run), null, 2)}\n`,
      );
    if (values.judge) {
      const rules = passesWhen(read(docs, 'README.md'));
      const graded: { row: EvalRow; grades: Grade[] }[] = [];
      for (const run of runs) {
        try {
          graded.push({ row: run.row, grades: await judge(run, rules, key) });
        } catch (e) {
          console.log(`${run.row.id}: not graded (${(e as Error).message})`);
        }
      }
      writeFileSync(join(out, 'grades.proposed.csv'), gradesCsv(graded));
      console.log(
        "The judge's grades are in grades.proposed.csv. Confirm or change them, save as grades.csv, then replay with --grades.",
      );
    }
  }
  if (values.grades) results = withGrades(results, readGrades(read(values.grades)));

  const kind = values.live ? 'live' : 'recorded';
  writeFileSync(join(out, 'results.csv'), resultsCsv(results));
  writeFileSync(join(out, 'usage.csv'), usageCsv(results));
  const s = summarise(results, kind);
  const tokens = runs.reduce(
    (t, r) => ({
      input: t.input + r.usage.inputTokens,
      output: t.output + r.usage.outputTokens,
      cached: t.cached + r.usage.cacheReadTokens,
    }),
    { input: 0, output: 0, cached: 0 },
  );
  console.log(
    [
      `${runs.length} rows, ${kind}. Written to ${out}.`,
      `Score: ${s.passed} of ${s.scored} checks (${(s.score * 100).toFixed(1)}%), ${s.waiting} reply checks waiting for a grade.`,
      ...Object.entries(s.byCategory).map(([c, v]) => `  ${c}: ${v.passed} of ${v.scored}`),
      s.forbidden.length ? `Failures where none are allowed: ${s.forbidden.join(', ')}` : '',
      s.injectionFailures.length
        ? `Injection failures (safety bugs): ${s.injectionFailures.join(', ')}`
        : '',
      `Bar (${kind}): ${s.meetsBar === null ? 'not decided while checks wait' : s.meetsBar ? 'met' : 'not met'}.`,
      `Tokens: ${tokens.input} input, ${tokens.cached} read from the cache, ${tokens.output} output.`,
    ]
      .filter(Boolean)
      .join('\n'),
  );
}

await main().catch((e: Error) => {
  // The message only: nothing here holds the key, but a stack trace isn't needed either.
  console.error(e.message);
  process.exitCode = 1;
});
