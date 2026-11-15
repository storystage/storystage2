/**
 * Settings › Report a problem (WP18.5; `website/feedback.md`): makes a report of this device for
 * the feedback email, with the versions, what the device can do, the settings in force, the
 * self-test, and the problems since StoryStage started (`@storystage/diagnostics`). It leaves out
 * the Claude key, pupils' names and films, and nothing is sent: the report is shown in full, to
 * read first, then copied, or saved as a file in the browser version.
 *
 * Saving it as a file in the apps waits on the host's picker saving text files (S8): the apps
 * offer Copy for now.
 */
import { problemLog, problemReport, reportName, type Environment } from '@storystage/diagnostics';
import type { HostInterface } from '@storystage/host';
import type { SelfTestRuntime } from '@storystage/selftest';
import { Button } from '@storystage/ui';
import { useRef, useState } from 'react';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import { SELFTEST_STEPS, runStudioSelfTest } from './selfTestRun.ts';

export interface ReportProblemCardProps {
  readonly host: Pick<HostInterface, 'policy' | 'version' | 'classes'>;
  readonly models: Pick<ModelSourceHandle, 'source' | 'item'>;
  /** Tests give a `FakeStage` and an in-memory runtime. */
  readonly makeStage?: StageMaker;
  readonly startRuntime?: () => SelfTestRuntime;
  /** Tests give a fixed time. */
  readonly now?: () => Date;
}

/** What this device can do, as the studio finds it. */
function environment(): Environment {
  const webgl2 = (() => {
    try {
      return document.createElement('canvas').getContext('webgl2') !== null;
    } catch {
      return false;
    }
  })();
  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    screen: {
      width: window.screen?.width ?? 0,
      height: window.screen?.height ?? 0,
      scale: window.devicePixelRatio ?? 1,
    },
    crossOriginIsolated: globalThis.crossOriginIsolated === true,
    webgl2,
    webgpu: 'gpu' in navigator,
    encoder: typeof (globalThis as { VideoEncoder?: unknown }).VideoEncoder === 'function',
    timings: timings(),
  };
}

/** Start-up and memory, as CI's performance test measures them (WP18.3). */
function timings(): NonNullable<Environment['timings']> {
  const round = (ms: number | undefined) => (ms === undefined ? null : Math.round(ms));
  const paint = performance.getEntriesByType?.('paint').find((e) => e.name === 'first-paint');
  const navigation = performance.getEntriesByType?.('navigation')[0] as
    PerformanceNavigationTiming | undefined;
  const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return {
    firstPaintMs: round(paint?.startTime),
    interactiveMs: round(navigation?.domInteractive),
    heapMb: memory ? Math.round(memory.usedJSHeapSize / 1e6) : null,
  };
}

export function ReportProblemCard({
  host,
  models,
  makeStage,
  startRuntime,
  now = () => new Date(),
}: ReportProblemCardProps) {
  const [checked, setChecked] = useState<number | null>(null);
  const [report, setReport] = useState<{ text: string; name: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const busy = useRef(false);

  const make = async () => {
    if (busy.current) return;
    busy.current = true;
    setReport(null);
    setNote(null);
    setChecked(0);
    try {
      // The report's own code is small and already loaded with the problem log (main.tsx).
      const selftest = await runStudioSelfTest({
        models,
        ...(makeStage ? { makeStage } : {}),
        ...(startRuntime ? { startRuntime } : {}),
        onStep: () => setChecked((n) => (n ?? 0) + 1),
      });
      // Pupils' names, to take out wherever they appear; none when there's no class list.
      const names = await host.classes.pupils().then(
        (pupils) => pupils.map((p) => p.name),
        () => [],
      );
      const when = now().toISOString();
      setReport({
        text: problemReport({
          when,
          version: host.version,
          environment: environment(),
          policy: host.policy,
          selftest: selftest.text,
          problems: problemLog()?.lines() ?? null,
          names,
        }),
        name: reportName(when),
      });
    } finally {
      busy.current = false;
      setChecked(null);
    }
  };

  const copy = async () => {
    if (!report) return;
    try {
      await navigator.clipboard.writeText(report.text);
      setNote(words.t('problem.copied'));
    } catch {
      setNote(words.t('problem.copyFailed'));
    }
  };

  const save = () => {
    if (!report) return;
    const url = URL.createObjectURL(new Blob([report.text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = report.name;
    // In the page while it's clicked, as Safari wants.
    link.hidden = true;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    setNote(words.t('problem.saved', { name: report.name }));
  };

  const making = checked !== null;
  return (
    <div className="st-page">
      <section className="st-card st-problem" aria-labelledby="st-problem-title">
        <h2 id="st-problem-title" className="st-card-title">
          {words.t('problem.title')}
        </h2>
        <p className="st-note">{words.t('problem.help')}</p>
        <Button onPress={() => void make()} isDisabled={making}>
          {words.t('problem.make')}
        </Button>
        <p role="status" className="st-note">
          {making
            ? words.t('problem.making', { done: checked, total: SELFTEST_STEPS })
            : (note ?? (report ? words.t('problem.ready') : ''))}
        </p>
        {report && (
          <>
            <pre className="st-selftest-report" aria-label={words.t('problem.report')} tabIndex={0}>
              {report.text}
            </pre>
            <div className="st-problem-actions">
              <Button onPress={() => void copy()}>{words.t('problem.copy')}</Button>
              {host.version === null ? (
                <Button variant="secondary" onPress={save}>
                  {words.t('problem.save')}
                </Button>
              ) : null}
            </div>
            <p className="st-note">{words.t('problem.film')}</p>
          </>
        )}
      </section>
    </div>
  );
}
