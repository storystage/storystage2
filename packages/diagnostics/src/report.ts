/**
 * The problem report (WP18.5): plain text a teacher can read, word for word, before attaching it
 * to the feedback email (`website/feedback.md`). The versions, what this device can do, the
 * settings in force, the self-test's report, and the recent problems; then scrubbed as a whole,
 * pupils' names included. It never holds a key, a name or a film.
 */
import type { PolicyInForce } from '@storystage/host';
import type { LogLine } from './log.ts';
import { scrub } from './scrub.ts';
import { t } from './strings.ts';

/** What this device can do, as the studio found it. */
export interface Environment {
  readonly userAgent: string;
  readonly language: string;
  readonly screen: { readonly width: number; readonly height: number; readonly scale: number };
  readonly crossOriginIsolated: boolean;
  readonly webgl2: boolean;
  readonly webgpu: boolean;
  /** WebCodecs' video encoder is there. */
  readonly encoder: boolean;
}

export interface ReportInput {
  /** When it was made, as an ISO time. */
  readonly when: string;
  /** The installed version in the apps; `null` in the browser version. */
  readonly version: string | null;
  /** The build it came from, if the build says. */
  readonly build?: string | null;
  readonly environment: Environment;
  readonly policy: PolicyInForce;
  /** The self-test's plain report (`reportText`), or `null` if it wasn't run. */
  readonly selftest: string | null;
  /** The recent problems, or `null` if none were being kept. */
  readonly problems: readonly LogLine[] | null;
  /** The class's pupils' names, to take out wherever they appear. */
  readonly names?: readonly string[];
}

const yes = (b: boolean) => t(b ? 'report.yes' : 'report.no');
const section = (title: string) => ['', `== ${title} ==`];

/** The settings in force, one line each, as plain as the policy file's keys. */
function policyLines(p: PolicyInForce): string[] {
  return [
    t('report.policySource', { source: p.source + (p.trusted ? '' : ' (narrowing only)') }),
    t('report.policySet', { keys: p.set.length ? p.set.join(', ') : t('report.policyNone') }),
    `prompter.level: ${p.prompter.level}`,
    `prompter.voiceInput: ${p.prompter.voiceInput}`,
    `prompter.dailyCap: ${p.prompter.dailyCap ?? 'none'} (${p.prompter.capAction})`,
    `speech.dictation: ${p.speech.dictation}`,
    `editor.default: ${p.editor.default}${p.editor.locked ? ' (locked)' : ''}`,
    `storyboard.allowImportedWithoutStoryboard: ${p.storyboard.allowImportedWithoutStoryboard}`,
    `backstage.import: ${p.backstage.import}, backstage.search: ${p.backstage.search}`,
    `study.enabled: ${p.study.enabled}`,
    `update.channel: ${p.update.channel}${p.update.pin ? `, pinned to ${p.update.pin}` : ''}`,
    ...(p.diagnostic ? [`policy file: ${p.diagnostic}`] : []),
  ];
}

export function problemReport(input: ReportInput): string {
  const e = input.environment;
  const lines = [
    t('report.title', { when: input.when }),
    t('report.intro'),
    ...section(t('report.versions')),
    t('report.app', { version: input.version ?? t('report.browserVersion') }),
    ...(input.build ? [t('report.build', { build: input.build })] : []),
    t('report.browser', { agent: e.userAgent }),
    t('report.language', { language: e.language }),
    t('report.screen', { width: e.screen.width, height: e.screen.height, scale: e.screen.scale }),
    t('report.isolated', { yes: yes(e.crossOriginIsolated) }),
    t('report.webgl2', { yes: yes(e.webgl2) }),
    t('report.webgpu', { yes: yes(e.webgpu) }),
    t('report.encoder', { yes: yes(e.encoder) }),
    ...section(t('report.settings')),
    ...policyLines(input.policy),
    ...section(t('report.selftest')),
    input.selftest ?? t('report.selftestNotRun'),
    ...section(t('report.problems')),
    ...(input.problems === null
      ? [t('report.notKept')]
      : input.problems.length === 0
        ? [t('report.noProblems')]
        : [
            t('report.problemsShown', { count: input.problems.length }),
            ...input.problems.map((l) => `${l.at} s, ${l.kind}: ${l.text}`),
          ]),
    '',
  ];
  return scrub(lines.join('\n'), input.names ?? []);
}

/** The report's file name: the date, and nothing about who made it. */
export const reportName = (when: string) => `StoryStage problem report ${when.slice(0, 10)}.txt`;
