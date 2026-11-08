/**
 * The stage's shared humanoid clips (WP4.6): KayKit's, retargeted (`kaykit-clips.ts`), and the
 * gestures written here. They're loaded when a scene first has a humanoid in it, so a page that
 * never has one doesn't download them.
 */
import { unpack } from './packed.ts';
import type { HumanClip } from './pose.ts';

export type HumanLibrary = ReadonlyMap<string, HumanClip>;

let loading: Promise<HumanLibrary> | null = null;

export function loadHumanLibrary(): Promise<HumanLibrary> {
  loading ??= import('./kaykit-clips.ts').then(
    ({ KAYKIT_CLIPS }) => new Map(KAYKIT_CLIPS.map((p) => [p.name, unpack(p)])),
  );
  return loading;
}
