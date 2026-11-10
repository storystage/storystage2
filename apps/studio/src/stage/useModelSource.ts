/**
 * The one model source the App passes to every stage (S2, S3, S4, S5): the shipped Backstage,
 * then the class Backstage on this device (`combineBackstages`, spec 17), shipped first so
 * nothing can stand in for a shipped model.
 *
 * Not yet the open film's packed models (decision 0049). A packed model is an import, checked in
 * the import worker before it reaches the stage (spec 03 section 1.3), and that checked path
 * isn't there yet (asked of S4). Until it is, a film's imported models show from the class
 * Backstage on this device, or as stand-ins on another.
 *
 * The source's identity never changes, so a stage made with it keeps working as Backstages open:
 * it always answers from what's open now. Until the shipped Backstage opens, or if it can't,
 * scenes show stand-ins for its models.
 */
import {
  MANIFEST_VERSION,
  backstageFrom,
  combineBackstages,
  openBackstage,
  openClassBackstage,
  type Backstage,
  type ClassBackstageView,
} from '@storystage/backstage';
import type { HostInterface } from '@storystage/host';
import type { ModelSource } from '@storystage/stage/babylon';
import { useEffect, useMemo, useRef, useState } from 'react';

const EMPTY: Backstage = backstageFrom({ manifestVersion: MANIFEST_VERSION, items: [] }, '');

export interface ModelSourceHandle {
  /** For every stage: it answers from what's open now. */
  readonly source: ModelSource;
  /** Reads these class models from the device before a stage loads them. */
  prepare(ids: readonly string[]): Promise<void>;
}

export interface ModelSourceOptions {
  /** For tests: how the shipped Backstage's `backstage.json` is fetched. */
  readonly fetch?: typeof globalThis.fetch;
}

export function useModelSource(
  host: HostInterface,
  options: ModelSourceOptions = {},
): ModelSourceHandle {
  const [shipped, setShipped] = useState<Backstage>(EMPTY);
  const [classView, setClassView] = useState<ClassBackstageView | null>(null);
  const { fetch } = options;

  useEffect(() => {
    let live = true;
    if (host.backstageFolder === '') return;
    openBackstage(host.backstageFolder, fetch ? { fetch } : {}).then(
      (b) => live && setShipped(b),
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
        if (live) {
          view = v;
          setClassView(v);
        } else v.dispose();
      },
      () => undefined,
    );
    return () => {
      live = false;
      view?.dispose();
    };
  }, [host]);

  // What's open now, for the source's callbacks. Set after each render, before any stage asks.
  const current = useRef<Backstage>(EMPTY);
  const classRef = useRef<ClassBackstageView | null>(null);
  useEffect(() => {
    current.current = classView ? combineBackstages(shipped, classView.backstage) : shipped;
    classRef.current = classView;
  }, [shipped, classView]);

  return useMemo<ModelSourceHandle>(
    () => ({
      source: { find: (id) => current.current.find(id) },
      prepare: async (ids) => {
        await classRef.current?.prepare(ids);
      },
    }),
    [],
  );
}
