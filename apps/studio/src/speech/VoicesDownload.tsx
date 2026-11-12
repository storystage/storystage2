/**
 * The browser version's one download of the voices (spec 06 section 4.6): asked first, in plain
 * words with its size, then a progress bar. Shown under the scene view when a film's speak lines
 * need it, and in Settings › Voices. The apps bundle the voices, so they never show it.
 */
import { Button, NeutralNote } from '@storystage/ui';
import { useSyncExternalStore } from 'react';
import { words } from '../strings.ts';
import type { Voices } from './voices.ts';
import './voices.css';

const megabytes = (bytes: number) => Math.max(1, Math.round(bytes / 1_000_000));

export function VoicesDownload({ voices }: { voices: Voices }) {
  const state = useSyncExternalStore(
    (l) => voices.subscribe(l),
    () => voices.state,
  );
  if (state.status === 'downloading') {
    const { done = 0, total = 0 } = state.download ?? {};
    const percent = total > 0 ? Math.floor((done / total) * 100) : 0;
    return (
      <div className="vo-download">
        <p className="vo-download-words" role="status">
          {words.t('voices.downloading', { percent })}
        </p>
        <progress
          className="vo-progress"
          max={100}
          value={percent}
          aria-label={words.t('voices.progress')}
        />
      </div>
    );
  }
  if (state.status !== 'ask') return null;
  return (
    <NeutralNote>
      <span>
        {words.t('voices.ask', { size: megabytes(state.download?.total ?? 0) })}
        {state.problem && <> {state.problem}</>}
      </span>{' '}
      <Button variant="secondary" icon="download" onPress={() => void voices.download()}>
        {words.t(state.problem ? 'voices.tryAgain' : 'voices.download')}
      </Button>
    </NeutralNote>
  );
}
