/**
 * The self-test's report in plain words: shown in the app, attached by "Report a problem"
 * (WP18.5), and printed in CI. The last line is `SELFTEST PASS` or `SELFTEST FAIL`, as in
 * StoryStage 1, so scripts can read it.
 */
import type { SelfTestReport } from './runner.ts';

const MARK = { pass: '✓', fail: '✗', notReady: '–' } as const;

export function reportText(report: SelfTestReport): string {
  const passed = report.results.filter((r) => r.status === 'pass').length;
  const failed = report.results.filter((r) => r.status === 'fail').length;
  const notReady = report.results.filter((r) => r.status === 'notReady').length;
  const summary = [
    `${passed} of ${report.results.length} checks passed`,
    failed ? `${failed} failed` : null,
    notReady ? `${notReady} not ready yet` : null,
  ]
    .filter(Boolean)
    .join(', ');
  const lines = [
    `StoryStage self-test, ${report.startedAt}`,
    `${summary} (${(report.ms / 1000).toFixed(1)} s).`,
    '',
  ];
  for (const r of report.results) {
    lines.push(`${MARK[r.status]} ${r.title}${r.status === 'notReady' ? '' : ` (${r.ms} ms)`}`);
    if (r.detail)
      lines.push(`    ${r.status === 'notReady' ? 'Not ready yet' : 'Problem'}: ${r.detail}`);
    if (r.standIn) lines.push(`    For now: ${r.standIn}`);
  }
  lines.push('', report.passed ? 'SELFTEST PASS' : 'SELFTEST FAIL');
  return lines.join('\n');
}
