import type { FrameId, Production, SceneId } from '@storystage/production';
import type { ShotType } from '@storystage/story-api';
import { Button, Dialog, Icon, Segmented, messages } from '@storystage/ui';
import { useState } from 'react';
import {
  Button as AriaButton,
  GridList,
  GridListItem,
  Group,
  Input,
  Label,
  NumberField,
  useDragAndDrop,
  type Key,
  type Selection,
} from 'react-aria-components';
import { SpokenField } from '../speech/SpokenField.tsx';
import { words } from '../strings.ts';
import { LIMITS, sceneNumber } from './edits.ts';
import { FrameCanvas } from './FrameCanvas.tsx';
import type { SketchItem } from './SketchArt.tsx';
import {
  FRAME_LENGTH,
  MAIN_SHOTS,
  MORE_SHOTS,
  addFrame,
  deleteFrame,
  frameHasContent,
  moveFrame,
  sceneFrames,
  setCaption,
  setLength,
  setShot,
} from './frames.ts';

export interface FramePanelProps {
  production: Production;
  scene: SceneId;
  /** The current frame of this scene, or `null` if it has none. */
  current: FrameId | null;
  onCurrentChange: (frame: FrameId) => void;
  onChange: (label: string, next: Production, key?: string) => void;
  onLeave: () => void;
  /** The chosen sketch on the current frame, or `null`. */
  sketch: string | null;
  onSketchChange: (id: string | null) => void;
  /** Puts a library item on the current frame, at (x, y) or in the middle. */
  onAddSketch: (item: SketchItem, x?: number, y?: number) => void;
  onAnnounce: (text: string) => void;
}

const shotName = (shot: ShotType) => messages.t(`shot.${shot}`);

/**
 * The current scene's frames and the current frame (`07-ux.md` sections 6.4, 6.5; WP10.6): the
 * frames as numbered squares, reordered by drag or keyboard, Add a frame and Delete frame; then the
 * frame's shot, length and caption, and the frame with its sketches (`FrameCanvas`).
 */
export function FramePanel({
  production: p,
  scene,
  current,
  onCurrentChange,
  onChange,
  onLeave,
  sketch,
  onSketchChange,
  onAddSketch,
  onAnnounce,
}: FramePanelProps) {
  const [confirming, setConfirming] = useState(false);
  const [moreShots, setMoreShots] = useState(false);
  const n = sceneNumber(p, scene);
  const frames = sceneFrames(p, scene);
  const numberOf = (id: FrameId) => `${n}.${frames.findIndex((f) => f.id === id) + 1}`;
  const frame = frames.find((f) => f.id === current) ?? null;
  const full = frames.length >= LIMITS.framesPerScene;

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (e) => {
      const [moving] = [...e.keys] as FrameId[];
      if (!moving) return;
      const rest = frames.filter((f) => f.id !== moving).map((f) => f.id);
      const at = rest.indexOf(e.target.key as FrameId);
      const to = e.target.dropPosition === 'before' ? at : at + 1;
      onChange(words.t('step.moveFrame', { number: numberOf(moving) }), moveFrame(p, moving, to));
    },
  });

  const add = () => {
    const added = addFrame(p, scene, current);
    if (!added) return;
    const number = `${n}.${sceneFrames(added.production, scene).findIndex((f) => f.id === added.frame) + 1}`;
    onChange(words.t('step.addFrame', { number }), added.production);
    onCurrentChange(added.frame);
  };

  const remove = () => {
    if (!frame) return;
    setConfirming(false);
    onChange(words.t('step.deleteFrame', { number: numberOf(frame.id) }), deleteFrame(p, frame.id));
  };

  const shotIsMore = frame !== null && (MORE_SHOTS as readonly ShotType[]).includes(frame.shot);
  const showMore = moreShots || shotIsMore;

  return (
    <section className="sb-frames" aria-labelledby="sb-frames-title">
      <h2 id="sb-frames-title" className="ss-visually-hidden">
        {words.t('storyboard.frames.ofScene', { n })}
      </h2>
      <div className="sb-frame-row">
        {frames.length > 0 ? (
          <GridList
            className="sb-frame-list"
            aria-label={words.t('storyboard.frames.ofScene', { n })}
            layout="grid"
            items={frames.map((f) => ({ id: f.id }))}
            selectionMode="single"
            selectionBehavior="replace"
            disallowEmptySelection
            selectedKeys={current ? [current] : []}
            onSelectionChange={(keys: Selection) => {
              if (keys === 'all') return;
              const [id] = keys as Set<Key>;
              if (id !== undefined) onCurrentChange(id as FrameId);
            }}
            dragAndDropHooks={dragAndDropHooks}
          >
            {({ id }) => (
              <GridListItem id={id} textValue={numberOf(id)} className="sb-frame-square">
                <AriaButton
                  slot="drag"
                  className="sb-frame-handle"
                  aria-label={words.t('storyboard.frames.move', { number: numberOf(id) })}
                >
                  <Icon name="drag_indicator" size={16} />
                </AriaButton>
                <span className="sb-frame-number">{numberOf(id)}</span>
              </GridListItem>
            )}
          </GridList>
        ) : (
          <p className="sb-details-hint">{words.t('storyboard.frames.none')}</p>
        )}
        <Button variant="secondary" icon="add" isDisabled={full} onPress={add}>
          {words.t('storyboard.frames.add')}
        </Button>
        {full && (
          <span className="sb-details-hint">
            {words.t('storyboard.frames.full', { limit: LIMITS.framesPerScene })}
          </span>
        )}
        {frame && (
          <Button
            variant="quiet"
            icon="close"
            onPress={() => (frameHasContent(p, frame.id) ? setConfirming(true) : remove())}
          >
            {words.t('storyboard.frames.delete')}
          </Button>
        )}
      </div>

      {frame && (
        <>
          <div className="sb-frame-tools">
            <Segmented
              label={words.t('storyboard.shot')}
              options={MAIN_SHOTS.map((s) => ({ id: s, label: shotName(s) }))}
              value={frame.shot}
              onChange={(shot) =>
                onChange(
                  words.t('step.shot', { number: numberOf(frame.id), shot: shotName(shot) }),
                  setShot(p, frame.id, shot),
                )
              }
            />
            <Button
              variant="quiet"
              aria-expanded={showMore}
              isDisabled={shotIsMore}
              onPress={() => setMoreShots(!moreShots)}
            >
              {words.t(showMore ? 'storyboard.shot.fewer' : 'storyboard.shot.more')}
            </Button>
            {showMore && (
              <Segmented
                label={words.t('storyboard.shot.more')}
                options={MORE_SHOTS.map((s) => ({ id: s, label: shotName(s) }))}
                value={frame.shot}
                onChange={(shot) =>
                  onChange(
                    words.t('step.shot', { number: numberOf(frame.id), shot: shotName(shot) }),
                    setShot(p, frame.id, shot),
                  )
                }
              />
            )}
            <NumberField
              className="sb-length"
              value={frame.lengthSeconds}
              minValue={FRAME_LENGTH.min}
              maxValue={FRAME_LENGTH.max}
              step={1}
              onChange={(seconds) => {
                if (Number.isNaN(seconds)) return;
                onChange(
                  words.t('step.length', { number: numberOf(frame.id), seconds }),
                  setLength(p, frame.id, seconds),
                  `length:${frame.id}`,
                );
              }}
              onBlur={onLeave}
            >
              <Label className="sb-length-label">{words.t('storyboard.length')}</Label>
              <Group className="sb-length-group">
                <AriaButton
                  slot="decrement"
                  className="ss-button"
                  data-variant="secondary"
                  aria-label={words.t('storyboard.length.less')}
                >
                  <Icon name="remove" />
                </AriaButton>
                <Input className="sb-length-input" />
                <span className="sb-length-unit" aria-hidden="true">
                  s
                </span>
                <AriaButton
                  slot="increment"
                  className="ss-button"
                  data-variant="secondary"
                  aria-label={words.t('storyboard.length.more')}
                >
                  <Icon name="add" />
                </AriaButton>
              </Group>
            </NumberField>
          </div>
          <div className="sb-row">
            <SpokenField
              field={`caption:${frame.id}`}
              label={words.t('storyboard.caption')}
              placeholder={words.t('storyboard.captionPlaceholder')}
              value={frame.caption}
              maxLength={LIMITS.caption}
              onChange={(v) =>
                onChange(
                  words.t('step.caption', { number: numberOf(frame.id) }),
                  setCaption(p, frame.id, v),
                  `caption:${frame.id}`,
                )
              }
              onBlur={onLeave}
            />
          </div>
          <FrameCanvas
            production={p}
            frame={frame}
            number={numberOf(frame.id)}
            chosen={sketch}
            onChosenChange={onSketchChange}
            onChange={onChange}
            onLeave={onLeave}
            onAdd={onAddSketch}
            onAnnounce={onAnnounce}
          >
            <span className="sb-canvas-number">
              {words.t('storyboard.frame', { number: numberOf(frame.id) })}
            </span>
            <span className="sb-canvas-shot">{shotName(frame.shot)}</span>
            <span>{words.t('storyboard.seconds', { seconds: frame.lengthSeconds })}</span>
          </FrameCanvas>
        </>
      )}

      <Dialog
        isOpen={confirming}
        onOpenChange={setConfirming}
        title={words.t('storyboard.frames.deleteTitle', {
          number: frame ? numberOf(frame.id) : '',
        })}
        width={520}
      >
        <p className="sb-dialog-text">{words.t('storyboard.frames.deleteWhat')}</p>
        <div className="sb-dialog-actions">
          <Button variant="stop" icon="close" iconFilled={false} onPress={remove}>
            {words.t('storyboard.frames.delete')}
          </Button>
          <Button variant="secondary" onPress={() => setConfirming(false)}>
            {words.t('storyboard.frames.keep')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
