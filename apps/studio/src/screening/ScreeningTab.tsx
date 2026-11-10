/**
 * The Screening tab (spec 08 section 2, S2; mounted here for S5): the rough cut on the tab's own
 * stage. The tab makes its stage when it opens and disposes of it when the learner leaves, as
 * Rehearse does with the Production stage's (S2 and S5, 8 Nov). The controller measures the film
 * on a hidden stage it makes only for that, then plays it live; every runtime worker ends with
 * the tab.
 */
import type { NodeId } from '@storystage/ast';
import { usedModels } from '@storystage/export';
import { startRuntimeWorker, type RuntimeWorker } from '@storystage/playback';
import type { HostInterface } from '@storystage/host';
import type { ProductionFiles } from '@storystage/production';
import {
  RoughCut,
  ScreeningPlayer,
  type Place as ScreeningPlace,
  type ScreeningState,
} from '@storystage/screening';
import '@storystage/screening/styles.css';
import { NeutralNote } from '@storystage/ui';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { makeStage, hiddenCanvas, type ShownStage, type StageMaker } from '../stage/makeStage.ts';
import { useModelSource, type ModelSourceOptions } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import type { Place } from '../storyboard/place.ts';
import type { Studio } from '../studio.ts';

/** Every run of a film plays the same way (WP6.5). */
const SEED = 1;

export interface ScreeningTabProps {
  readonly studio: Studio;
  readonly host: HostInterface;
  /** The open film's files: its packed models, checked before they're shown. */
  readonly files: ProductionFiles;
  onPlaceChange(place: Place): void;
  /**
   * False while the tab is out of sight under Learn or Settings: play pauses and the stage stops
   * drawing, without being disposed. Default true.
   */
  readonly active?: boolean;
  /** Fix on the Production stage: the App changes tab and puts the place there. */
  onOpenProductionStage(node: NodeId, place: Place | null): void;
  /** For tests: how stages and runtime workers are made, and Backstage fetched. */
  readonly makeStage?: StageMaker;
  readonly startWorker?: () => RuntimeWorker;
  readonly models?: ModelSourceOptions;
}

const NOT_YET: ScreeningState = {
  timeline: null,
  time: 0,
  playing: false,
  error: null,
  captions: [],
};

/**
 * Holds the controller for the film as it is now, for `useSyncExternalStore`: each change to the
 * film gets a new one, and the screen follows whichever is current.
 */
function controllerSlot() {
  let player: ScreeningPlayer | null = null;
  let unhook = () => {};
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of listeners) l();
  };
  return {
    get: () => player,
    set(next: ScreeningPlayer | null) {
      unhook();
      player = next;
      unhook = next ? next.subscribe(notify) : () => {};
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    state: () => player?.state ?? NOT_YET,
  };
}

export function ScreeningTab(props: ScreeningTabProps) {
  const { studio, host } = props;
  const production = studio.production;
  const make = props.makeStage ?? makeStage;
  const startWorker = props.startWorker ?? startRuntimeWorker;
  const models = useModelSource(host, production, props.files, props.models);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<ShownStage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [slot] = useState(controllerSlot);

  // The tab's own stage: made when it opens, disposed when the learner leaves. Each stage gets a
  // canvas of its own, removed with it: a disposed engine lets go of its canvas's context, so a
  // stage made again on the same canvas (React's StrictMode does that) would draw nothing.
  useEffect(() => {
    const host = canvasRef.current;
    if (!host) return;
    const canvas = document.createElement('canvas');
    host.append(canvas);
    let live = true;
    let made: ShownStage | null = null;
    make(canvas, { hidden: false, models: models.source }).then(
      (s) => {
        if (!live) return s.dispose();
        made = s;
        setStage(s);
      },
      (e: unknown) => {
        // For whoever looks into it; the learner gets plain words.
        console.error('The Screening tab could not make its stage.', e);
        if (live) setProblem(words.t('screening.noStage'));
      },
    );
    return () => {
      live = false;
      made?.dispose();
      canvas.remove();
    };
    // The canvas and the model source last as long as the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A controller for each version of the film: measured again after a change.
  useEffect(() => {
    if (!stage) return;
    const next = new ScreeningPlayer({
      production,
      stage,
      measureStage: () => make(hiddenCanvas(), { hidden: true, models: models.source }),
      startWorker,
      seed: SEED,
    });
    const stop = new AbortController();
    slot.set(next);
    void models
      .prepare(usedModels(production))
      .then(() => next.prepare(stop.signal))
      // A measure that worked clears what an earlier one said.
      .then((timeline) => {
        if (timeline) setProblem(null);
      })
      .catch((e: unknown) => {
        console.error('The Screening tab could not measure the film.', e);
        setProblem(words.t('screening.notReady'));
      });
    let frame = 0;
    const tick = () => {
      void next.tick();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      stop.abort();
      cancelAnimationFrame(frame);
      if (slot.get() === next) slot.set(null);
      next.dispose();
    };
    // `make`, `startWorker` and the model source last as long as the tab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, production]);

  // Out of sight: pause, and stop drawing until the tab shows again.
  const active = props.active ?? true;
  useEffect(() => {
    if (!stage) return;
    if (active) {
      stage.startLive?.();
      return;
    }
    slot.get()?.pause();
    stage.stopLive?.();
  }, [active, stage, slot]);

  const state = useSyncExternalStore(slot.subscribe, slot.state);

  return (
    <div className="sr-tab">
      {problem && <NeutralNote>{problem}</NeutralNote>}
      {models.refused.length > 0 && (
        <NeutralNote>
          {words.t('screening.refused')}
          <ul className="sr-refused">
            {models.refused.map((r) => (
              <li key={r.folder}>
                {words.t('screening.refusedModel', { name: r.name, reason: r.reason })}
              </li>
            ))}
          </ul>
        </NeutralNote>
      )}
      <RoughCut
        production={production}
        timeline={state.timeline}
        time={state.time}
        playing={state.playing}
        onPlayPause={() => {
          const player = slot.get();
          if (state.playing) player?.pause();
          else void player?.play();
        }}
        onSeek={(t) => void slot.get()?.seek(t)}
        player={<div ref={canvasRef} className="sr-canvas" />}
        captions={state.captions}
        error={state.error}
        onOpenProductionStage={(node, place) => props.onOpenProductionStage(node, place)}
        onStep={(step) => void studio.step(step)}
        onPlaceChange={(place: ScreeningPlace) => props.onPlaceChange(place)}
      />
    </div>
  );
}
