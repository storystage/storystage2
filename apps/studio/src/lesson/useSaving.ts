/**
 * Saving the open film (`07-ux.md` section 9.2): autosave a moment after each change, Ctrl+S to
 * save now (a backup point), the status for the header, and a question before leaving with work
 * not yet saved. S4's `ProductionSaver` does the saving: one at a time, autosaves merged.
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
  | { readonly kind: 'saved'; readonly at: string }
  | { readonly kind: 'failed'; readonly problem: SaveProblem };

/** The open film: where it saves, and the files it carries besides its JSON. */
export interface OpenFilm {
  readonly saver: ProductionSaver;
  readonly files: ProductionFiles;
}

export interface Saving {
  readonly status: SaveStatus;
  /** Saves now, unless nothing changed since the last save (an asked save always runs). */
  save(kind: 'auto' | 'asked'): Promise<boolean>;
}

/** Autosaves `production` into `film` as it changes; nothing while `film` is null or read-only. */
export function useSaving(
  production: Production,
  film: OpenFilm | null,
  readOnly: string | null,
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

  useEffect(() => {
    latest.current = production;
  });

  // A new film: what it opened with counts as saved.
  useEffect(() => {
    saved.current = latest.current;
  }, [film]);

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
      const outcome = await film.saver.save(now, film.files, kind);
      if (outcome.ok) {
        saved.current = now;
        setShown({ film, status: { kind: 'saved', at: outcome.savedAt } });
        return true;
      }
      setShown({ film, status: { kind: 'failed', problem: outcome.problem } });
      return false;
    },
    [film, readOnly],
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

  return { status, save };
}
