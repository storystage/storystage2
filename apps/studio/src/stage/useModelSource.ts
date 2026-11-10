/**
 * The one model source the App passes to every stage (S2, S3, S4, S5): the shipped Backstage,
 * then the open film's packed models, then the class Backstage on this device (spec 17;
 * decisions 0049, 0066). The shipped one answers first, so nothing can stand in for a shipped
 * model. The film's copy comes before the class's: an id is never reused, and the film's is in
 * memory already.
 *
 * A film is untrusted, so its packed models are checked in the import worker before any reaches
 * the stage (spec 03 section 1.3; `checkFilmInWorker`), when a stage first prepares models. Only those that pass are shown; the others
 * show as outlines, and `refused` says which and why, in plain words.
 *
 * The source asks each Backstage in turn at every `find`, so a model the class view learns of
 * later (one imported in Settings while the tab stays mounted) is found too. Its identity never
 * changes, so a stage made with it keeps working as Backstages open and films change. Until the
 * shipped Backstage opens, or if it can't, scenes show stand-ins for its models.
 */
import {
  filmBackstage,
  openBackstage,
  openClassBackstage,
  type Backstage,
  type BackstageItem,
  type ClassBackstageView,
  type DisposableBackstage,
} from '@storystage/backstage';
import {
  checkFilmInWorker,
  type FilmCheckResult,
  type ImportWorker,
} from '@storystage/backstage-import/worker-client';
import type { HostInterface } from '@storystage/host';
import type { Production, ProductionFiles } from '@storystage/production';
import type { ModelSource } from '@storystage/stage/babylon';
import type { BackstageId } from '@storystage/story-api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { startImportWorker } from '../settings/importWorker.ts';

export type RefusedModel = FilmCheckResult['refused'][number];

export interface ModelSourceHandle {
  /** For every stage: it answers from what's open now. */
  readonly source: ModelSource;
  /** Reads these class models from the device before a stage loads them. */
  prepare(ids: readonly string[]): Promise<void>;
  /** A model's Backstage record, from the same Backstages in the same order: for credits and licences. */
  item(id: BackstageId): BackstageItem | undefined;
  /** The film's packed models that didn't pass the check, so show as outlines. */
  readonly refused: readonly RefusedModel[];
}

export interface ModelSourceOptions {
  /** For tests: how the shipped Backstage's `backstage.json` is fetched. */
  readonly fetch?: typeof globalThis.fetch;
  /** For tests: the import worker that checks a film's packed models. */
  readonly startWorker?: () => ImportWorker;
}

const NOTHING_REFUSED: readonly RefusedModel[] = [];

export function useModelSource(
  host: HostInterface,
  production: Production,
  files: ProductionFiles,
  options: ModelSourceOptions = {},
): ModelSourceHandle {
  const { fetch, startWorker = startImportWorker } = options;
  const shipped = useRef<Backstage | null>(null);
  const film = useRef<Backstage | null>(null);
  const classView = useRef<ClassBackstageView | null>(null);
  const [refused, setRefused] = useState<readonly RefusedModel[]>(NOTHING_REFUSED);

  useEffect(() => {
    let live = true;
    if (host.backstageFolder === '') return;
    openBackstage(host.backstageFolder, fetch ? { fetch } : {}).then(
      (b) => {
        if (live) shipped.current = b;
      },
      // Missing or damaged: stand-ins show, and the rough cut still plays.
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [host, fetch]);

  useEffect(() => {
    let live = true;
    let view: ClassBackstageView | null = null;
    let store;
    try {
      store = host.classes.backstage();
    } catch {
      return; // No class open on this device.
    }
    openClassBackstage(store).then(
      (v) => {
        if (!live) return v.dispose();
        view = v;
        classView.current = v;
      },
      () => undefined,
    );
    return () => {
      live = false;
      if (classView.current === view) classView.current = null;
      view?.dispose();
    };
  }, [host]);

  // The film's packed models, checked first, but only once a stage needs models (S5's review of
  // #317): a lesson that never opens the Screening room never pays for the check. A new film, or
  // new packed models, checks again; the last film's URLs go (S5: on `studio.open`).
  const models = production.manifest.models;
  const packed = files.models;
  const filmFor = useRef<{
    readonly models: typeof models;
    readonly packed: typeof packed;
    readonly ready: Promise<void>;
    made: DisposableBackstage | null;
    live: boolean;
  } | null>(null);
  const latest = useRef({ models, packed, startWorker });
  useEffect(() => {
    latest.current = { models, packed, startWorker };
    // Another film: its models are checked when a stage next asks.
    const was = filmFor.current;
    if (was && (was.models !== models || was.packed !== packed)) {
      was.live = false;
      was.made?.dispose();
      filmFor.current = null;
      film.current = null;
    }
  }, [models, packed, startWorker]);
  useEffect(
    () => () => {
      const was = filmFor.current;
      if (was) {
        was.live = false;
        was.made?.dispose();
      }
    },
    [],
  );
  /** Checks the open film's packed models once, and gives their Backstage to the source. */
  const checkFilm = useCallback((): Promise<void> => {
    const now = latest.current;
    const was = filmFor.current;
    if (was && was.models === now.models && was.packed === now.packed) return was.ready;
    const entry = {
      models: now.models,
      packed: now.packed,
      made: null as DisposableBackstage | null,
      live: true,
      ready: Promise.resolve(),
    };
    entry.ready = (
      now.models.length === 0
        ? Promise.resolve<FilmCheckResult>({ checked: [], refused: [] })
        : checkFilmInWorker(now.startWorker, now.models, now.packed)
    ).then((result) => {
      if (!entry.live) return;
      entry.made = filmBackstage(now.models, now.packed, { checked: result.checked });
      film.current = entry.made.backstage;
      setRefused(result.refused.length === 0 ? NOTHING_REFUSED : result.refused);
    });
    filmFor.current = entry;
    return entry.ready;
  }, []);

  const handle = useMemo(
    () => ({
      source: {
        find: (id: Parameters<ModelSource['find']>[0]) =>
          shipped.current?.find(id) ??
          film.current?.find(id) ??
          classView.current?.backstage.find(id) ??
          null,
      },
      item: (id: BackstageId) =>
        shipped.current?.item(id) ??
        film.current?.item(id) ??
        classView.current?.backstage.item(id),
      prepare: async (ids: readonly string[]) => {
        await checkFilm();
        await classView.current?.prepare(ids);
      },
    }),
    [checkFilm],
  );
  return useMemo(() => ({ ...handle, refused }), [handle, refused]);
}
