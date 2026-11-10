import type { NodeId } from '@storystage/ast';
import {
  FILE_LIMIT,
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
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { importAliceInWorker, type ImportWorker } from '@storystage/a3p-import/worker-client';
import type { ImportReport } from '@storystage/a3p-import';
import { AliceReport } from './lesson/AliceReport.tsx';
import { NO_ALICE_MODELS, startAliceWorker } from './lesson/aliceWorker.ts';
import { FilmMenu, type FilmAction } from './lesson/FilmMenu.tsx';
import { FilmList, FolderProblem, NamePage, OpenProblem } from './lesson/LessonPages.tsx';
import { classPacking } from './lesson/packing.ts';
import { useSaving, type OpenFilm } from './lesson/useSaving.ts';
import { useStorageKept } from './lesson/useStorageKept.ts';
import { ProductionStage } from './production/ProductionStage.tsx';
import { useEditorHost } from './production/editorHost.ts';
import { ClassSetup } from './settings/ClassSetup.tsx';
import { Shell } from './shell/Shell.tsx';
import { words } from './strings.ts';
import { newProduction } from './storyboard/edits.ts';
import { NOWHERE, currentPlace, type Place } from './storyboard/place.ts';
import { Storyboard } from './storyboard/Storyboard.tsx';
import { useStudio } from './studio.ts';

/** Where the lesson is (`07-ux.md` section 9.1): before the studio, or in it. */
type Phase =
  | { readonly kind: 'starting' }
  | { readonly kind: 'names'; readonly pupils: readonly Pupil[]; readonly problem?: string }
  | { readonly kind: 'unavailable'; readonly message: string }
  | { readonly kind: 'films'; readonly films: readonly ProductionInfo[] }
  | {
      readonly kind: 'problem';
      readonly key: string;
      readonly message: string;
      readonly backups: readonly BackupInfo[];
    }
  | { readonly kind: 'settings' }
  | { readonly kind: 'studio' };

const NO_FILES: ProductionFiles = { audio: new Map(), models: new Map() };

/**
 * The Screening tab (S2), loaded when it's first opened, so Babylon.js, the runtime's worker and
 * the encoder aren't in the studio's first download.
 */
const ScreeningTab = lazy(() =>
  import('./screening/ScreeningTab.tsx').then((m) => ({ default: m.ScreeningTab })),
);

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

/**
 * Which class models a film uses that this device doesn't have, by name: the last part of each id
 * (`class/Biped/big-robot` is "big robot"), up to three, then how many more (S4's review of #280).
 */
export function missingWords(ids: readonly string[]): string {
  const names = ids.map((id) => (id.split('/').pop() ?? id).replace(/-/g, ' '));
  const shown = names.slice(0, 3).join(', ');
  const more = names.length - 3;
  return words.t('save.missing', {
    names: more > 0 ? words.plural('save.missingMore', more, { names: shown }) : shown,
  });
}

/** The host's `FileError` code, if `error` is one. */
const codeOf = (error: unknown) => (error as { code?: unknown } | null)?.code;

/** Why the class list or a films' folder couldn't be opened, in plain words. */
const folderProblem = (error: unknown) =>
  codeOf(error) === 'full' ? words.t('lesson.folderFull') : words.t('lesson.folderProblem');

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
export function App({
  start,
  host = browserHost,
  startAlice = startAliceWorker,
}: {
  start?: Production;
  host?: HostInterface;
  /** A fresh worker for opening an Alice world; tests pass their own. */
  startAlice?: () => ImportWorker;
}) {
  const studio = useStudio(start ?? newProduction());
  const [phase, setPhase] = useState<Phase>(start ? { kind: 'studio' } : { kind: 'starting' });
  const [folder, setFolder] = useState<PupilFolder | null>(null);
  const [hasClass, setHasClass] = useState(false);
  const [film, setFilm] = useState<OpenFilm | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [place, setPlace] = useState<Place>(NOWHERE);
  const [mode, setMode] = useState<Mode>('storyboard');
  // Learn or Settings over the panels: the Screening room pauses under them.
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [said, setSaid] = useState('');
  // A block for the Code editor to open at (Screening's Fix), until the learner leaves the tab.
  const [reveal, setReveal] = useState<{ node: NodeId; n: number } | null>(null);
  // What came across from the Alice world just opened, until it's read and closed.
  const [alice, setAlice] = useState<{ title: string; report: ImportReport } | null>(null);
  const aliceInput = useRef<HTMLInputElement>(null);
  const editors = useEditorHost(studio.session, setSaid);
  // One packer for the host: a new one each render would make every save look new to useSaving.
  const pack = useMemo(() => classPacking(host), [host]);
  const saving = useSaving(studio.production, film, studio.readOnly, pack);
  const storageKept = useStorageKept(host);
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
  const opened = async (
    into: PupilFolder,
    result: OpenedProduction,
    key: string | null,
    saveAtOnce = false,
  ) => {
    if (result.status === 'broken') {
      if (!key) return setNote(result.message);
      const backups = await into.backups(key).catch(() => []);
      return setPhase({ kind: 'problem', key, message: result.message, backups });
    }
    const readOnly = result.status === 'readOnly' ? result.message : null;
    const saver = new ProductionSaver(into, { key, original: result.original, readOnly });
    let message = result.status === 'migrated' ? words.t('lesson.migrated') : readOnly;
    // An earlier version opened in place of a broken film becomes the film at once: the broken
    // one is kept as a backup, and the next lesson opens this one. An Alice world, opened as a
    // new film, is saved at once too, so it's in My films straight away.
    if (saveAtOnce && readOnly === null) {
      const saved = await saver.save(result.production, result.files, 'asked');
      if (!saved.ok) message = saved.problem.message;
    }
    begin(result.production, saver, result.files, readOnly, message);
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
    const start = async (tries: number): Promise<void> => {
      const pupils = await host.classes.pupils();
      if (gone) return;
      if (pupils.length > 0) {
        setHasClass(true);
        setPhase({ kind: 'names', pupils });
        return;
      }
      try {
        const device = await host.classes.openDevice();
        if (!gone) await showFilms(device);
      } catch (error) {
        // A name added since (another window, or Settings on this device): the name page.
        if (codeOf(error) === 'invalid' && tries > 0) return start(tries - 1);
        throw error;
      }
    };
    start(1).catch((error: unknown) => {
      if (!gone) setPhase({ kind: 'unavailable', message: folderProblem(error) });
    });
    return () => {
      gone = true;
    };
    // This runs as a lesson starts; `host` and the helpers stay the same for the lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind]);

  const choosePupil = (id: string, pupils: readonly Pupil[]) =>
    void host.classes
      .open(id)
      .then(showFilms)
      .catch((error: unknown) =>
        setPhase({ kind: 'names', pupils, problem: folderProblem(error) }),
      );

  const onFilmAction = async (action: FilmAction) => {
    if (!folder) return;
    if (action === 'saveCopy') {
      // A copy carries the film's class models too, so it opens on any device.
      const copy = await saving.packed();
      const copied = await saveCopy(host.picker, copy.production, copy.files);
      if (!copied.ok && copied.problem.code !== 'cancelled') setNote(copied.problem.message);
      return;
    }
    if (action === 'openAlice') {
      // The file is picked first; the film open now is saved once the world has come in.
      aliceInput.current?.click();
      return;
    }
    if (action === 'openCopy') {
      const picked = await openFromPicker(host.picker);
      if ('problem' in picked) {
        if (picked.problem.code !== 'cancelled') setNote(picked.problem.message);
        return;
      }
      if (!(await saving.save('auto'))) return;
      // A copy opens as a new film in this folder, so the file picked is never changed.
      return opened(folder, picked, null);
    }
    // A film whose save failed stays open: its words show with Try again, and nothing is lost.
    if (!(await saving.save('auto'))) return;
    if (action === 'new') return newFilm(folder);
    if (action === 'myFilms') return showFilms(folder);
    return backToNames();
  };

  /** An .a3p the learner picked: imported in S6's worker, then opened as a new film. */
  const openAlice = async (file: File | undefined) => {
    if (!file || !folder) return;
    if (file.size > FILE_LIMIT) return setNote(words.t('alice.tooBig'));
    const bytes = new Uint8Array(await file.arrayBuffer());
    setNote(words.t('alice.opening'));
    const result = await importAliceInWorker(startAlice, bytes, file.name, NO_ALICE_MODELS);
    if (!result.ok) return setNote(result.problem.message);
    // This film's save failed: it stays open, with the failure's words in place of "Opening…".
    if (!(await saving.save('auto'))) return setNote(null);
    const files = { audio: new Map(), models: new Map() };
    await opened(
      folder,
      { status: 'ok', production: result.production, files, message: null, original: null },
      null,
      true,
    );
    setAlice({ title: result.production.manifest.title, report: result.report });
  };

  if (phase.kind !== 'studio') {
    return (
      <ThemeRoot>
        <div className="ls-shell">
          {phase.kind === 'names' && (
            <NamePage
              pupils={phase.pupils}
              problem={phase.problem}
              onChoose={(id) => choosePupil(id, phase.pupils)}
              onSettings={() => setPhase({ kind: 'settings' })}
            />
          )}
          {phase.kind === 'settings' && (
            <main className="ls-settings" aria-labelledby="ls-settings-title">
              <h1 id="ls-settings-title" className="ls-title">
                {words.t('shell.settings.title')}
              </h1>
              <Button
                variant="quiet"
                icon="arrow_back"
                onPress={() => setPhase({ kind: 'starting' })}
              >
                {words.t('lesson.backToNames')}
              </Button>
              <ClassSetup host={host} />
            </main>
          )}
          {phase.kind === 'unavailable' && (
            <FolderProblem message={phase.message} onRetry={() => setPhase({ kind: 'starting' })} />
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
              onSwitch={
                hasClass
                  ? () =>
                      void backToNames().catch((error: unknown) =>
                        setPhase({ kind: 'unavailable', message: folderProblem(error) }),
                      )
                  : undefined
              }
            />
          )}
          {phase.kind === 'problem' && folder && (
            <OpenProblem
              message={phase.message}
              backups={phase.backups}
              onOpenBackup={(index) =>
                void folder
                  .readBackup(phase.key, index)
                  .then((bytes) => opened(folder, openProduction(bytes), phase.key, true))
                  .catch(() => setPhase({ ...phase, message: words.t('lesson.cantOpen') }))
              }
              onBack={() =>
                void showFilms(folder).catch((error: unknown) =>
                  setPhase({ kind: 'unavailable', message: folderProblem(error) }),
                )
              }
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
  const missing = saving.status.kind === 'saved' ? saving.status.missing : [];
  return (
    <ThemeRoot>
      <input
        ref={aliceInput}
        type="file"
        accept=".a3p"
        hidden
        aria-label={words.t('alice.file')}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          void openAlice(file).catch((error: unknown) => setNote(folderProblem(error)));
        }}
      />
      {alice && (
        <AliceReport title={alice.title} report={alice.report} onClose={() => setAlice(null)} />
      )}
      <Shell
        onOverlayChange={setOverlayOpen}
        title={
          folder ? (
            <FilmMenu
              title={title}
              pupilName={folder.pupil.name || null}
              canSwitch={hasClass}
              onAction={(action) =>
                void onFilmAction(action).catch((error: unknown) => setNote(folderProblem(error)))
              }
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
          ) : note || missing.length > 0 ? (
            <>
              {missing.length > 0 && <NeutralNote>{missingWords(missing)}</NeutralNote>}
              {note && (
                <NeutralNote>
                  {note}
                  {/* The browser's one note also says when the browser may clear films. */}
                  {note === words.t('save.browserNote') &&
                    storageKept === false &&
                    ` ${words.t('save.mayClear')}`}
                </NeutralNote>
              )}
            </>
          ) : undefined
        }
        mode={mode}
        onModeChange={(next) => {
          // Changing tab is a moment to save.
          void saving.save('auto');
          // The learner chose a tab: a block Fix asked to show is no longer wanted.
          setReveal(null);
          setMode(next);
        }}
        settings={
          <ClassSetup
            host={host}
            open={{ pupil: folder?.pupil.id ?? null, film: film?.saver.key ?? null }}
          />
        }
        panels={{
          storyboard: <Storyboard studio={studio} place={place} onPlaceChange={setPlace} />,
          production: (
            <ProductionStage
              production={p}
              scene={currentPlace(p, place).scene}
              host={editors}
              onGoToStoryboard={() => setMode('storyboard')}
              announcement={said}
              reveal={reveal}
            />
          ),
          screening: (
            <Suspense fallback={null}>
              <ScreeningTab
                studio={studio}
                host={host}
                files={film?.files ?? NO_FILES}
                active={!overlayOpen}
                onPlaceChange={setPlace}
                onOpenProductionStage={(node, at) => {
                  if (at) setPlace(at);
                  setReveal((r) => ({ node, n: (r?.n ?? 0) + 1 }));
                  setMode('production');
                }}
              />
            </Suspense>
          ),
        }}
      />
    </ThemeRoot>
  );
}
