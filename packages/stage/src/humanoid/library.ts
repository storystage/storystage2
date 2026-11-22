/**
 * The stage's shared humanoid clips (WP4.6): KayKit's, retargeted (`kaykit-clips.ts`), and the
 * gestures and the fall written in `gestures.ts`. They're loaded when a scene first has a
 * humanoid in it, so a page that never has one doesn't download them.
 */
import type { SceneSetup } from '@storystage/story-api';
import { loadNavigation, type NavigationMaker } from '../navigation.ts';
import { codedClips } from './gestures.ts';
import { unpack } from './packed.ts';
import type { HumanClip } from './pose.ts';

export type HumanLibrary = ReadonlyMap<string, HumanClip>;

let loading: Promise<HumanLibrary> | null = null;

export function loadHumanLibrary(): Promise<HumanLibrary> {
  loading ??= import('./kaykit-clips.ts').then(({ KAYKIT_CLIPS }) => {
    const clips = new Map(KAYKIT_CLIPS.map((p) => [p.name, unpack(p)]));
    const coded = codedClips(clips.get('idle')!.keys[0]!.pose, clips.get('lying')!.keys[0]!.pose);
    for (const c of coded) clips.set(c.name, c);
    return clips;
  });
  return loading;
}

/**
 * What a scene's characters need, loaded for a scene with a biped in it: the shared clips, and
 * a maker of walkable areas. A scene without one loads neither.
 */
export async function humanoidsFor(
  setup: SceneSetup,
): Promise<{ library: HumanLibrary | null; navigation: NavigationMaker | null }> {
  if (!setup.objects.some((o) => o.class === 'Biped')) return { library: null, navigation: null };
  const [library, navigation] = await Promise.all([loadHumanLibrary(), loadNavigation()]);
  return { library, navigation };
}
