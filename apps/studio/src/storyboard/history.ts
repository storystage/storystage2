/**
 * The Storyboard's undo history (`docs/spec/07-ux.md` section 6.8). Each step is named after what
 * changed, and holds the production before and after it; productions are immutable, so holding
 * both is cheap. When the production's own undo arrives (WP8.2), these steps join it.
 */

export interface Step<T> {
  /** The learner's words for the step, also its undo label: "Write logline". */
  readonly label: string;
  readonly before: T;
  readonly after: T;
}

export interface History<T> {
  readonly present: T;
  readonly past: readonly Step<T>[];
  readonly future: readonly Step<T>[];
  /**
   * Typing into one field is one step until the learner leaves it: while `open` matches the
   * key of the next change, that change joins the last step instead of making a new one.
   */
  readonly open: string | null;
}

/** The most steps the history keeps. */
export const HISTORY_LIMIT = 100;

export const startHistory = <T>(present: T): History<T> => ({
  present,
  past: [],
  future: [],
  open: null,
});

/**
 * Records a change. With `key`, changes with the same key join one step until `seal` (the learner
 * left the field) or a different change comes between.
 */
export function commit<T>(h: History<T>, label: string, next: T, key?: string): History<T> {
  if (next === h.present) return h;
  const last = h.past[h.past.length - 1];
  if (key !== undefined && h.open === key && last) {
    return {
      present: next,
      past: [...h.past.slice(0, -1), { label, before: last.before, after: next }],
      future: [],
      open: key,
    };
  }
  const past = [...h.past, { label, before: h.present, after: next }];
  return {
    present: next,
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [],
    open: key ?? null,
  };
}

/** The learner left the field: the next change starts a new step. */
export const seal = <T>(h: History<T>): History<T> => (h.open === null ? h : { ...h, open: null });

export function undo<T>(h: History<T>): History<T> {
  const step = h.past[h.past.length - 1];
  if (!step) return h;
  return {
    present: step.before,
    past: h.past.slice(0, -1),
    future: [step, ...h.future],
    open: null,
  };
}

export function redo<T>(h: History<T>): History<T> {
  const step = h.future[0];
  if (!step) return h;
  return { present: step.after, past: [...h.past, step], future: h.future.slice(1), open: null };
}

/** What undo and redo would do now, for their buttons. */
export const nextUndo = <T>(h: History<T>): string | null =>
  h.past[h.past.length - 1]?.label ?? null;
export const nextRedo = <T>(h: History<T>): string | null => h.future[0]?.label ?? null;

export type HistoryAction<T> =
  | { readonly type: 'commit'; readonly label: string; readonly next: T; readonly key?: string }
  | { readonly type: 'seal' }
  | { readonly type: 'undo' }
  | { readonly type: 'redo' }
  | { readonly type: 'replace'; readonly present: T };

/** For `useReducer`. `replace` starts a fresh history, as opening another production will. */
export function historyReducer<T>(h: History<T>, action: HistoryAction<T>): History<T> {
  switch (action.type) {
    case 'commit':
      return commit(h, action.label, action.next, action.key);
    case 'seal':
      return seal(h);
    case 'undo':
      return undo(h);
    case 'redo':
      return redo(h);
    case 'replace':
      return startHistory(action.present);
  }
}
