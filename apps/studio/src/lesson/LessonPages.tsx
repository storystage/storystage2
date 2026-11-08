/**
 * The start of a lesson (`07-ux.md` section 9.1): the name page, the pupil's films, and what shows
 * when a film can't be opened. Full-screen pages before the studio, inside the shell's amber frame.
 */
import type { BackupInfo, ProductionInfo, Pupil, PupilId } from '@storystage/host';
import { Button, Icon, TextField } from '@storystage/ui';
import { useState } from 'react';
import { GridList, GridListItem, type Key } from 'react-aria-components';
import { words } from '../strings.ts';

const ago = new Intl.RelativeTimeFormat('en-GB', { numeric: 'auto' });

/** "10 minutes ago", "yesterday": how long since `iso`, in the largest unit that fits. */
export function sinceWords(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600],
    ['month', 30 * 24 * 3600],
    ['week', 7 * 24 * 3600],
    ['day', 24 * 3600],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of units)
    if (Math.abs(seconds) >= size) return ago.format(Math.round(seconds / size), unit);
  return ago.format(0, 'minute');
}

/** "Who's making films today?": every pupil's name as a large button, with a search. */
export function NamePage({
  pupils,
  problem = null,
  onChoose,
}: {
  pupils: readonly Pupil[];
  /** Why the last name chosen couldn't be opened. */
  problem?: string | null;
  onChoose: (pupil: PupilId) => void;
}) {
  const [search, setSearch] = useState('');
  const sorted = [...pupils].sort((a, b) => a.name.localeCompare(b.name, 'en-GB'));
  const wanted = search.trim().toLocaleLowerCase('en-GB');
  const shown = wanted
    ? sorted.filter((p) => p.name.toLocaleLowerCase('en-GB').includes(wanted))
    : sorted;
  return (
    <main className="ls-page" aria-labelledby="ls-title">
      <h1 id="ls-title" className="ls-title">
        {words.t('lesson.whoToday')}
      </h1>
      {problem && (
        <p role="alert" className="ls-problem">
          {problem}
        </p>
      )}
      <div className="ls-search">
        <TextField
          label={words.t('lesson.searchNames')}
          hideLabel
          placeholder={words.t('lesson.searchNames')}
          value={search}
          onChange={setSearch}
        />
      </div>
      {shown.length > 0 ? (
        <GridList
          className="ls-names"
          aria-label={words.t('lesson.names')}
          layout="grid"
          items={shown}
          onAction={(key: Key) => onChoose(String(key))}
        >
          {(p) => (
            <GridListItem id={p.id} textValue={p.name} className="ls-name">
              <Icon name="person" />
              <span>{p.name}</span>
            </GridListItem>
          )}
        </GridList>
      ) : (
        <p className="ls-note">{words.t('lesson.noMatch')}</p>
      )}
      <p className="ls-note">{words.t('lesson.notOnList')}</p>
    </main>
  );
}

const NEW = 'new';

/** The pupil's films, newest first, with New film first. */
export function FilmList({
  pupilName,
  films,
  onNew,
  onOpen,
  onSwitch,
}: {
  /** `null` for the device's own folder. */
  pupilName: string | null;
  films: readonly ProductionInfo[];
  onNew: () => void;
  onOpen: (key: string) => void;
  /** Back to the name page; absent without a class list. */
  onSwitch?: () => void;
}) {
  const newest = [...films].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  const items = [{ key: NEW, name: words.t('lesson.newFilm'), savedAt: '' }, ...newest];
  return (
    <main className="ls-page" aria-labelledby="ls-title">
      <h1 id="ls-title" className="ls-title">
        {pupilName ? words.t('lesson.filmsOf', { name: pupilName }) : words.t('lesson.films')}
      </h1>
      <GridList
        className="ls-films"
        aria-label={words.t('lesson.films')}
        layout="grid"
        items={items.map((f) => ({ id: f.key, ...f }))}
        onAction={(key: Key) => (key === NEW ? onNew() : onOpen(String(key)))}
      >
        {(f) => (
          <GridListItem
            id={f.id}
            textValue={f.name}
            className="ls-film"
            data-new={f.id === NEW || undefined}
          >
            <Icon name={f.id === NEW ? 'add' : 'movie'} />
            <span className="ls-film-name">{f.name}</span>
            {f.savedAt && (
              <span className="ls-film-when">
                {words.t('lesson.savedWhen', { when: sinceWords(f.savedAt) })}
              </span>
            )}
          </GridListItem>
        )}
      </GridList>
      {onSwitch && (
        <Button variant="quiet" icon="arrow_back" onPress={onSwitch}>
          {words.t('film.switchPupil')}
        </Button>
      )}
    </main>
  );
}

/** The class list or the films' folder couldn't be read: why, and Try again. */
export function FolderProblem({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="ls-page" aria-labelledby="ls-title">
      <h1 id="ls-title" className="ls-title">
        {words.t('lesson.films')}
      </h1>
      <p role="alert" className="ls-problem">
        {message}
      </p>
      <Button variant="secondary" icon="history" onPress={onRetry}>
        {words.t('lesson.tryAgain')}
      </Button>
    </main>
  );
}

/** A film that couldn't be opened: why, in S4's words, and its earlier versions to open instead. */
export function OpenProblem({
  message,
  backups,
  onOpenBackup,
  onBack,
}: {
  message: string;
  backups: readonly BackupInfo[];
  onOpenBackup: (index: number) => void;
  onBack: () => void;
}) {
  return (
    <main className="ls-page" aria-labelledby="ls-title">
      <h1 id="ls-title" className="ls-title">
        {words.t('lesson.cantOpen')}
      </h1>
      <p role="alert" className="ls-problem">
        {message}
      </p>
      <h2 className="ls-subtitle">{words.t('lesson.earlier')}</h2>
      {backups.length > 0 ? (
        <ul className="ls-backups">
          {backups.map((b) => (
            <li key={b.index}>
              <Button variant="secondary" icon="history" onPress={() => onOpenBackup(b.index)}>
                {words.t('lesson.openEarlier', { when: sinceWords(b.savedAt) })}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ls-note">{words.t('lesson.noEarlier')}</p>
      )}
      <Button variant="quiet" icon="arrow_back" onPress={onBack}>
        {words.t('lesson.backToFilms')}
      </Button>
    </main>
  );
}
