/**
 * Settings › Self-test (WP18.1): checks that StoryStage works on this device, with the same
 * steps CI runs (`@storystage/selftest`), on the real stage, runtime and export. Every manual
 * test script and device run ends with it (`docs/test/README.md`), recording its last line,
 * `SELFTEST PASS` or `SELFTEST FAIL`. Nothing leaves the device; the report is shown to copy.
 *
 * The self-test, Babylon.js and the export load only when it runs.
 */
import { useRef, useState } from 'react';
import type { SelfTestRuntime, StepResult } from '@storystage/selftest';
import { micros } from '@storystage/story-api';
import { Button } from '@storystage/ui';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';

const STATUS_WORD = {
  pass: 'selftest.pass',
  fail: 'selftest.fail',
  notReady: 'selftest.notReady',
} as const satisfies Record<StepResult['status'], string>;

/** The same seed as the Screening room's export, so a film plays the same in both. */
const SEED = 1;

export interface SelfTestCardProps {
  readonly models: Pick<ModelSourceHandle, 'source' | 'item'>;
  /** Tests give a stage maker that makes a `FakeStage`, and an in-memory runtime: then no MP4 is made. */
  readonly makeStage?: StageMaker;
  readonly startRuntime?: () => SelfTestRuntime;
}

export function SelfTestCard({ models, makeStage, startRuntime }: SelfTestCardProps) {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<readonly StepResult[]>([]);
  const [report, setReport] = useState<{ text: string; passed: boolean } | null>(null);
  const busy = useRef(false);

  const run = async () => {
    if (busy.current) return;
    busy.current = true;
    setRunning(true);
    setResults([]);
    setReport(null);
    try {
      const [selftest, stages, { startRuntimeWorker }, { exportFilm }] = await Promise.all([
        import('@storystage/selftest'),
        import('../stage/makeStage.ts'),
        import('@storystage/playback'),
        import('@storystage/export'),
      ]);
      const make = makeStage ?? stages.makeStage;
      const stage = () => make(stages.hiddenCanvas(), { hidden: true, models: models.source });
      // An MP4 only where this browser can encode one; the step says so otherwise.
      const canEncode =
        typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'function';
      const outcome = await selftest.runSelfTest(
        selftest.STEPS,
        {
          makeStage: stage,
          startRuntime: startRuntime ?? startRuntimeWorker,
          ...(canEncode && !makeStage
            ? {
                exportFive: async (production) => {
                  const hidden = await stage();
                  try {
                    const film = await exportFilm({
                      production,
                      find: models.item,
                      stage: hidden,
                      startWorker: startRuntimeWorker,
                      seed: SEED,
                      titleCard: false,
                      limit: micros(5),
                    });
                    return film.mp4;
                  } finally {
                    hidden.dispose();
                  }
                },
              }
            : {}),
        },
        { timeLimitMs: 120_000, onStep: (r) => setResults((done) => [...done, r]) },
      );
      setReport({ text: selftest.reportText(outcome), passed: outcome.passed });
    } catch (e) {
      // The self-test itself couldn't start: say so, as a failed run.
      const why = e instanceof Error ? e.message : String(e);
      setReport({
        text: `${words.t('selftest.couldNotStart', { why })}\n\nSELFTEST FAIL`,
        passed: false,
      });
    } finally {
      busy.current = false;
      setRunning(false);
    }
  };

  return (
    <div className="st-page">
      <section className="st-card st-selftest" aria-labelledby="st-selftest-title">
        <h2 id="st-selftest-title" className="st-card-title">
          {words.t('selftest.title')}
        </h2>
        <p className="st-note">{words.t('selftest.help')}</p>
        <Button onPress={() => void run()} isDisabled={running}>
          {running ? words.t('selftest.running') : words.t('selftest.run')}
        </Button>
        {results.length > 0 && (
          <ol className="st-selftest-steps" aria-label={words.t('selftest.steps')}>
            {results.map((r) => (
              <li key={r.id} data-status={r.status}>
                <span>{r.title}</span>
                {': '}
                <strong>{words.t(STATUS_WORD[r.status])}</strong>
                {r.detail && r.status !== 'pass' ? <span>{` ${r.detail}`}</span> : null}
              </li>
            ))}
          </ol>
        )}
        <p role="status" className="st-selftest-result">
          {report ? (report.passed ? 'SELFTEST PASS' : 'SELFTEST FAIL') : ''}
        </p>
        {report && (
          <>
            <p className="st-note">{words.t('selftest.copy')}</p>
            <pre
              className="st-selftest-report"
              aria-label={words.t('selftest.report')}
              tabIndex={0}
            >
              {report.text}
            </pre>
          </>
        )}
      </section>
    </div>
  );
}
