/**
 * @storystage/diagnostics: Report a problem (WP18.5).
 *
 * Owner: S1. `startProblemLog` keeps the studio's recent problems from start-up, scrubbed;
 * `problemReport` makes the plain-text report a teacher reads and attaches to the feedback
 * email; `scrub` takes out keys, email addresses, user names in paths and pupils' names.
 * Nothing here sends anything anywhere.
 */
export {
  LINE_LENGTH,
  LOG_LINES,
  ProblemLog,
  problemLog,
  startProblemLog,
  stopProblemLog,
  type LogLine,
  type LogScope,
} from './log.ts';
export { problemReport, reportName, type Environment, type ReportInput } from './report.ts';
export { scrub } from './scrub.ts';
