/**
 * "Show as text" and its wording (`07-ux.md` section 7.3; WP7.2, 7.6): the learner's choice, kept
 * on this device. Hidden and Python-like until they choose otherwise.
 */
import { TEXT_STYLES, type TextStyle } from '@storystage/text-view';
import { useSyncExternalStore } from 'react';

const KEY = 'storystage.textView';

export interface TextViewChoice {
  readonly shown: boolean;
  readonly style: TextStyle;
}

const HIDDEN: TextViewChoice = { shown: false, style: 'python' };

function read(): TextViewChoice {
  try {
    const kept = JSON.parse(window.localStorage.getItem(KEY) ?? 'null') as unknown;
    if (typeof kept !== 'object' || kept === null) return HIDDEN;
    const { shown, style } = kept as Partial<Record<keyof TextViewChoice, unknown>>;
    return {
      shown: shown === true,
      style: TEXT_STYLES.includes(style as TextStyle) ? (style as TextStyle) : 'python',
    };
  } catch {
    return HIDDEN;
  }
}

/** The choice on this device, read once, then kept in step with `set`. */
export const textViewSetting = (() => {
  const listeners = new Set<() => void>();
  let current: TextViewChoice | null = null;
  return {
    get: () => (current ??= read()),
    set(next: TextViewChoice) {
      current = next;
      try {
        window.localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        // Storage refused: the choice lasts until the page closes.
      }
      for (const l of [...listeners]) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
})();

export function useTextViewSetting(): [TextViewChoice, (next: TextViewChoice) => void] {
  const choice = useSyncExternalStore(textViewSetting.subscribe, textViewSetting.get, () => HIDDEN);
  return [choice, textViewSetting.set];
}
