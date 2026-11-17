/**
 * Where the learner was, handed from one code editor to the other on a switch (`14-editors.md`
 * section 4.2): the open method, the chosen statements and focus. Only a switch hands it on. An
 * editor also closes when its method or the text size changes, and then the next one opens as
 * it would anyway.
 */
import type { ViewState } from '@storystage/editor-contract';
import { useMemo } from 'react';

export interface Handoff {
  /** The editor closing gives where the learner was (its `unmount`). */
  leave(view: ViewState): void;
  /** The editor opening takes it, once, if the learner has just switched; otherwise null. */
  take(): ViewState | null;
  /** The learner is switching: the next `leave` is kept for the next `take`. */
  switching(): void;
}

export function handoff(): Handoff {
  let switching = false;
  let kept: ViewState | null = null;
  return {
    leave(view) {
      if (switching) kept = view;
      switching = false;
    },
    take() {
      const view = kept;
      // Kept for a frame, not given once: React's development mode mounts an editor twice.
      if (view)
        requestAnimationFrame(() => {
          if (kept === view) kept = null;
        });
      return view;
    },
    switching() {
      switching = true;
      kept = null;
    },
  };
}

export const useHandoff = (): Handoff => useMemo(() => handoff(), []);
