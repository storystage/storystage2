/** Test helpers: a sound in the example production, and cues that play it. */
import {
  exampleProduction,
  withSceneMusic,
  withSound,
  type MusicCue,
  type Production,
  type SceneId,
  type SoundClip,
} from '@storystage/production';

/** Rain: 10 seconds, of which 2 to 5.5 play (as the studio's tests have it). */
export const RAIN: SoundClip = {
  id: 'sn1',
  file: 'sn1.wav',
  label: 'Rain',
  length: 10,
  bytes: 1_572_864,
  trim: { start: 2, end: 5.5 },
};

/** The example production with Rain, and its three scenes in running order. */
export const p0 = withSound(exampleProduction(), RAIN);
export const [s1, s2, s3] = p0.manifest.runningOrder.map((r) => r.scene) as [
  SceneId,
  SceneId,
  SceneId,
];

/** Rain's whole trimmed part from `start`, at full volume, with no fades or loop. */
export const cue = (start: number, more: Partial<MusicCue> = {}): MusicCue => ({
  sound: RAIN.id,
  start,
  from: 0,
  to: 3.5,
  fadeIn: 0,
  fadeOut: 0,
  loop: false,
  volume: 1,
  carriesOn: false,
  ...more,
});

export const withCues = (scene: SceneId, cues: MusicCue[], p: Production = p0) =>
  withSceneMusic(p, scene, cues);
