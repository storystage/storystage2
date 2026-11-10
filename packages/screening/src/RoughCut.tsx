import type { NodeId } from '@storystage/ast';
import type { Timeline } from '@storystage/playback';
import {
  moveScene,
  type FrameId,
  type Production,
  type SceneId,
  type SceneStep,
} from '@storystage/production';
import type { Micros } from '@storystage/story-api';
import { Button, Icon, NeutralNote } from '@storystage/ui';
import { useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import {
  Button as AriaButton,
  GridList,
  GridListItem,
  useDragAndDrop,
} from 'react-aria-components';
import {
  clock,
  currentFrame,
  frameLabel,
  nudge,
  sceneAt,
  segments,
  sliderText,
  timeLabel,
  type Segment,
} from './rough-cut.ts';
import { words } from './strings.ts';

/** The studio's shared place: the current scene and frame (spec 08, section 2). */
export interface Place {
  readonly scene: SceneId;
  readonly frame: FrameId | null;
}

/** A run that stopped with an error, in plain words, at a block. */
export interface RoughCutError {
  readonly words: string;
  readonly node: NodeId | null;
}

export interface RoughCutProps {
  readonly production: Production;
  /**
   * `null` while the film is being measured: the player shows, with a note, and the controls
   * come once it's ready. The player stays where it is, so the stage's canvas isn't remade.
   */
  readonly timeline: Timeline | null;
  /** The film's time now. */
  readonly time: Micros;
  readonly playing: boolean;
  onPlayPause(): void;
  /** Play from a moment: a scene's start, or a point inside it (fast-forward). */
  onSeek(t: Micros): void;
  /** The stage's picture, which the host makes. */
  readonly player: ReactNode;
  /** The captions showing now (`captionsAt`), earliest first. Always on here. */
  readonly captions: readonly string[];
  readonly error: RoughCutError | null;
  /** Opens the block in the Code editor, with the place if it changes. */
  onOpenProductionStage(node: NodeId, place: Place | null): void;
  /** A running order change, one undo step through the production's session. */
  onStep(step: SceneStep): void;
  /** The current scene and frame changed. */
  onPlaceChange?(place: Place): void;
}

/** Where a click on the bar falls in the film. */
function timeAtClick(e: MouseEvent<HTMLElement>, length: Micros): Micros {
  const box = e.currentTarget.getBoundingClientRect();
  const at = box.width > 0 ? (e.clientX - box.left) / box.width : 0;
  return Math.round(Math.min(1, Math.max(0, at)) * length);
}

/** The rough cut (WP11.1, spec 08 section 2): the player, the bar under it and the running order. */
export function RoughCut(props: RoughCutProps) {
  const { production: p, time } = props;
  const ready = props.timeline !== null;
  const timeline = props.timeline ?? MEASURING;
  const all = segments(p, timeline);
  const segment = sceneAt(all, time);
  const frame = currentFrame(p, timeline, time);
  const label = segment ? frameLabel(segment, frame) : null;
  const playerRef = useRef<HTMLDivElement>(null);

  const place: Place | null = segment ? { scene: segment.scene, frame: frame?.id ?? null } : null;
  const placeKey = place ? `${place.scene}/${place.frame ?? ''}` : '';
  const { onPlaceChange } = props;
  // Tells the studio only when the place itself changes.
  const told = useRef('');
  useEffect(() => {
    if (!place || placeKey === told.current) return;
    told.current = placeKey;
    onPlaceChange?.(place);
  });

  const onBarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const to = nudge(time, e.key, timeline);
    if (to === null) return;
    e.preventDefault();
    props.onSeek(to);
  };

  const fullScreen = () => {
    void playerRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <section className="sr-rough-cut" aria-label={words.t('roughCut.title')}>
      <div
        className="sr-player"
        ref={playerRef}
        role="region"
        aria-label={words.t('roughCut.player')}
      >
        {props.player}
        {label && (
          <span className="sr-player-label">
            {label.frame === null
              ? words.t('roughCut.label.scene', { scene: label.scene })
              : words.t('roughCut.label.frame', { scene: label.scene, frame: label.frame })}
          </span>
        )}
        {props.captions.length > 0 && (
          <div className="sr-captions" aria-live="off">
            {props.captions.map((c, i) => (
              <p key={i} className="sr-caption">
                {c}
              </p>
            ))}
          </div>
        )}
      </div>

      {!ready && (
        <NeutralNote>
          <span role="status">{words.t('roughCut.measuring')}</span>
        </NeutralNote>
      )}

      {ready && (
        <>
          <div className="sr-controls">
            <Button
              variant="primary"
              icon={props.playing ? 'pause' : 'play_arrow'}
              onPress={props.onPlayPause}
            >
              {props.playing ? words.t('roughCut.pause') : words.t('roughCut.play')}
            </Button>
            <span className="sr-time">{timeLabel(time, timeline)}</span>
            <Button variant="secondary" icon="fullscreen" onPress={fullScreen}>
              {words.t('roughCut.fullScreen')}
            </Button>
          </div>

          <div
            className="sr-bar"
            role="slider"
            tabIndex={0}
            aria-label={words.t('roughCut.bar')}
            aria-valuemin={0}
            aria-valuemax={Math.round(timeline.length / 1000)}
            aria-valuenow={Math.round(time / 1000)}
            aria-valuetext={sliderText(time, timeline)}
            onKeyDown={onBarKey}
            onClick={(e) => props.onSeek(timeAtClick(e, timeline.length))}
          >
            {all.map((s, i) => (
              <span
                key={i}
                className="sr-segment"
                data-current={s === segment || undefined}
                style={{ flexGrow: Math.max(1, s.length) }}
                title={segmentName(s)}
              >
                <span className="sr-segment-name">{segmentName(s)}</span>
                {s.waits && <span className="sr-waits">{words.t('roughCut.waits')}</span>}
              </span>
            ))}
            <span
              className="sr-bar-now"
              aria-hidden
              style={{ left: `${timeline.length > 0 ? (100 * time) / timeline.length : 0}%` }}
            />
          </div>

          {timeline.end.kind === 'cap' && <NeutralNote>{words.t('roughCut.cap')}</NeutralNote>}

          {props.error && (
            <NeutralNote>
              <span role="alert">{props.error.words}</span>{' '}
              {props.error.node !== null && (
                <Button
                  variant="secondary"
                  icon="handyman"
                  onPress={() => props.onOpenProductionStage(props.error!.node!, place)}
                >
                  {words.t('roughCut.fix')}
                </Button>
              )}
            </NeutralNote>
          )}

          <RunningOrder
            production={p}
            segments={all}
            current={segment?.scene ?? null}
            onSeek={props.onSeek}
            onStep={props.onStep}
          />
        </>
      )}
    </section>
  );
}

/** Stands in for the timeline while the film is measured. */
const MEASURING: Timeline = {
  scenes: [],
  blocks: [],
  lines: [],
  length: 0,
  end: { kind: 'ended' },
};

const segmentName = (s: Segment) =>
  words.t('roughCut.segment', {
    n: s.number,
    heading: s.heading.trim() || words.t('roughCut.noHeading'),
  });

/**
 * Moves a scene in the running order, as the Storyboard does: one step through the session.
 * `null` if the move isn't allowed.
 */
export function reorder(
  production: Production,
  moving: SceneId,
  target: SceneId,
  position: 'before' | 'after',
): SceneStep | null {
  const order = production.manifest.runningOrder.map((r) => r.scene);
  const n = order.indexOf(moving) + 1;
  const rest = order.filter((s) => s !== moving);
  const at = rest.indexOf(target);
  if (n === 0 || at < 0) return null;
  const result = moveScene(
    production,
    moving,
    position === 'before' ? at : at + 1,
    words.t('roughCut.step.move', { n }),
  );
  return result.ok ? result.step : null;
}

interface RunningOrderProps {
  readonly production: Production;
  readonly segments: readonly Segment[];
  readonly current: SceneId | null;
  onSeek(t: Micros): void;
  onStep(step: SceneStep): void;
}

/**
 * The running order strip: one card per scene with its number, heading and length. Choosing a
 * card plays from its scene's start. Drag its handle to move it, or with the keyboard: Enter on
 * the handle, the arrow keys, Enter.
 */
function RunningOrder({
  production: p,
  segments: all,
  current,
  onSeek,
  onStep,
}: RunningOrderProps) {
  const order = p.manifest.runningOrder.map((r) => r.scene);
  const first = (scene: SceneId) => all.find((s) => s.scene === scene);
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (e) => {
      const [moving] = [...e.keys] as SceneId[];
      if (!moving || e.target.dropPosition === 'on') return;
      const step = reorder(p, moving, e.target.key as SceneId, e.target.dropPosition);
      if (step) onStep(step);
    },
  });

  return (
    <GridList
      className="sr-order"
      aria-label={words.t('roughCut.order')}
      layout="grid"
      items={order.map((id) => ({ id }))}
      onAction={(key) => {
        const s = first(key as SceneId);
        if (s) onSeek(s.start);
      }}
      dragAndDropHooks={dragAndDropHooks}
    >
      {({ id }) => {
        const n = order.indexOf(id) + 1;
        const s = first(id);
        const heading =
          p.storyboard.cards.find((c) => c.id === id)?.heading.trim() ||
          words.t('roughCut.noHeading');
        const name = words.t('roughCut.segment', { n, heading });
        return (
          <GridListItem
            id={id}
            textValue={name}
            className="sr-card"
            data-current={id === current || undefined}
          >
            <AriaButton
              slot="drag"
              className="sr-card-handle"
              aria-label={words.t('roughCut.card.move', { n })}
            >
              <Icon name="drag_indicator" size={20} />
            </AriaButton>
            <span className="sr-card-name">{name}</span>
            {s && (
              <span className="sr-card-length">
                {words.t(s.waits ? 'roughCut.card.lengthWaits' : 'roughCut.card.length', {
                  time: clock(s.length),
                })}
              </span>
            )}
          </GridListItem>
        );
      }}
    </GridList>
  );
}
