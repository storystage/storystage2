/**
 * The self-test runner (WP18.1). It runs each step in turn with a time limit, never throws, and
 * records whether the step passed, failed or isn't ready yet. The same runner is used from the
 * studio's menu item, in CI (`selftest.test.ts`), and inside each app build (WP18b).
 */

export type StepStatus = 'pass' | 'fail' | 'notReady';

export interface SelfTestStep<C> {
  readonly id: string;
  /** What the step checks, in plain words a teacher understands ("Rehearse each scene"). */
  readonly title: string;
  /** Set while the part it checks hasn't been built: the step is reported, not run. */
  readonly notReady?: string;
  /**
   * Runs the step. Throw `SelfTestFailure` (or anything) to fail. May return a note on what
   * the step stood in for, until the real part exists.
   */
  run(context: C): Promise<{ readonly standIn?: string } | void>;
}

export interface StepResult {
  readonly id: string;
  readonly title: string;
  readonly status: StepStatus;
  readonly ms: number;
  /** Why it failed or isn't ready, in plain words. */
  readonly detail: string | null;
  /** What the step stood in for, if anything. */
  readonly standIn: string | null;
}

export interface SelfTestReport {
  /** True when nothing failed. Steps that aren't ready don't count against it. */
  readonly passed: boolean;
  readonly startedAt: string;
  readonly ms: number;
  readonly results: readonly StepResult[];
}

/** A failure with a message for the report, in plain words. */
export class SelfTestFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SelfTestFailure';
  }
}

/** Fails the step with `message` unless `condition` holds. */
export function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SelfTestFailure(message);
}

export interface RunOptions {
  /** Per step. Default 30 seconds. */
  readonly timeLimitMs?: number;
  /** Called as each step finishes, for a progress display. */
  readonly onStep?: (result: StepResult) => void;
}

export async function runSelfTest<C>(
  steps: readonly SelfTestStep<C>[],
  context: C,
  options: RunOptions = {},
): Promise<SelfTestReport> {
  const limit = options.timeLimitMs ?? 30_000;
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const results: StepResult[] = [];
  for (const step of steps) {
    const t0 = performance.now();
    let result: StepResult;
    if (step.notReady) {
      result = {
        id: step.id,
        title: step.title,
        status: 'notReady',
        ms: 0,
        detail: step.notReady,
        standIn: null,
      };
    } else {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([
          step.run(context),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new SelfTestFailure(
                    `This took longer than ${limit >= 1000 ? `${Math.round(limit / 1000)} seconds` : `${limit} milliseconds`}.`,
                  ),
                ),
              limit,
            );
          }),
        ]);
        result = {
          id: step.id,
          title: step.title,
          status: 'pass',
          ms: elapsed(t0),
          detail: null,
          standIn: outcome?.standIn ?? null,
        };
      } catch (e) {
        const detail =
          e instanceof SelfTestFailure
            ? e.message
            : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;
        result = {
          id: step.id,
          title: step.title,
          status: 'fail',
          ms: elapsed(t0),
          detail,
          standIn: null,
        };
      } finally {
        clearTimeout(timer);
      }
    }
    results.push(result);
    options.onStep?.(result);
  }
  return {
    passed: results.every((r) => r.status !== 'fail'),
    startedAt,
    ms: elapsed(started),
    results,
  };
}

const elapsed = (t0: number) => Math.round(performance.now() - t0);
