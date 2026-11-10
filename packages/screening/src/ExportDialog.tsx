import { bylineFor, estimateBytes, type Resolution } from '@storystage/export';
import type { Timeline } from '@storystage/playback';
import type { Production } from '@storystage/production';
import { Button, Dialog, NeutralNote, Segmented, TextField, Toggle } from '@storystage/ui';
import { useState } from 'react';
import type { FilmFlag } from './CheckPanel.tsx';
import type { ExportJobState } from './export-job.ts';
import { words } from './strings.ts';

/** What the learner chooses before exporting. */
export interface ExportChoices {
  readonly titleCard: boolean;
  readonly byline: string;
  readonly captionsOnPicture: boolean;
  readonly resolution: Resolution;
}

export interface ExportDialogProps {
  readonly isOpen: boolean;
  onOpenChange(isOpen: boolean): void;
  readonly production: Production;
  /** The measured film, for its length and the scenes that wait; `null` while measuring. */
  readonly timeline: Timeline | null;
  /** Why the film can't leave the school (non-commercial or unchecked models), in plain words. */
  readonly refusals: readonly string[];
  readonly job: ExportJobState;
  /**
   * The whole-film check, which runs before Export and lists its flags; the learner can export
   * anyway (spec 08 sections 4 and 9.1). `null` before it has run.
   */
  readonly check?:
    | { readonly kind: 'checking' }
    | { readonly kind: 'ready'; readonly flags: readonly FilmFlag[] }
    | null;
  onExport(choices: ExportChoices): void;
  onStop(): void;
  onSaveAgain(): void;
}

const STEPS = ['frames', 'credits', 'saving'] as const;

/** The flags the learner hasn't kept: those are the ones to look at before exporting. */
const open = (flags: readonly FilmFlag[]) => flags.filter((f) => !f.kept);

/** "About 21 MB". */
function size(bytes: number): string {
  const mb = Math.round(bytes / 1_000_000);
  return mb < 1 ? words.t('export.underOne') : words.t('export.megabytes', { n: mb });
}

function timeLeft(seconds: number): string {
  if (seconds < 60) return words.t('export.secondsLeft', { n: Math.max(1, seconds) });
  return words.plural('export.minutesLeft', Math.round(seconds / 60));
}

/**
 * Export film (WP11.3, spec 08 section 4; Direction A screen 09): the choices, the reasons it can't
 * go, the size, then the three steps with the time left. **Keep working** closes the dialog while
 * the export goes on; opening it again shows where it is.
 */
export function ExportDialog(props: ExportDialogProps) {
  const { production: p, timeline, job } = props;
  const [titleCard, setTitleCard] = useState(true);
  const [byline, setByline] = useState(() => bylineFor(p.manifest.credits?.names ?? []));
  const [captionsOnPicture, setCaptions] = useState(true);
  const [resolution, setResolution] = useState<Resolution>('720p');
  const running = job.kind === 'running';
  const order = p.manifest.runningOrder.map((r) => r.scene);
  const waiting = (timeline?.scenes ?? []).filter((s) => s.waits);
  const seconds = (timeline?.length ?? 0) / 1_000_000 + (titleCard ? 4 : 0);
  const canStart = timeline !== null && props.refusals.length === 0 && !running;

  return (
    <Dialog
      isOpen={props.isOpen}
      onOpenChange={props.onOpenChange}
      title={words.t('export.title')}
      icon="movie"
    >
      <div className="sr-export">
        {props.refusals.length > 0 && (
          <NeutralNote>
            <span role="status">{words.t('export.refused')}</span>
            <ul>
              {props.refusals.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </NeutralNote>
        )}
        {props.check?.kind === 'checking' && (
          <NeutralNote>
            <span role="status">{words.t('export.checking')}</span>
          </NeutralNote>
        )}
        {props.check?.kind === 'ready' && (
          <NeutralNote>
            {open(props.check.flags).length > 0 ? (
              <>
                {words.plural('export.flags', open(props.check.flags).length)}
                <ul>
                  {open(props.check.flags).map((f) => (
                    <li key={`${f.frame}/${f.id}`}>
                      {words.t('check.flag', { frame: f.frameNumber, words: f.words })}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              words.t('export.noFlags')
            )}
          </NeutralNote>
        )}
        {[...new Set(waiting.map((s) => s.scene))].map((scene) => (
          <NeutralNote key={scene}>
            {words.t('export.waits', { n: order.indexOf(scene) + 1 })}
          </NeutralNote>
        ))}

        <Toggle isSelected={titleCard} onChange={setTitleCard} isDisabled={running}>
          {words.t('export.titleCard')}
        </Toggle>
        <TextField
          label={words.t('export.byline')}
          placeholder={words.t('export.bylinePlaceholder')}
          value={byline}
          onChange={setByline}
          isDisabled={running || !titleCard}
        />
        <Toggle isSelected={captionsOnPicture} onChange={setCaptions} isDisabled={running}>
          {words.t('export.captions')}
        </Toggle>
        <p className="sr-export-note">{words.t('export.captionsNote')}</p>
        <Segmented
          label={words.t('export.resolution')}
          options={[
            { id: '720p', label: words.t('export.720p') },
            { id: '1080p', label: words.t('export.1080p') },
          ]}
          value={resolution}
          onChange={setResolution}
          isDisabled={running}
        />
        {timeline && (
          <p className="sr-export-note">
            {words.t('export.size', { size: size(estimateBytes(seconds, resolution)) })}
          </p>
        )}

        {job.kind === 'running' && (
          <div className="sr-export-progress">
            <ol className="sr-export-steps">
              {STEPS.map((step) => (
                <li key={step} aria-current={step === job.step ? 'step' : undefined}>
                  {words.t(`export.step.${step}`)}
                </li>
              ))}
            </ol>
            <div
              className="sr-export-bar"
              role="progressbar"
              aria-label={words.t('export.progress')}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(job.fraction * 100)}
            >
              <span style={{ width: `${Math.round(job.fraction * 100)}%` }} />
            </div>
            {job.secondsLeft !== null && <p role="status">{timeLeft(job.secondsLeft)}</p>}
          </div>
        )}
        {job.kind === 'done' && (
          <NeutralNote>
            <span role="status">{words.t('export.done', { name: job.name })}</span>
            {job.capped && <> {words.t('export.capped')}</>}
          </NeutralNote>
        )}
        {job.kind === 'unsaved' && (
          <NeutralNote>
            <span role="status">{words.t('export.unsaved', { name: job.name })}</span>
          </NeutralNote>
        )}
        {job.kind === 'refused' && (
          <NeutralNote>
            <span role="alert">{job.reasons.join(' ')}</span>
          </NeutralNote>
        )}
        {job.kind === 'failed' && (
          <NeutralNote>
            <span role="alert">{job.words}</span>
          </NeutralNote>
        )}

        <div className="sr-export-actions">
          {running ? (
            <>
              <Button variant="stop" icon="stop" onPress={props.onStop}>
                {words.t('export.stop')}
              </Button>
              <Button variant="secondary" onPress={() => props.onOpenChange(false)}>
                {words.t('export.keepWorking')}
              </Button>
            </>
          ) : job.kind === 'unsaved' ? (
            <Button variant="primary" icon="download" onPress={props.onSaveAgain}>
              {words.t('export.saveAgain')}
            </Button>
          ) : (
            <Button
              variant="primary"
              icon="movie"
              isDisabled={!canStart}
              onPress={() => props.onExport({ titleCard, byline, captionsOnPicture, resolution })}
            >
              {job.kind === 'failed' ? words.t('export.again') : words.t('export.start')}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
