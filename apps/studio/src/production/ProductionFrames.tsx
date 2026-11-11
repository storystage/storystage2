/**
 * The Production stage's frame strip (`07-ux.md` section 7.1; Direction A screen 02): every
 * frame in running order, grouped by scene, with its sketch and status. Choosing a frame makes it
 * current in all three tabs, and its scene the one shown below.
 */
import type { FrameId, Production } from '@storystage/production';
import { FrameStrip, type SceneFrames } from '@storystage/ui';
import { words } from '../strings.ts';
import { sceneNumber } from '../storyboard/edits.ts';
import { FramePicture } from '../storyboard/FramePicture.tsx';
import { sceneFrames } from '../storyboard/frames.ts';
import type { Place } from '../storyboard/place.ts';
import { frameProgress, type Rehearsed } from './frameProgress.ts';

/** The strip's scenes: those in the running order that have frames, numbered "2.3". */
export function stripScenes(p: Production, rehearsed: Rehearsed): SceneFrames[] {
  return p.manifest.runningOrder.flatMap(({ scene }) => {
    const frames = sceneFrames(p, scene);
    if (frames.length === 0) return [];
    const n = sceneNumber(p, scene);
    return [
      {
        id: scene,
        title: words.t('storyboard.script.scene', { n }),
        frames: frames.map((f, i) => ({
          id: f.id,
          number: `${n}.${i + 1}`,
          status: frameProgress(p, f, rehearsed),
          thumbnail: <FramePicture frame={f} label="" />,
        })),
      },
    ];
  });
}

export function ProductionFrames({
  production: p,
  frame,
  rehearsed,
  onPlaceChange,
}: {
  production: Production;
  frame: FrameId | null;
  rehearsed: Rehearsed;
  onPlaceChange: (place: Place) => void;
}) {
  const scenes = stripScenes(p, rehearsed);
  if (scenes.length === 0) return null;
  return (
    <div className="pr-strip">
      <FrameStrip
        scenes={scenes}
        currentFrame={frame ?? ''}
        onFrameChange={(id) => {
          const chosen = p.frames.find((f) => f.id === id);
          if (chosen) onPlaceChange({ scene: chosen.scene, frame: chosen.id });
        }}
      />
    </div>
  );
}
