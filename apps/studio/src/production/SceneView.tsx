/**
 * The scene view (`07-ux.md` section 7.2) and Rehearse (section 7.4): the current scene's set-up
 * on a stage of the Production stage's own, through the scene's camera, with Rehearse's controls
 * on its title band. Loaded on demand, as the Blocks editor is, so the Storyboard opens without
 * Babylon.js or the runtime. Editing the set-up here (adding, choosing, moving) waits on the
 * stage's editing contract (section 7.2, S3).
 */
import type { NodeId } from '@storystage/ast';
import { SPEEDS, startRuntimeWorker, type RuntimeWorker } from '@storystage/playback';
import type { Production, SceneId } from '@storystage/production';
import type { SceneSetup } from '@storystage/story-api';
import { Button, NeutralNote, Segmented } from '@storystage/ui';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { makeStage, type ShownStage, type StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import { IDLE, Rehearsal, type RehearsalState } from './rehearsal.ts';

export interface SceneViewProps {
  readonly production: Production;
  readonly scene: SceneId;
  /** The scene's name on the title band: "Scene 1: The kite". */
  readonly title: string;
  /** The App's one model source, for every stage. */
  readonly models: ModelSourceHandle;
  /** Why Rehearse can't run yet, or `null` when it can (section 1.4; screen 02c). */
  readonly unavailable: string | null;
  /** The block chosen in the Code editor, for Rehearse to here. */
  selectedBlock(): NodeId | null;
  /** What the Code editor highlights: the blocks running, and the error a run stopped at. */
  onRehearsal(state: RehearsalState): void;
  /** Says something in the Production stage's polite live region. */
  onAnnounce(text: string): void;
  /** False while Learn or Settings covers the tab: the run pauses and the stage stops drawing. */
  readonly active?: boolean;
  /** For tests: how the stage and the runtime worker are made. */
  readonly makeStage?: StageMaker;
  readonly startWorker?: () => RuntimeWorker;
}

/** The models and backdrop parts one scene's set-up uses, for the model source to get ready. */
export function setupModels(setup: SceneSetup): string[] {
  const { ground, sky, lighting } = setup.backdrop;
  const ids = new Set<string>();
  for (const id of [ground, sky, lighting]) if (id) ids.add(id);
  for (const o of setup.objects) if (typeof o.model === 'string') ids.add(o.model);
  return [...ids];
}

const SPEED_WORD = {
  0.5: 'production.rehearse.half',
  1: 'production.rehearse.normal',
  2: 'production.rehearse.double',
} as const satisfies Record<(typeof SPEEDS)[number], string>;

/** Holds the scene's current Rehearsal, for `useSyncExternalStore`. */
function rehearsalSlot() {
  let current: Rehearsal | null = null;
  let unhook = () => {};
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of [...listeners]) l();
  };
  return {
    get: () => current,
    set(next: Rehearsal | null) {
      unhook();
      current = next;
      unhook = next ? next.subscribe(notify) : () => {};
      notify();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    state: () => current?.state ?? IDLE,
  };
}

export default function SceneView(props: SceneViewProps) {
  const { production, scene, models } = props;
  const make = props.makeStage ?? makeStage;
  const startWorker = props.startWorker ?? startRuntimeWorker;
  const canvasRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<ShownStage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [slot] = useState(rehearsalSlot);
  // The App's callbacks, current for the effects below without making them run again.
  const announce = useRef(props.onAnnounce);
  const onRehearsal = useRef(props.onRehearsal);
  useEffect(() => {
    announce.current = props.onAnnounce;
    onRehearsal.current = props.onRehearsal;
  });

  // The view's own stage, made when it opens and disposed when the learner leaves the tab. Each
  // stage gets a canvas of its own, as the Screening tab's does.
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
        console.error('The scene view could not make its stage.', e);
        if (live) setProblem(words.t('production.sceneView.noStage'));
      },
    );
    return () => {
      live = false;
      made?.dispose();
      canvas.remove();
    };
    // The canvas and the model source last as long as the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A Rehearsal for this version of the scene. A change to the code while it runs stops it and
  // says so (section 7.4); either way the set-up as it is now shows.
  const changed = useRef<{ scene: SceneId; running: boolean } | null>(null);
  useEffect(() => {
    if (!stage) return;
    const rehearsal = new Rehearsal({ production, scene, stage, startWorker });
    if (changed.current?.running && changed.current.scene === scene)
      announce.current(words.t('production.rehearse.codeChanged'));
    slot.set(rehearsal);
    const setup = production.scenes.find((s) => s.id === scene)?.setup;
    void models
      .prepare(setup ? setupModels(setup) : [])
      .then(() => rehearsal.showSetup())
      .catch((e: unknown) => {
        console.error('The scene view could not show the set-up.', e);
        setProblem(words.t('production.sceneView.noSetup'));
      });
    let frame = 0;
    const tick = () => {
      void rehearsal.tick();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      changed.current = { scene, running: rehearsal.active };
      cancelAnimationFrame(frame);
      if (slot.get() === rehearsal) slot.set(null);
      rehearsal.dispose();
    };
    // `make`, `startWorker` and the model source last as long as the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, production, scene]);

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

  // The Code editor's highlights, and what the live region says as a run goes.
  const said = useRef<RehearsalState>(IDLE);
  useEffect(() => {
    onRehearsal.current(state);
    const before = said.current;
    said.current = state;
    if (state.status === before.status && state.error === before.error) return;
    if (state.error && state.error !== before.error)
      announce.current(words.t('production.rehearse.stoppedAt', { words: state.error.words }));
    else if (state.status === 'ended' && before.status !== 'ended')
      announce.current(
        state.next
          ? words.t('production.rehearse.next', { heading: state.next })
          : words.t('production.rehearse.finished'),
      );
    else if (state.status === 'idle' && before.status !== 'idle')
      announce.current(words.t('production.rehearse.stopped'));
    else if (state.status === 'paused' && before.status === 'starting')
      announce.current(words.t('production.rehearse.pausedHere'));
  }, [state]);

  // Looked up when pressed: the scene's Rehearsal is made after the first render.
  const rehearsal = () => slot.get();
  const toHere = () => {
    const node = props.selectedBlock();
    if (!node) {
      setHint(words.t('production.rehearse.chooseBlock'));
      return;
    }
    setHint(null);
    void rehearsal()?.toHere(node);
  };
  const running = state.status === 'playing' || state.status === 'paused';
  const unavailable = props.unavailable ?? (stage ? null : words.t('production.sceneView.loading'));

  return (
    <section className="pr-scene" aria-label={words.t('production.sceneView')}>
      <div className="pr-scene-band">
        <h2 className="pr-scene-title">{props.title}</h2>
        <div className="pr-scene-controls">
          {state.status === 'idle' && (
            <>
              <Button
                variant="primary"
                icon="play_arrow"
                iconFilled
                isDisabled={unavailable !== null}
                onPress={() => {
                  setHint(null);
                  void rehearsal()?.start();
                }}
              >
                {words.t('production.rehearse')}
              </Button>
              <Button
                variant="secondary"
                icon="flag"
                isDisabled={unavailable !== null}
                onPress={toHere}
              >
                {words.t('production.rehearse.toHere')}
              </Button>
            </>
          )}
          {running && (
            <>
              {state.status === 'playing' ? (
                <Button variant="secondary" icon="pause" onPress={() => rehearsal()?.pause()}>
                  {words.t('production.rehearse.pause')}
                </Button>
              ) : (
                <Button variant="secondary" icon="play_arrow" onPress={() => rehearsal()?.play()}>
                  {words.t('production.rehearse.play')}
                </Button>
              )}
              <Segmented
                label={words.t('production.rehearse.speed')}
                options={SPEEDS.map((s) => ({ id: String(s), label: words.t(SPEED_WORD[s]) }))}
                value={String(state.speed)}
                onChange={(s) => rehearsal()?.setSpeed(Number(s))}
              />
            </>
          )}
          {(running || state.status === 'ended') && (
            <Button variant="secondary" icon="replay" onPress={() => void rehearsal()?.start()}>
              {words.t('production.rehearse.restart')}
            </Button>
          )}
          {state.status !== 'idle' && (
            <Button variant="stop" icon="stop" onPress={() => void rehearsal()?.stop()}>
              {words.t('production.rehearse.stop')}
            </Button>
          )}
        </div>
      </div>
      {state.status === 'idle' && props.unavailable && (
        <p className="pr-scene-why">{props.unavailable}</p>
      )}
      <div className="pr-scene-view" data-running={running || undefined}>
        <div ref={canvasRef} className="pr-canvas" />
        {state.speech.length > 0 && (
          <div className="pr-captions">
            {state.speech.map((s, i) => (
              <p key={i} className="pr-caption" data-thought={s.thought || undefined}>
                {s.thought && (
                  <span className="ss-visually-hidden">
                    {words.t('production.rehearse.thinks')}
                  </span>
                )}
                {s.text}
              </p>
            ))}
          </div>
        )}
      </div>
      {problem && <NeutralNote>{problem}</NeutralNote>}
      {hint && <NeutralNote>{hint}</NeutralNote>}
      {state.error && (
        <NeutralNote>
          {words.t('production.rehearse.stoppedAt', { words: state.error.words })}
        </NeutralNote>
      )}
      {state.next && (
        <NeutralNote>{words.t('production.rehearse.next', { heading: state.next })}</NeutralNote>
      )}
      {state.notReached && <NeutralNote>{words.t('production.rehearse.notReached')}</NeutralNote>}
      {state.missing.length > 0 && (
        <NeutralNote>{words.t('production.rehearse.missing')}</NeutralNote>
      )}
    </section>
  );
}
