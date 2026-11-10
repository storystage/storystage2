/**
 * The Screening room's right column (WP11.2, spec 08 section 3): **Compare with storyboard**, a
 * frame's sketch beside a still from the film at the moment that frame stands for, and **retake
 * notes**, one per scene in the learner's own words. The still is drawn on the device and thrown
 * away: it's never sent anywhere, and never to the Prompter (owner, 31 Oct 2026).
 */
import type { Timeline } from '@storystage/playback';
import {
  TEXT_LIMITS,
  type Frame,
  type FrameId,
  type Production,
  type SceneId,
} from '@storystage/production';
import type { FrameImage } from '@storystage/stage';
import type { Micros } from '@storystage/story-api';
import { Button, TextField } from '@storystage/ui';
import { useEffect, useRef, type ReactNode } from 'react';
import { clock } from './rough-cut.ts';
import { words } from './strings.ts';

/** Every storyboard frame: scenes in running order, each scene's frames in storyboard order. */
export function framesInOrder(production: Production): Frame[] {
  return production.manifest.runningOrder.flatMap(({ scene }) =>
    production.frames.filter((f) => f.scene === scene).sort((a, b) => a.order - b.order),
  );
}

/** A frame's number as the studio shows it: "2.3". */
function frameNumber(production: Production, frame: Frame): string {
  const scene = production.manifest.runningOrder.findIndex((r) => r.scene === frame.scene) + 1;
  return `${scene}.${frame.order + 1}`;
}

export type StillState =
  | { readonly kind: 'none' }
  | { readonly kind: 'drawing' }
  /** The scene isn't in the measured film, so nothing to show. */
  | { readonly kind: 'notPlayed' }
  | { readonly kind: 'ready'; readonly at: Micros; readonly image: FrameImage };

export interface CompareProps {
  readonly production: Production;
  readonly timeline: Timeline | null;
  /** The frame compared, `null` when the film has none. */
  readonly frame: FrameId | null;
  /** Show another frame: the host draws its still. */
  onShow(frame: FrameId): void;
  /** The studio's read-only drawing of a frame (S5's `frameDrawer`). */
  drawFrame(scene: SceneId, frame: FrameId): ReactNode;
  readonly still: StillState;
}

/** Puts a still on a canvas the size of its picture; CSS scales it to the column. */
function Still({ image, label }: { image: FrameImage; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
      0,
      0,
    );
  }, [image]);
  return <canvas ref={ref} className="sr-still" role="img" aria-label={label} />;
}

export function Compare(props: CompareProps) {
  const { production: p, still } = props;
  const all = framesInOrder(p);
  const at = all.findIndex((f) => f.id === props.frame);
  const frame = at >= 0 ? all[at]! : null;
  return (
    <section className="sr-compare" aria-labelledby="sr-compare-title">
      <h2 id="sr-compare-title" className="sr-side-title">
        {words.t('compare.title')}
      </h2>
      {!frame ? (
        <p className="sr-side-note">{words.t('compare.noFrames')}</p>
      ) : (
        <>
          <div className="sr-compare-head">
            <Button
              variant="quiet"
              icon="chevron_left"
              aria-label={words.t('compare.previous')}
              isDisabled={at <= 0}
              onPress={() => props.onShow(all[at - 1]!.id)}
            />
            <span className="sr-compare-frame">
              {words.t('compare.frame', { frame: frameNumber(p, frame) })}
            </span>
            <Button
              variant="quiet"
              icon="chevron_right"
              aria-label={words.t('compare.next')}
              isDisabled={at >= all.length - 1}
              onPress={() => props.onShow(all[at + 1]!.id)}
            />
          </div>
          <div className="sr-compare-pair">
            <figure>
              <div className="sr-compare-picture">{props.drawFrame(frame.scene, frame.id)}</div>
              <figcaption>{words.t('compare.sketch')}</figcaption>
            </figure>
            <figure>
              <div className="sr-compare-picture">
                {still.kind === 'ready' && (
                  <Still
                    image={still.image}
                    label={words.t('compare.stillLabel', {
                      time: clock(still.at),
                      frame: frameNumber(p, frame),
                    })}
                  />
                )}
                {still.kind === 'drawing' && (
                  <span className="sr-side-note">{words.t('compare.drawing')}</span>
                )}
                {still.kind === 'notPlayed' && (
                  <span className="sr-side-note">{words.t('compare.notPlayed')}</span>
                )}
              </div>
              <figcaption>{words.t('compare.still')}</figcaption>
            </figure>
          </div>
        </>
      )}
    </section>
  );
}

export interface RetakeNotesProps {
  readonly production: Production;
  /** The scene the notes are for: the current one. */
  readonly scene: SceneId | null;
  /** The learner's words for the scene, as they type (the studio joins them into one step). */
  onChange(scene: SceneId, notes: string): void;
  /** The learner left the field: the step ends. */
  onDone(): void;
  readonly readOnly?: boolean;
}

/**
 * Retake notes (spec 08 section 3): each scene's note, kept on its storyboard card
 * (`SceneCard.retakeNotes`), written through the production's session so it has undo, up to
 * spec 07 section 6.9's length.
 */
export function RetakeNotes(props: RetakeNotesProps) {
  const { production: p, scene } = props;
  if (!scene) return null;
  const n = p.manifest.runningOrder.findIndex((r) => r.scene === scene) + 1;
  const notes = p.storyboard.cards.find((c) => c.id === scene)?.retakeNotes ?? '';
  return (
    <section className="sr-notes" aria-labelledby="sr-notes-title">
      <h2 id="sr-notes-title" className="sr-side-title">
        {words.t('notes.title')}
      </h2>
      <TextField
        label={words.t('notes.label', { n })}
        placeholder={words.t('notes.placeholder')}
        multiline
        value={notes}
        maxLength={TEXT_LIMITS.retakeNotes}
        isReadOnly={props.readOnly ?? false}
        onChange={(text) => props.onChange(scene, text)}
        onBlur={() => props.onDone()}
        description={words.t('notes.left', { n: TEXT_LIMITS.retakeNotes - notes.length })}
      />
    </section>
  );
}
