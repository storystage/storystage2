/**
 * Settings › Accessibility on this device (`07-ux.md` sections 2.2 and 4): the theme (Dark,
 * Light or Match this device; decision 0037, Dark by default) and the text size (100%, 125% or
 * 150%; decision 0035), which scales the type without narrowing the window.
 */
import type { Theme } from '@storystage/ui';
import { useEffect, useState, useSyncExternalStore } from 'react';

export type ThemeChoice = Theme | 'device';
export const THEME_CHOICES: readonly ThemeChoice[] = ['dark', 'light', 'device'];
export const TEXT_SIZE_CHOICES = [1, 1.25, 1.5] as const;
export type TextSize = (typeof TEXT_SIZE_CHOICES)[number];

export interface Appearance {
  readonly theme: ThemeChoice;
  readonly textSize: TextSize;
}

const KEY = 'storystage.appearance';
const DEFAULT: Appearance = { theme: 'dark', textSize: 1 };

function read(): Appearance {
  try {
    const raw = JSON.parse(
      window.localStorage.getItem(KEY) ?? 'null',
    ) as Partial<Appearance> | null;
    return {
      theme: THEME_CHOICES.includes(raw?.theme as ThemeChoice)
        ? (raw!.theme as ThemeChoice)
        : 'dark',
      textSize: TEXT_SIZE_CHOICES.includes(raw?.textSize as TextSize)
        ? (raw!.textSize as TextSize)
        : 1,
    };
  } catch {
    return DEFAULT;
  }
}

/** The setting, kept on this device, and shared by every screen. */
export const appearanceSetting = (() => {
  const listeners = new Set<() => void>();
  let current = typeof window === 'undefined' ? DEFAULT : read();
  return {
    get: () => current,
    set(change: Partial<Appearance>) {
      current = { ...current, ...change };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(current));
      } catch {
        // Storage refused: the choice lasts until the page closes.
      }
      for (const l of [...listeners]) l();
    },
    /** For tests: read again from storage. */
    reload() {
      current = read();
      for (const l of [...listeners]) l();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
})();

export function useAppearanceSetting(): [Appearance, (change: Partial<Appearance>) => void] {
  const value = useSyncExternalStore(
    appearanceSetting.subscribe,
    appearanceSetting.get,
    () => DEFAULT,
  );
  return [value, appearanceSetting.set];
}

const LIGHT = '(prefers-color-scheme: light)';

/** Whether the device prefers light, following it as it changes. */
function useDevicePrefersLight(): boolean {
  const query = () =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(LIGHT)
      : null;
  const [light, setLight] = useState(() => query()?.matches ?? false);
  useEffect(() => {
    const q = query();
    if (!q) return;
    const changed = () => setLight(q.matches);
    q.addEventListener('change', changed);
    return () => q.removeEventListener('change', changed);
  }, []);
  return light;
}

/** The theme and text size to draw with: Match this device follows the device's choice. */
export function useAppearance(): { theme: Theme; textSize: TextSize } {
  const [setting] = useAppearanceSetting();
  const light = useDevicePrefersLight();
  const theme: Theme = setting.theme === 'device' ? (light ? 'light' : 'dark') : setting.theme;
  return { theme, textSize: setting.textSize };
}
