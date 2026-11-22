/**
 * Where the App keeps the export that's running (spec 08 section 4; S5's review of #317). The
 * Screening tab starts it, but it lives above the tabs, so **Keep working** means the whole
 * studio: the learner can go back to the Storyboard while it exports. The App stops it when the
 * studio closes. This holds no screening code, so the Screening tab stays a chunk of its own.
 */

/** What the App needs from an export: where it is, and Stop. */
export interface RunningExport {
  readonly state: { readonly kind: string };
  subscribe(listener: () => void): () => void;
  stop(): void;
}

export interface ExportSlot<T extends RunningExport = RunningExport> {
  get(): T | null;
  /** Keeps `job` and gives it back. */
  put(job: T): T;
  /** Tells `listener` when the export changes, or a new one starts. */
  subscribe(listener: () => void): () => void;
}

export function exportSlot<T extends RunningExport = RunningExport>(): ExportSlot<T> {
  let job: T | null = null;
  let unhook = () => {};
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  return {
    get: () => job,
    put(next) {
      unhook();
      job = next;
      unhook = next.subscribe(notify);
      notify();
      return next;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}
