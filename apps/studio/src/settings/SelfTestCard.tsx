/**
 * Settings › Self-test (WP18.1): checks that StoryStage works on this device, with the same
 * steps CI runs (`@storystage/selftest`), on the real stage, runtime and export. Every manual
 * test script and device run ends with it (`docs/test/README.md`), recording its last line,
 * `SELFTEST PASS` or `SELFTEST FAIL`. Nothing leaves the device; the report is shown to copy.
 *
 * The self-test, Babylon.js and the export load only when it runs.
 */
import { useRef, useState } from 'react';
import type { Production } from '@storystage/production';
import type { SelfTestRuntime, StepResult } from '@storystage/selftest';
import { Button } from '@storystage/ui';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import { runStudioSelfTest } from './selfTestRun.ts';

const STATUS_WORD = {
  pass: 'selftest.pass',
  fail: 'selftest.fail',
  notReady: 'selftest.notReady',
} as const satisfies Record<StepResult['status'], string>;

export interface SelfTestCardProps {
  readonly models: Pick<ModelSourceHandle, 'source' | 'item'>;
  /** Tests give a stage maker that makes a `FakeStage`, and an in-memory runtime: then no MP4 is made. */
  readonly makeStage?: StageMaker;
  readonly startRuntime?: () => SelfTestRuntime;
  /** The film open in the studio, if any: its scene state is checked on every renderer too. */
  readonly film?: () => Production | null;
}

export function SelfTestCard({ models, makeStage, startRuntime, film }: SelfTestCardProps) {
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
      setReport(
        await runStudioSelfTest({
          models,
          ...(makeStage ? { makeStage } : {}),
          ...(startRuntime ? { startRuntime } : {}),
          ...(film ? { film } : {}),
          onStep: (r) => setResults((done) => [...done, r]),
        }),
      );
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
