/**
 * The automatic check's run, for every tab that offers it (spec 08 sections 9.1 and 9.7, WP11c):
 * the Screening room's Check the whole film, and the Production stage's Check this frame and
 * Check this scene. The film's models are made ready, a hidden stage is made for the run and let
 * go after, and the results are saved with the session's `annotate` (no undo step), each through
 * `sameOrNew` so a result that says the same as the one saved keeps it. Keeping a flag is the
 * learner's own undoable step. Leaving the tab stops a run, and nothing half-done is saved.
 */
import { keepFlag } from '@storystage/check';
import type { RuntimeWorker } from '@storystage/playback';
import type { CheckResult, FrameId, Production, SceneId } from '@storystage/production';
import { useEffect, useRef, useState } from 'react';
import { hiddenCanvas, type StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';

/** What a run checks. */
export type CheckScope =
  | { readonly kind: 'film' }
  | { readonly kind: 'scene'; readonly scene: SceneId }
  | { readonly kind: 'frame'; readonly frame: FrameId };

export interface CheckRunState {
  /** While a check runs: what it's checking, and frames done of frames to do. */
  readonly running: {
    readonly scope: CheckScope;
    readonly done: number;
    readonly total: number;
  } | null;
  /** The last run stopped on a problem, so the learner knows it ran. */
  readonly failed: boolean;
}

export interface CheckRun extends CheckRunState {
  /** Checks `scope`. A run already going, or a film that can't be changed, does nothing. */
  run(scope: CheckScope): Promise<void>;
  /** Keeps a flag, or lets it go, on the frame numbered `number` ("2.3"): an undo step. */
  keep(frame: FrameId, itemId: string, keep: boolean, number: string): void;
}

/** The frames a scope covers: for the progress before the run counts them. */
function framesIn(p: Production, scope: CheckScope): number {
  if (scope.kind === 'frame') return 1;
  const scenes =
    scope.kind === 'scene' ? [scope.scene] : p.manifest.runningOrder.map((r) => r.scene);
  return p.frames.filter((f) => scenes.includes(f.scene)).length;
}

export function useCheckRun({
  studio,
  models,
  makeStage,
  startWorker,
}: {
  studio: Studio;
  models: ModelSourceHandle;
  /** How the hidden stage is made; by default the studio's, loaded with the first check. */
  makeStage?: StageMaker;
  /** A runtime worker; by default the driver's, loaded with the first check. */
  startWorker?: () => RuntimeWorker;
}): CheckRun {
  const [running, setRunning] = useState<CheckRunState['running']>(null);
  const [failed, setFailed] = useState(false);
  const stopping = useRef<AbortController | null>(null);
  // Leaving the tab stops a check that's running.
  useEffect(() => () => stopping.current?.abort(), []);

  const run = async (scope: CheckScope) => {
    if (stopping.current || studio.readOnly !== null) return;
    const stop = new AbortController();
    stopping.current = stop;
    const film = studio.production;
    try {
      // The runner and the export's model list load with the first check, not with the studio.
      const [{ checkFilm, checkScene, sameOrNew }, { usedModels }, stages, playback] =
        await Promise.all([
          import('@storystage/check'),
          import('@storystage/export'),
          makeStage ? null : import('../stage/makeStage.ts'),
          startWorker ? null : import('@storystage/playback'),
        ]);
      const make = makeStage ?? stages!.makeStage;
      const worker = startWorker ?? playback!.startRuntimeWorker;
      await models.prepare(usedModels(film));
      if (stop.signal.aborted) return;
      setFailed(false);
      setRunning({ scope, done: 0, total: framesIn(film, scope) });
      const hidden = await make(hiddenCanvas(), { hidden: true, models: models.source });
      try {
        const common = {
          production: film,
          stage: hidden,
          startWorker: worker,
          signal: stop.signal,
          // Check this frame plays its whole scene, but counts as the one frame.
          onProgress: (done: number, total: number) => {
            if (scope.kind !== 'frame') setRunning({ scope, done, total });
          },
        };
        let results: ReadonlyMap<FrameId, CheckResult>;
        if (scope.kind === 'film') results = await checkFilm(common);
        else {
          const scene =
            scope.kind === 'scene'
              ? scope.scene
              : film.frames.find((f) => f.id === scope.frame)?.scene;
          if (!scene) return;
          const all = await checkScene({ ...common, scene });
          // Check this frame saves only that frame's result, though its whole scene played.
          results =
            scope.kind === 'frame' ? new Map([...all].filter(([id]) => id === scope.frame)) : all;
          if (scope.kind === 'frame') setRunning({ scope, done: 1, total: 1 });
        }
        const saved = new Map(film.frames.map((f) => [f.id, f.check]));
        studio.session.annotate(
          new Map([...results].map(([id, r]) => [id, sameOrNew(saved.get(id), r)])),
        );
      } finally {
        hidden.dispose();
      }
    } catch (e) {
      // Stopped by leaving the tab: nothing to say.
      if (!stop.signal.aborted) {
        console.error('The automatic check could not finish.', e);
        setFailed(true);
      }
    } finally {
      if (stopping.current === stop) stopping.current = null;
      if (!stop.signal.aborted) setRunning(null);
    }
  };

  const keep = (frame: FrameId, itemId: string, keepIt: boolean, number: string) => {
    if (studio.readOnly !== null) return;
    studio.commit(
      words.t(keepIt ? 'screening.keepStep' : 'screening.letGoStep', { frame: number }),
      keepFlag(studio.production, frame, itemId, keepIt),
    );
  };

  return { running, failed, run, keep };
}
