import type { ReactNode } from 'react';
import {
  Header,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  type Key,
  type Selection,
} from 'react-aria-components';
import { messages } from './messages.ts';
import { StatusChip, type FrameStatus } from './StatusChip.tsx';

export interface FrameCardData {
  id: string;
  /** The frame's number, such as "2.3". */
  number: string;
  status: FrameStatus;
  /** The sketch thumbnail, black lines on white (from the frame's sketches). */
  thumbnail?: ReactNode;
}

export interface SceneFrames {
  id: string;
  /** "Scene 2". */
  title: string;
  frames: readonly FrameCardData[];
}

export interface FrameStripProps {
  scenes: readonly SceneFrames[];
  /** The current frame, which stays the same across the three modes (07-ux §2.1). */
  currentFrame: string;
  onFrameChange: (id: string) => void;
}

/**
 * The frame strip (Direction A, Production stage): every frame as a 140 × 50 card with its sketch,
 * number and status, grouped by scene. The arrow keys move between frames and Enter chooses one;
 * moving alone doesn't change the stage.
 */
export function FrameStrip({ scenes, currentFrame, onFrameChange }: FrameStripProps) {
  return (
    <ListBox
      className="ss-frame-strip"
      aria-label={messages.t('frames.label')}
      orientation="horizontal"
      selectionMode="single"
      selectionBehavior="replace"
      disallowEmptySelection
      selectedKeys={[currentFrame]}
      onSelectionChange={(keys: Selection) => {
        if (keys === 'all') return;
        const [id] = keys as Set<Key>;
        if (id !== undefined) onFrameChange(String(id));
      }}
    >
      {scenes.map((scene) => (
        <ListBoxSection key={scene.id} id={scene.id} className="ss-frame-scene">
          <Header className="ss-frame-scene-title">{scene.title}</Header>
          {scene.frames.map((frame) => (
            <ListBoxItem
              key={frame.id}
              id={frame.id}
              className="ss-frame-card"
              textValue={frame.number}
              aria-label={messages.t('frames.frame', {
                number: frame.number,
                status: messages.t(`status.${frame.status}`),
              })}
            >
              <span className="ss-frame-thumb" aria-hidden="true">
                {frame.thumbnail}
              </span>
              <span className="ss-frame-meta">
                <span className="ss-frame-number">{frame.number}</span>
                <StatusChip status={frame.status} />
              </span>
            </ListBoxItem>
          ))}
        </ListBoxSection>
      ))}
    </ListBox>
  );
}
