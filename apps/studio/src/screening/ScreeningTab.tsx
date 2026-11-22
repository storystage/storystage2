/**
 * The Screening tab (spec 08 section 2, S2; mounted here for S5): the rough cut on the tab's own
 * stage. The tab makes its stage when it opens and disposes of it when the learner leaves, as
 * Rehearse does with the Production stage's (S2 and S5, 8 Nov). The controller measures the film
 * on a hidden stage it makes only for that, then plays it live; every runtime worker ends with
 * the tab.
 */
import type { NodeId } from '@storystage/ast';
import {
  RESOLUTIONS,
  distributionProblems,
  exportFilm,
  usedModels,
  type FilmExport,
  type FilmVoices,
} from '@storystage/export';
import { startRuntimeWorker, type RuntimeWorker } from '@storystage/playback';
import type { HostInterface } from '@storystage/host';
import {
  CheckPanel,
  Compare,
  ExportDialog,
  ExportJob,
  RetakeNotes,
  RoughCut,
  ScreeningPlayer,
  currentFrame,
  filmFlags,
  framesInOrder,
  sceneAt,
  segments,
  stillMoment,
  type StillState,
  type ExportChoices,
  type ExportRun,
  type Place as ScreeningPlace,
  type ScreeningState,
} from '@storystage/screening';
import '@storystage/screening/styles.css';
import { Button, NeutralNote } from '@storystage/ui';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FrameId, Production, SceneId } from '@storystage/production';
import { frameDrawer } from '../storyboard/FramePicture.tsx';
import { useCheckRun } from '../check/useCheckRun.ts';
import { makeStage, hiddenCanvas, type ShownStage, type StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import type { ExportSlot } from './exportSlot.ts';
import { words } from '../strings.ts';
import { saveFilm } from './saveFilm.ts';
import type { Place } from '../storyboard/place.ts';
import type { Studio } from '../studio.ts';

/** Every run of a film plays the same way (WP6.5). */
const SEED = 1;

export interface ScreeningTabProps {
  readonly studio: Studio;
  readonly host: HostInterface;
  /** The App's one model source, for every stage (`useModelSource`). */
  readonly models: ModelSourceHandle;
  /**
   * Where the App keeps the running export, so it goes on when the learner changes tab (Keep
   * working); the App stops it when the studio closes.
   */
  readonly exports: ExportSlot<ExportJob>;
  /**
   * Whether Export film is open, when the App holds it (S5's header takes the learner here with
   * it open). Without it, the tab holds it.
   */
  readonly exportOpen?: boolean;
  onExportOpenChange?(open: boolean): void;
  onPlaceChange(place: Place): void;
  /**
   * False while the tab is out of sight under Learn or Settings: play pauses and the stage stops
   * drawing, without being disposed. Default true.
   */
  readonly active?: boolean;
  /** Fix on the Production stage: the App changes tab and puts the place there. */
  onOpenProductionStage(node: NodeId, place: Place | null): void;
  /**
   * The studio's voices for speak lines (spec 08 section 4), from the line cache Rehearse plays
   * from, so an exported film sounds as Rehearse does. Without them, speak lines are silent in
   * the export, with their captions, and the dialog says so.
   */
  readonly voices?: FilmVoices;
  /** For tests: how stages and runtime workers are made, and Backstage fetched. */
  readonly makeStage?: StageMaker;
  readonly startWorker?: () => RuntimeWorker;
  /** For tests: how an exported film is saved, and how it's encoded. */
  readonly saveFilm?: (film: FilmExport) => Promise<void>;
  readonly exportOptions?: Pick<Parameters<typeof exportFilm>[0], 'backend' | 'compositor'>;
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
  const { models, exports } = props;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<ShownStage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [slot] = useState(controllerSlot);
  // Compare (11.2): the frame chosen with its arrows, and its still.
  const [chosen, setChosen] = useState<FrameId | null>(null);
  const [still, setStill] = useState<StillState>({ kind: 'none' });

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

  // The parts of the film that change what plays: the program, the scenes' set-ups, the running
  // order, and the script (the captions). A retake note or a storyboard frame doesn't, so typing
  // a note never measures the film again.
  const playable = useMemo(
    () => production,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [production.program, production.scenes, production.manifest.runningOrder, production.script],
  );

  // A controller for each version of the film: measured again after a change.
  useEffect(() => {
    if (!stage) return;
    const next = new ScreeningPlayer({
      production: playable,
      stage,
      measureStage: () => make(hiddenCanvas(), { hidden: true, models: models.source }),
      startWorker,
      seed: SEED,
    });
    const stop = new AbortController();
    slot.set(next);
    void models
      .prepare(usedModels(playable))
      .then(() => next.prepare(stop.signal))
      // A measure that worked clears what an earlier one said.
      .then((timeline) => {
        if (!timeline) return;
        setProblem(null);
        // The first frame shows at once, not a black picture until Play; Compare starts on it.
        return next.seek(0).then(async () => {
          const first = framesInOrder(playable)[0];
          if (first) setStill(await stillFor(next, playable, first.id));
        });
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
  }, [stage, playable]);

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

  // Compare (11.2): the frame chosen with its arrows, or else the frame playing now.
  const drawFrame = useMemo(() => frameDrawer(production), [production]);
  const shownFrame =
    (chosen && production.frames.some((f) => f.id === chosen) ? chosen : null) ??
    (state.timeline ? currentFrame(production, state.timeline, state.time)?.id : null) ??
    framesInOrder(production)[0]?.id ??
    null;
  // The frame whose still was asked for last: a slower answer for an earlier frame is dropped,
  // so the still always belongs to the sketch beside it (S5's review).
  const askedFor = useRef<FrameId | null>(null);
  const showFrame = (id: FrameId) => {
    const player = slot.get();
    setChosen(id);
    askedFor.current = id;
    if (!player) return;
    // A still moves the film to its frame, so the film stops there rather than jumping on.
    if (state.playing) player.pause();
    setStill({ kind: 'drawing' });
    void stillFor(player, production, id).then((drawn) => {
      if (askedFor.current === id) setStill(drawn);
    });
  };
  // Retake notes: for the frame compared, or the scene playing.
  const notesScene =
    production.frames.find((f) => f.id === shownFrame)?.scene ??
    (state.timeline ? sceneAt(segments(production, state.timeline), state.time)?.scene : null) ??
    production.manifest.runningOrder[0]?.scene ??
    null;
  const writeNotes = (scene: SceneId, notes: string) => {
    const n = production.manifest.runningOrder.findIndex((r) => r.scene === scene) + 1;
    if (n === 0) return; // Not in the running order: no "scene 0".
    const next: Production = {
      ...production,
      storyboard: {
        ...production.storyboard,
        cards: production.storyboard.cards.map((c) =>
          c.id === scene ? { ...c, retakeNotes: notes } : c,
        ),
      },
    };
    studio.commit(words.t('screening.notesStep', { n }), next, `retake:${scene}`);
  };

  // Export film: one job for the tab's life, so Keep working can close the dialog while it goes
  // on. Each run makes its own hidden stage and lets it go at the end. Leaving the tab stops it.
  const save = props.saveFilm ?? ((film: FilmExport) => saveFilm(host, film));
  // The export the App keeps: one started here earlier, or a new one.
  const [job] = useState(() => exports.get() ?? exports.put(new ExportJob({ save })));
  /** The export as the learner asked for it: this film, these choices. */
  const exportRun =
    (chosen: ExportChoices): ExportRun =>
    async (signal, onProgress) => {
      await models.prepare(usedModels(production));
      const hidden = await make(hiddenCanvas(RESOLUTIONS[chosen.resolution]), {
        hidden: true,
        models: models.source,
      });
      try {
        return await exportFilm({
          production,
          find: models.item,
          stage: hidden,
          startWorker,
          seed: SEED,
          ...chosen,
          signal,
          onProgress,
          ...(props.voices ? { voices: props.voices } : {}),
          ...props.exportOptions,
        });
      } finally {
        hidden.dispose();
      }
    };
  const exportState = useSyncExternalStore(
    (l) => job.subscribe(l),
    () => job.state,
  );
  const [ownExportOpen, setOwnExportOpen] = useState(false);
  const exportOpen = props.exportOpen ?? ownExportOpen;
  const setExportOpen = (open: boolean) => {
    setOwnExportOpen(open);
    props.onExportOpenChange?.(open);
  };

  // Check the whole film (WP11c, spec 08 section 9.1), on the studio's one check run: a hidden
  // stage for the run, results saved with `annotate` (no undo step), and Keep as an undo step.
  const readOnly = studio.readOnly !== null;
  const check = useCheckRun({ studio, models, makeStage: make, startWorker });
  const checking = check.running && { done: check.running.done, total: check.running.total };
  const checkFailed = check.failed;
  const runFilmCheck = () => check.run({ kind: 'film' });
  const flagged = filmFlags(production);
  const keep = (frame: FrameId, itemId: string, keepIt: boolean) =>
    check.keep(
      frame,
      itemId,
      keepIt,
      flagged.flags.find((f) => f.frame === frame)?.frameNumber ?? '',
    );
  // Opening Export film checks the frames not checked since they changed first (section 4), and
  // the dialog lists what it found; the learner can export anyway.
  useEffect(() => {
    if (!exportOpen || flagged.unchecked === 0) return;
    // Started just after the dialog opens, as from a press; once started it runs to its end.
    const start = setTimeout(() => void runFilmCheck());
    return () => clearTimeout(start);
    // Only as the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportOpen]);

  return (
    <div className="sr-tab sr-room">
      <div className="sr-main">
        <div className="sr-tab-bar">
          <Button variant="primary" icon="movie" onPress={() => setExportOpen(true)}>
            {words.t('screening.export')}
          </Button>
        </div>
        <ExportDialog
          isOpen={exportOpen}
          onOpenChange={setExportOpen}
          production={production}
          timeline={state.timeline}
          refusals={exportOpen ? distributionProblems(production, models.item) : []}
          check={
            checking
              ? { kind: 'checking' }
              : flagged.unchecked === 0
                ? { kind: 'ready', flags: flagged.flags }
                : checkFailed
                  ? { kind: 'failed' }
                  : null
          }
          onCheck={() => void runFilmCheck()}
          job={exportState}
          onExport={(chosen) => job.start(exportRun(chosen))}
          onStop={() => job.stop()}
          onSaveAgain={() => void job.saveAgain()}
        />
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
            else {
              // Playing again: Compare follows the film rather than the frame chosen.
              setChosen(null);
              askedFor.current = null;
              void player?.play();
            }
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
      <aside className="sr-side" aria-label={words.t('screening.side')}>
        <Compare
          production={production}
          timeline={state.timeline}
          frame={shownFrame}
          onShow={showFrame}
          drawFrame={drawFrame}
          still={still}
        />
        <CheckPanel
          production={production}
          running={checking}
          failed={checkFailed}
          onCheck={() => void runFilmCheck()}
          onKeep={keep}
          readOnly={readOnly}
        />
        <RetakeNotes
          production={production}
          scene={notesScene}
          onChange={writeNotes}
          onDone={() => studio.seal()}
          readOnly={readOnly}
        />
      </aside>
    </div>
  );
}

/** The still for a frame: at the moment it stands for, drawn on the shown stage (spec 08 §3). */
async function stillFor(
  player: ScreeningPlayer,
  production: Production,
  frame: FrameId,
): Promise<StillState> {
  const timeline = player.state.timeline;
  const found = production.frames.find((f) => f.id === frame);
  if (!timeline || !found) return { kind: 'none' };
  const at = stillMoment(production, timeline, found);
  if (at === null) return { kind: 'notPlayed' };
  const image = await player.still(at, STILL.width, STILL.height);
  return image ? { kind: 'ready', at, image } : { kind: 'none' };
}

/** The still's size: the column's width at most, 16:9. */
const STILL = { width: 512, height: 288 };
