import type { Frame, Production } from '@storystage/production';
import { inLayerOrder } from '@storystage/sketches';
import { messages } from '@storystage/ui';
import { words } from '../strings.ts';
import { sceneNumber } from './edits.ts';
import { sceneFrames } from './frames.ts';
import { pinnedLines } from './lines.ts';
import { partName } from './ScriptHeader.tsx';
import { SketchArt, sketchAspect } from './SketchArt.tsx';

/** A sketch at standard size is this tall, as a share of the frame's height (as on the canvas). */
const STANDARD_HEIGHT = 0.3;
const percent = (share: number) => `${Math.round(share * 10000) / 100}%`;

/** A frame as printed: its sketches where the learner put them, nothing to press. */
function PrintedFrame({ frame }: { frame: Frame }) {
  return (
    <div className="sb-print-paper">
      {inLayerOrder(frame).map((s) => (
        <span
          key={s.id}
          className="sb-print-sketch"
          style={{
            left: percent(s.x),
            top: percent(s.y),
            height: percent(STANDARD_HEIGHT * s.scale),
            aspectRatio: sketchAspect(s.item),
          }}
        >
          <span className="sb-sketch-art" data-flipped={s.flipped || undefined}>
            <SketchArt item={s.item} />
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * The storyboard laid out for printing (`07-ux.md` section 6.7; WP10.7; decision 0054): black on
 * white in either theme, A4 landscape. The title, logline and synopsis; then each scene in running
 * order with its frames three to a row, each with its sketches, shot, length, caption and pinned
 * lines, and a ruled line for the teacher's marks. The page foot (the title and the page number)
 * comes from `@page` in `print.css`.
 */
export function PrintStoryboard({ production: p }: { production: Production }) {
  const title = p.manifest.title.trim() || words.t('storyboard.untitled');
  return (
    <article className="sb-print">
      <header className="sb-print-head">
        <h1 className="sb-print-title">{title}</h1>
        {p.storyboard.logline && (
          <p>
            <strong>{words.t('storyboard.logline')}: </strong>
            {p.storyboard.logline}
          </p>
        )}
        {p.storyboard.synopsis && (
          <p className="sb-print-synopsis">
            <strong>{words.t('storyboard.synopsis')}: </strong>
            {p.storyboard.synopsis}
          </p>
        )}
      </header>
      {p.manifest.runningOrder.map(({ scene }) => {
        const card = p.storyboard.cards.find((c) => c.id === scene);
        const n = sceneNumber(p, scene);
        const frames = sceneFrames(p, scene);
        return (
          <section key={scene} className="sb-print-scene">
            <h2 className="sb-print-scene-title">
              {words.t('storyboard.script.scene', { n })} ·{' '}
              {card?.heading || words.t('storyboard.scene.noHeading')}
              {card?.arcPart && <span className="sb-print-part">{partName(card.arcPart)}</span>}
            </h2>
            {frames.length > 0 && (
              <ol
                className="sb-print-frames"
                aria-label={words.t('storyboard.print.frames', { n })}
              >
                {frames.map((frame, i) => (
                  <li key={frame.id} className="sb-print-frame">
                    <div className="sb-print-frame-head">
                      <strong>{words.t('storyboard.frame', { number: `${n}.${i + 1}` })}</strong>
                      <span className="sb-print-shot">{messages.t(`shot.${frame.shot}`)}</span>
                      <span>{words.t('storyboard.seconds', { seconds: frame.lengthSeconds })}</span>
                    </div>
                    <PrintedFrame frame={frame} />
                    {frame.caption && <p className="sb-print-caption">{frame.caption}</p>}
                    {pinnedLines(p, frame.id).map((l) => (
                      <p key={l.id} className="sb-print-line">
                        {l.character && (
                          <strong className="sb-canvas-speaker">{l.character}: </strong>
                        )}
                        {l.text}
                      </p>
                    ))}
                    <div className="sb-print-marks" aria-hidden="true" />
                  </li>
                ))}
              </ol>
            )}
          </section>
        );
      })}
    </article>
  );
}
