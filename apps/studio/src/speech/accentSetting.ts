/**
 * Settings › Voices' accent on this device (spec 06 section 4.3; owner, 10 Nov 2026): British
 * English by default, or American English. It's the accent a film takes when it has no voices
 * of its own yet; a film keeps its own (`manifest.voices`), so it sounds the same anywhere.
 */
import { useSyncExternalStore } from 'react';

export type DeviceAccent = 'british' | 'american';

const KEY = 'storystage.accent';

export const accentSetting = (() => {
  const listeners = new Set<() => void>();
  const read = (): DeviceAccent => {
    try {
      return window.localStorage.getItem(KEY) === 'american' ? 'american' : 'british';
    } catch {
      return 'british';
    }
  };
  return {
    get: read,
    set(accent: DeviceAccent) {
      try {
        if (accent === 'american') window.localStorage.setItem(KEY, accent);
        else window.localStorage.removeItem(KEY);
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

export function useAccentSetting(): [DeviceAccent, (accent: DeviceAccent) => void] {
  const accent = useSyncExternalStore(
    accentSetting.subscribe,
    accentSetting.get,
    (): DeviceAccent => 'british',
  );
  return [accent, accentSetting.set];
}
