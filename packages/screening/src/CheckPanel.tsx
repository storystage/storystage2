/**
 * **Check the whole film** in the Screening room (spec 08 section 9.1, WP11c): under Compare, a
 * button that runs the automatic check over every scene, its progress, and every current flag in
 * plain words, each of which the learner can keep. The words are drawn as plain text: in a file
 * edited by hand they could say anything (section 9.6).
 */
import { checkState } from '@storystage/check';
import type { FrameId, Production } from '@storystage/production';
import { Button } from '@storystage/ui';
import { framesInOrder } from './Compare.tsx';
import { words } from './strings.ts';

/** A flag on a frame whose result is current. */
export interface FilmFlag {
  readonly frame: FrameId;
  /** "2.1" */
  readonly frameNumber: string;
  readonly id: string;
  readonly words: string;
  readonly kept: boolean;
}

/** Every current flag in running order, and how many frames have no current result. */
export function filmFlags(production: Production): {
  readonly flags: readonly FilmFlag[];
  readonly unchecked: number;
} {
  const flags: FilmFlag[] = [];
  let unchecked = 0;
  for (const frame of framesInOrder(production)) {
    const state = checkState(frame, production);
    if (!state || state.stale || !frame.check) {
      unchecked++;
      continue;
    }
    const scene = production.manifest.runningOrder.findIndex((r) => r.scene === frame.scene) + 1;
    const kept = new Set(frame.check.kept);
    for (const item of frame.check.items)
      if (item.outcome === 'flag')
        flags.push({
          frame: frame.id,
          frameNumber: `${scene}.${frame.order + 1}`,
          id: item.id,
          words: item.words,
          kept: kept.has(item.id),
        });
  }
  return { flags, unchecked };
}

export interface CheckPanelProps {
  readonly production: Production;
  /** While a check runs: frames done of frames to do. */
  readonly running: { readonly done: number; readonly total: number } | null;
  onCheck(): void;
  /** Keep a flag, or let it go: the learner's own undoable step. */
  onKeep(frame: FrameId, itemId: string, keep: boolean): void;
  /** A film that can't be changed can't keep a result either: no check, no keeping. */
  readonly readOnly?: boolean;
}

export function CheckPanel(props: CheckPanelProps) {
  const { production: p, running } = props;
  const { flags, unchecked } = filmFlags(p);
  const frames = framesInOrder(p).length;
  return (
    <section className="sr-check" aria-labelledby="sr-check-title">
      <h2 id="sr-check-title" className="sr-side-title">
        {words.t('check.title')}
      </h2>
      <Button
        variant="secondary"
        icon="check_circle"
        isDisabled={running !== null || frames === 0 || props.readOnly}
        onPress={props.onCheck}
      >
        {words.t('check.run')}
      </Button>
      {running && (
        <p className="sr-side-note" role="status">
          {words.t('check.running', { done: running.done, total: running.total })}
        </p>
      )}
      {frames === 0 && <p className="sr-side-note">{words.t('check.noFrames')}</p>}
      {!running && unchecked > 0 && frames > 0 && (
        <p className="sr-side-note">{words.plural('check.unchecked', unchecked)}</p>
      )}
      {flags.length > 0 && (
        <ul className="sr-check-flags">
          {flags.map((f) => (
            <li key={`${f.frame}/${f.id}`} data-kept={f.kept || undefined}>
              <span>{words.t('check.flag', { frame: f.frameNumber, words: f.words })}</span>
              {!props.readOnly && (
                <Button
                  variant="quiet"
                  aria-label={words.t(f.kept ? 'check.keptLabel' : 'check.keepLabel', {
                    frame: f.frameNumber,
                  })}
                  onPress={() => props.onKeep(f.frame, f.id, !f.kept)}
                >
                  {words.t(f.kept ? 'check.kept' : 'check.keep')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!running && frames > 0 && unchecked === 0 && flags.length === 0 && (
        <p className="sr-side-note">{words.t('check.allGood')}</p>
      )}
    </section>
  );
}
