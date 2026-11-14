/**
 * The self-test's report in plain words: shown in the app, attached by "Report a problem"
 * (WP18.5), and printed in CI. The last line is `SELFTEST PASS` or `SELFTEST FAIL`, as in
 * StoryStage 1, so scripts can read it.
 */
import type { SelfTestReport } from './runner.ts';
import { t } from './strings.ts';

const MARK = { pass: '✓', fail: '✗', notReady: '–' } as const;

export function reportText(report: SelfTestReport): string {
  const passed = report.results.filter((r) => r.status === 'pass').length;
  const failed = report.results.filter((r) => r.status === 'fail').length;
  const notReady = report.results.filter((r) => r.status === 'notReady').length;
  const summary = [
    t('report.passed', { passed, total: report.results.length }),
    failed ? t('report.failed', { count: failed }) : null,
    notReady ? t('report.notReady', { count: notReady }) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const lines = [
    t('report.heading', { when: report.startedAt }),
    t('report.took', { summary, seconds: (report.ms / 1000).toFixed(1) }),
    '',
  ];
  for (const r of report.results) {
    lines.push(`${MARK[r.status]} ${r.title}${r.status === 'notReady' ? '' : ` (${r.ms} ms)`}`);
    if (r.detail)
      lines.push(
        `    ${t(r.status === 'notReady' ? 'report.notReadyYet' : 'report.problem', { detail: r.detail })}`,
      );
    if (r.standIn) lines.push(`    ${t('report.forNow', { note: r.standIn })}`);
  }
  lines.push('', report.passed ? 'SELFTEST PASS' : 'SELFTEST FAIL');
  return lines.join('\n');
}
