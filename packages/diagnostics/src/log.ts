/**
 * The studio's recent problems, for Report a problem (WP18.5): what went to `console.error` and
 * `console.warn`, and errors nothing caught, since StoryStage started. Kept in memory only, the
 * newest 200, each line cut to 500 characters and scrubbed as it's kept. Nothing is written to
 * the device or sent anywhere.
 */
import { scrub } from './scrub.ts';

export const LOG_LINES = 200;
export const LINE_LENGTH = 500;

export interface LogLine {
  /** Seconds since the log started. */
  readonly at: number;
  readonly kind: 'error' | 'warning';
  readonly text: string;
}

/** What `startProblemLog` watches: `window` and `console` in the studio, fakes in tests. */
export interface LogScope {
  readonly console: Pick<Console, 'error' | 'warn'>;
  addEventListener(type: 'error' | 'unhandledrejection', listener: (e: unknown) => void): void;
  removeEventListener(type: 'error' | 'unhandledrejection', listener: (e: unknown) => void): void;
}

const words = (value: unknown): string => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
};

export class ProblemLog {
  readonly #lines: LogLine[] = [];
  readonly #started: number;
  readonly #now: () => number;

  constructor(now: () => number = () => performance.now()) {
    this.#now = now;
    this.#started = now();
  }

  /** Keeps one line, scrubbed and cut to length; the oldest goes once there are 200. */
  add(kind: LogLine['kind'], parts: readonly unknown[]): void {
    const text = scrub(parts.map(words).join(' ')).replace(/\s+/g, ' ').trim();
    this.#lines.push({
      at: Math.round((this.#now() - this.#started) / 100) / 10,
      kind,
      text: text.length > LINE_LENGTH ? `${text.slice(0, LINE_LENGTH - 1)}…` : text,
    });
    if (this.#lines.length > LOG_LINES) this.#lines.shift();
  }

  lines(): readonly LogLine[] {
    return [...this.#lines];
  }
}

/** The studio's log, once `startProblemLog` has run. */
let started: { log: ProblemLog; stop: () => void } | null = null;

/**
 * Starts keeping the studio's problems, once, as early as possible: `main.tsx` calls it before
 * the studio draws. The console still shows everything as before.
 */
export function startProblemLog(scope: LogScope = globalThis as unknown as LogScope): ProblemLog {
  if (started) return started.log;
  const log = new ProblemLog();
  const { error, warn } = scope.console;
  const c = scope.console as { error: Console['error']; warn: Console['warn'] };
  c.error = (...parts: unknown[]) => {
    log.add('error', parts);
    error.apply(scope.console, parts);
  };
  c.warn = (...parts: unknown[]) => {
    log.add('warning', parts);
    warn.apply(scope.console, parts);
  };
  const onError = (e: unknown) => {
    const event = e as { message?: string; error?: unknown };
    log.add('error', [event.error ?? event.message ?? 'An error nothing caught']);
  };
  const onRejection = (e: unknown) =>
    log.add('error', [(e as { reason?: unknown }).reason ?? 'A promise nothing caught']);
  scope.addEventListener('error', onError);
  scope.addEventListener('unhandledrejection', onRejection);
  started = {
    log,
    stop: () => {
      c.error = error;
      c.warn = warn;
      scope.removeEventListener('error', onError);
      scope.removeEventListener('unhandledrejection', onRejection);
      started = null;
    },
  };
  return log;
}

/** The studio's log, or `null` if it was never started (tests, the component page). */
export const problemLog = (): ProblemLog | null => started?.log ?? null;

/** For tests: puts `console` and the listeners back as they were. */
export function stopProblemLog(): void {
  started?.stop();
}
