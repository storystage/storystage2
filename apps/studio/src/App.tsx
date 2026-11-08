import {
  browserHost,
  type BackupInfo,
  type HostInterface,
  type ProductionInfo,
  type Pupil,
  type PupilFolder,
} from '@storystage/host';
import {
  ProductionSaver,
  openFromFolder,
  openFromPicker,
  openProduction,
  saveCopy,
  type OpenedProduction,
  type Production,
  type ProductionFiles,
} from '@storystage/production';
import { Button, NeutralNote, ThemeRoot, type Mode } from '@storystage/ui';
import { useEffect, useState } from 'react';
import { FilmMenu, type FilmAction } from './lesson/FilmMenu.tsx';
import { FilmList, NamePage, OpenProblem } from './lesson/LessonPages.tsx';
import { useSaving, type OpenFilm } from './lesson/useSaving.ts';
import { ProductionStage } from './production/ProductionStage.tsx';
import { useEditorHost } from './production/editorHost.ts';
import { Shell } from './shell/Shell.tsx';
import { words } from './strings.ts';
import { newProduction } from './storyboard/edits.ts';
import { NOWHERE, currentPlace, type Place } from './storyboard/place.ts';
import { Storyboard } from './storyboard/Storyboard.tsx';
import { useStudio } from './studio.ts';

/** Where the lesson is (`07-ux.md` section 9.1): before the studio, or in it. */
type Phase =
  | { readonly kind: 'starting' }
  | { readonly kind: 'names'; readonly pupils: readonly Pupil[] }
  | { readonly kind: 'films'; readonly films: readonly ProductionInfo[] }
  | {
      readonly kind: 'problem';
      readonly key: string;
      readonly message: string;
      readonly backups: readonly BackupInfo[];
    }
  | { readonly kind: 'studio' };

const NO_FILES: ProductionFiles = { audio: new Map(), models: new Map() };

/** Whether this browser has shown the browser version's note about where films are kept. */
const BROWSER_NOTE = 'storystage.browserNote';
function browserNoteShown(): boolean {
  try {
    return window.localStorage.getItem(BROWSER_NOTE) === 'shown';
  } catch {
    return true;
  }
}
function rememberBrowserNote() {
  try {
    window.localStorage.setItem(BROWSER_NOTE, 'shown');
  } catch {
    // A browser that keeps nothing shows the note again next time, which is harmless.
  }
}

/** A film the folder couldn't read opens as broken, with S4's words for why. */
function unavailableAsBroken(result: Awaited<ReturnType<typeof openFromFolder>>): OpenedProduction {
  return result.status === 'unavailable'
    ? { status: 'broken', message: result.problem.message, problems: [result.problem.code] }
    : result;
}

/**
 * The studio. A lesson starts on the name page and the pupil's films (07-ux section 9), then
 * the three tabs on the production's own session (`studio.ts`), saved into the pupil's folder as
 * it changes. With `start` (tests, and `?example`) it opens on that production, unsaved.
 */
export function App({ start, host = browserHost }: { start?: Production; host?: HostInterface }) {
  const studio = useStudio(start ?? newProduction());
  const [phase, setPhase] = useState<Phase>(start ? { kind: 'studio' } : { kind: 'starting' });
  const [folder, setFolder] = useState<PupilFolder | null>(null);
  const [hasClass, setHasClass] = useState(false);
  const [film, setFilm] = useState<OpenFilm | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [place, setPlace] = useState<Place>(NOWHERE);
  const [mode, setMode] = useState<Mode>('storyboard');
  const [said, setSaid] = useState('');
  const editors = useEditorHost(studio.session, setSaid);
  const saving = useSaving(studio.production, film, studio.readOnly);
  const p = studio.production;

  /** Starts working on `production`, saved with `saver`. */
  const begin = (
    production: Production,
    saver: ProductionSaver,
    files: ProductionFiles,
    readOnly: string | null,
    message: string | null,
  ) => {
    studio.open(production, readOnly);
    setFilm({ saver, files });
    setPlace(NOWHERE);
    setMode('storyboard');
    let shown = message;
    // The browser version says once where its films are kept (07-ux 9.2).
    if (host.version === null && !browserNoteShown()) {
      rememberBrowserNote();
      shown = message ?? words.t('save.browserNote');
    }
    setNote(shown);
    setPhase({ kind: 'studio' });
  };

  const newFilm = (into: PupilFolder) =>
    begin(newProduction(), new ProductionSaver(into, { key: null }), NO_FILES, null, null);

  /** A film read from a folder, a backup or the picker: into the studio, or why it can't be. */
  const opened = async (into: PupilFolder, result: OpenedProduction, key: string | null) => {
    if (result.status === 'broken') {
      if (!key) return setNote(result.message);
      const backups = await into.backups(key).catch(() => []);
      return setPhase({ kind: 'problem', key, message: result.message, backups });
    }
    const readOnly = result.status === 'readOnly' ? result.message : null;
    begin(
      result.production,
      new ProductionSaver(into, { key, original: result.original, readOnly }),
      result.files,
      readOnly,
      result.status === 'migrated' ? words.t('lesson.migrated') : readOnly,
    );
  };

  const showFilms = async (into: PupilFolder) => {
    setFolder(into);
    const films = await into.list();
    if (films.length === 0) newFilm(into);
    else setPhase({ kind: 'films', films });
  };

  const backToNames = async () => {
    await host.classes.close();
    setFolder(null);
    setFilm(null);
    setPhase({ kind: 'names', pupils: await host.classes.pupils() });
  };

  // The start of a lesson: the name page with a class list, or the device's own folder.
  useEffect(() => {
    if (phase.kind !== 'starting') return;
    let gone = false;
    void (async () => {
      const pupils = await host.classes.pupils();
      if (gone) return;
      if (pupils.length > 0) {
        setHasClass(true);
        setPhase({ kind: 'names', pupils });
        return;
      }
      // `openDevice` arrives with S8's #248. Until then, a device with no class list works
      // without saving, as the studio always has.
      const classes = host.classes as typeof host.classes & {
        openDevice?: () => Promise<PupilFolder>;
      };
      if (!classes.openDevice) return setPhase({ kind: 'studio' });
      const device = await classes.openDevice();
      if (!gone) await showFilms(device);
    })();
    return () => {
      gone = true;
    };
    // This runs as a lesson starts; `host` and the helpers stay the same for the lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind]);

  const onFilmAction = async (action: FilmAction) => {
    if (!folder) return;
    if (action === 'saveCopy') {
      const copied = await saveCopy(host.picker, p, film?.files ?? NO_FILES);
      if (!copied.ok && copied.problem.code !== 'cancelled') setNote(copied.problem.message);
      return;
    }
    if (action === 'openCopy') {
      const picked = await openFromPicker(host.picker);
      if ('problem' in picked) {
        if (picked.problem.code !== 'cancelled') setNote(picked.problem.message);
        return;
      }
      await saving.save('auto');
      // A copy opens as a new film in this folder, so the file picked is never changed.
      return opened(folder, picked, null);
    }
    await saving.save('auto');
    if (action === 'new') return newFilm(folder);
    if (action === 'myFilms') return showFilms(folder);
    return backToNames();
  };

  if (phase.kind !== 'studio') {
    return (
      <ThemeRoot>
        <div className="ls-shell">
          {phase.kind === 'names' && (
            <NamePage
              pupils={phase.pupils}
              onChoose={(id) => void host.classes.open(id).then(showFilms)}
            />
          )}
          {phase.kind === 'films' && folder && (
            <FilmList
              pupilName={folder.pupil.name || null}
              films={phase.films}
              onNew={() => newFilm(folder)}
              onOpen={(key) =>
                void openFromFolder(folder, key).then((r) =>
                  opened(folder, unavailableAsBroken(r), key),
                )
              }
              onSwitch={hasClass ? () => void backToNames() : undefined}
            />
          )}
          {phase.kind === 'problem' && folder && (
            <OpenProblem
              message={phase.message}
              backups={phase.backups}
              onOpenBackup={(index) =>
                void folder
                  .readBackup(phase.key, index)
                  .then((bytes) => opened(folder, openProduction(bytes), phase.key))
                  .catch(() => setPhase({ ...phase, message: words.t('lesson.cantOpen') }))
              }
              onBack={() => void showFilms(folder)}
            />
          )}
        </div>
      </ThemeRoot>
    );
  }

  const title = p.manifest.title.trim() || words.t('storyboard.untitled');
  const status =
    saving.status.kind === 'saving'
      ? words.t('save.saving')
      : saving.status.kind === 'saved'
        ? words.t('save.saved')
        : null;
  const failed = saving.status.kind === 'failed' ? saving.status.problem.message : null;
  return (
    <ThemeRoot>
      <Shell
        title={
          folder ? (
            <FilmMenu
              title={title}
              pupilName={folder.pupil.name || null}
              canSwitch={hasClass}
              onAction={(action) => void onFilmAction(action)}
            />
          ) : (
            title
          )
        }
        subtitle={status && <span role="status">{status}</span>}
        notice={
          failed ? (
            <NeutralNote>
              <span role="alert">{failed}</span>{' '}
              <Button variant="secondary" icon="history" onPress={() => void saving.save('asked')}>
                {words.t('save.tryAgain')}
              </Button>
            </NeutralNote>
          ) : note ? (
            <NeutralNote>{note}</NeutralNote>
          ) : undefined
        }
        mode={mode}
        onModeChange={(next) => {
          // Changing tab is a moment to save.
          void saving.save('auto');
          setMode(next);
        }}
        panels={{
          storyboard: <Storyboard studio={studio} place={place} onPlaceChange={setPlace} />,
          production: (
            <ProductionStage
              production={p}
              scene={currentPlace(p, place).scene}
              host={editors}
              onGoToStoryboard={() => setMode('storyboard')}
              announcement={said}
            />
          ),
          screening: null,
        }}
      />
    </ThemeRoot>
  );
}
