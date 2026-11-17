/**
 * Which code editor shows, Blocks or Tiles (`14-editors.md` section 4.3; WP7.11): the learner's
 * last choice, kept on this device, and whether the first switch has been explained (4.4). Before
 * a choice, the class default from policy opens; when the teacher locks it, always the default.
 */
import { EDITOR_IDS, type EditorId } from '@storystage/editor-contract';
import { useSyncExternalStore } from 'react';

const KEY = 'storystage.codeEditor';

export interface EditorChoice {
  /** The learner's choice, or null before they've made one. */
  readonly chosen: EditorId | null;
  /** "Don't explain this again" was ticked in the first switch's dialog. */
  readonly explained: boolean;
}

const NONE: EditorChoice = { chosen: null, explained: false };

function read(): EditorChoice {
  try {
    const kept = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as unknown;
    if (typeof kept !== 'object' || kept === null) return NONE;
    const { chosen, explained } = kept as Partial<Record<keyof EditorChoice, unknown>>;
    return {
      chosen: EDITOR_IDS.includes(chosen as EditorId) ? (chosen as EditorId) : null,
      explained: explained === true,
    };
  } catch {
    return NONE;
  }
}

/** The choice on this device, read once, then kept in step with `set`. */
export const editorSetting = (() => {
  const listeners = new Set<() => void>();
  let current: EditorChoice | null = null;
  return {
    get: () => (current ??= read()),
    set(next: EditorChoice) {
      current = next;
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage refused: the choice lasts until the page closes.
      }
      for (const l of [...listeners]) l();
    },
    /** For tests: forget what was read, so the next `get` reads storage again. */
    reset() {
      current = null;
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
})();

export function useEditorSetting(): [EditorChoice, (next: EditorChoice) => void] {
  const choice = useSyncExternalStore(editorSetting.subscribe, editorSetting.get, () => NONE);
  return [choice, editorSetting.set];
}

/** The editor that opens (4.3): locked, the default; else the learner's choice, or the default. */
export function editorShown(
  choice: EditorChoice,
  policy: { readonly default: EditorId; readonly locked: boolean },
): EditorId {
  return policy.locked ? policy.default : (choice.chosen ?? policy.default);
}
