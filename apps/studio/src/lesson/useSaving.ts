/**
 * Saving the open film (`07-ux.md` section 9.2): autosave a moment after each change, Ctrl+S to
 * save now (a backup point), the status for the header, and a question before leaving with work
 * not yet saved. S4's `ProductionSaver` does the saving: one at a time, autosaves merged.
 *
 * Before each save, the film's class models are packed into it (S4's `packModels`, decision 0049),
 * so a film that uses an imported model carries it to any device. The files grow with the film;
 * the production packing gives is for saving only, and the studio keeps working on its own.
 */
import type {
  Production,
  ProductionFiles,
  ProductionSaver,
  SaveProblem,
} from '@storystage/production';
import { useCallback, useEffect, useRef, useState } from 'react';

/** How long after the last change an autosave waits. */
export const AUTOSAVE_AFTER_MS = 1500;

export type SaveStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'saving' }
  | {
      readonly kind: 'saved';
      readonly at: string;
      /** Class models the film uses that this device can't find, so they weren't packed. */
      readonly missing: readonly string[];
    }
  | { readonly kind: 'failed'; readonly problem: SaveProblem };

/** The open film: where it saves, and the files it opened with besides its JSON. */
export interface OpenFilm {
  readonly saver: ProductionSaver;
  readonly files: ProductionFiles;
}

/** What a save writes: the production and its files, with its class models packed in. */
export interface Packed {
  readonly production: Production;
  readonly files: ProductionFiles;
  readonly missing: readonly string[];
}

/** Packs a film's class models before it's written (`packModels` with the class Backstage). */
export type Pack = (production: Production, files: ProductionFiles) => Promise<Packed>;

/** No class Backstage to pack from: the film is written as it is. */
export const NO_PACKING: Pack = async (production, files) => ({ production, files, missing: [] });

export interface Saving {
  readonly status: SaveStatus;
  /** Saves now, unless nothing changed since the last save (an asked save always runs). */
  save(kind: 'auto' | 'asked'): Promise<boolean>;
  /** The film as a save would write it, for Save a copy: models packed, files up to date. */
  packed(): Promise<Packed>;
}

/** Autosaves `production` into `film` as it changes; nothing while `film` is null or read-only. */
export function useSaving(
  production: Production,
  film: OpenFilm | null,
  readOnly: string | null,
  pack: Pack = NO_PACKING,
): Saving {
  // The status, and the film it's for: another film's status reads as idle.
  const [shown, setShown] = useState<{ film: OpenFilm | null; status: SaveStatus }>({
    film: null,
    status: { kind: 'idle' },
  });
  const status: SaveStatus = shown.film === film ? shown.status : { kind: 'idle' };
  // The production as last saved (or as opened): a different one has changes to save.
  const saved = useRef<Production | null>(null);
  const latest = useRef(production);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The film's files and packed models as last written: they grow as class models are packed
  // into it. The studio keeps editing its own production, whose `manifest.models` stays as the
  // film opened, so packing starts from these, never from that (S4's review of #280).
  const files = useRef<ProductionFiles | null>(null);
  const models = useRef<Production['manifest']['models'] | null>(null);

  useEffect(() => {
    latest.current = production;
  });

  // A new film: what it opened with counts as saved, with the files it opened with.
  useEffect(() => {
    saved.current = latest.current;
    files.current = film?.files ?? null;
    models.current = film ? latest.current.manifest.models : null;
  }, [film]);

  const packed = useCallback(async (): Promise<Packed> => {
    const latestNow = latest.current;
    // The studio's production, with the models packed so far: a model packed on an earlier save
    // stays packed, even where the class Backstage has since lost it.
    const now = models.current
      ? { ...latestNow, manifest: { ...latestNow.manifest, models: models.current } }
      : latestNow;
    const current = files.current ?? film?.files ?? { audio: new Map(), models: new Map() };
    try {
      return await pack(now, current);
    } catch {
      // The class Backstage couldn't be read: the film is written with what it already carries,
      // its packed models and their files together.
      return { production: now, files: current, missing: [] };
    }
  }, [film, pack]);

  const save = useCallback(
    async (kind: 'auto' | 'asked') => {
      if (!film || readOnly !== null) return true;
      const now = latest.current;
      if (kind === 'auto' && now === saved.current) return true;
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      setShown({ film, status: { kind: 'saving' } });
      const toWrite = await packed();
      const outcome = await film.saver.save(toWrite.production, toWrite.files, kind);
      if (outcome.ok) {
        saved.current = now;
        files.current = toWrite.files;
        models.current = toWrite.production.manifest.models;
        setShown({
          film,
          status: { kind: 'saved', at: outcome.savedAt, missing: toWrite.missing },
        });
        return true;
      }
      setShown({ film, status: { kind: 'failed', problem: outcome.problem } });
      return false;
    },
    [film, readOnly, packed],
  );

  // Autosave a moment after the learner stops.
  useEffect(() => {
    if (!film || readOnly !== null || production === saved.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void save('auto');
    }, AUTOSAVE_AFTER_MS);
  }, [production, film, readOnly, save]);

  useEffect(
    () => () => {
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [],
  );

  // Ctrl+S (Cmd+S) saves now; the browser's own Save page never opens.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      void save('asked');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  // Leaving with work not yet saved asks first.
  const failed = status.kind === 'failed';
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!film || readOnly !== null) return;
      if (latest.current === saved.current && !failed) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [film, readOnly, failed]);

  return { status, save, packed };
}
