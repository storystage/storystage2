/**
 * The scene view (`07-ux.md` section 7.2) and Rehearse (section 7.4): the current scene's set-up
 * on a stage of the Production stage's own, through the scene's camera, with Rehearse's controls
 * on its title band. Loaded on demand, as the Blocks editor is, so the Storyboard opens without
 * Babylon.js or the runtime. While nothing runs, the stage is in edit mode (S3's `EditableStage`):
 * a click chooses an object, its handles move, turn and resize it, Look around orbits a camera of
 * its own, and "In this shot:" names what the scene's camera sees. Rehearse plays in Camera view.
 */
import type { NodeId } from '@storystage/ast';
import { SPEEDS, startRuntimeWorker, type RuntimeWorker } from '@storystage/playback';
import type { Production, SceneId } from '@storystage/production';
import type { EditTarget, EditableStage, Stage, ViewStep } from '@storystage/stage';
import { CAMERA, type SceneSetup, type Transform, type Vec3 } from '@storystage/story-api';
import { DropZone } from 'react-aria-components';
import { MODEL_DRAG_TYPE } from './BackstageRail.tsx';
import { Button, NeutralNote, Segmented } from '@storystage/ui';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { makeStage, type ShownStage, type StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import { ViewPad } from './ViewPad.tsx';
import { IDLE, Rehearsal, type RehearsalState, type Speaker } from './rehearsal.ts';

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
  /** Speak lines' voices (spec 06 section 4.5): Rehearse starts each line as its block starts. */
  readonly speaker?: Speaker | undefined;
  /** Speak lines that are silent for now, with their captions: a note under the view. */
  readonly silentLines?: string | null;
  /** What's chosen, on the stage or in Objects in this scene. */
  readonly chosen?: EditTarget | null;
  /** The learner clicked something on the stage, or the ground (null). */
  onChoose?(target: EditTarget | null): void;
  /** A handle drag was let go: the target's whole new transform, for one undo step. */
  onMoved?(target: EditTarget, transform: Transform): void;
  /**
   * The stage's editing half once the set-up has first been shown, and null when it goes: the
   * Pose panel shows the hands and feet on it and writes their drags (7.16, decision 0073).
   */
  onEditable?(stage: EditableStage | null): void;
  /** Move the camera here: Look around's view, for the scene's camera. */
  onMoveCamera?(transform: Transform): void;
  /**
   * Camera view's buttons moved the scene's camera: where it is after a press or a hold, and the
   * hold's step, for one undo step named for it (07-ux 7.2).
   */
  onCameraStepped?(transform: Transform, step: ViewStep): void;
  /** Add a marker: where the view is, Look around's or the scene camera's. */
  onAddMarker?(transform: Transform): void;
  /** False on a film that can't be changed: no handles and no Move the camera here. */
  readonly canEdit?: boolean;
  /**
   * A model dragged from Backstage was dropped on the view: its id, and where the ground is under
   * the pointer (null above the horizon).
   */
  onDropModel?(id: string, ground: Vec3 | null): void;
  /** Set up from storyboard (WP10.10): asks again what the storyboard shows. */
  onSetUp?(): void;
}

/** The stage's editing half, when it has one (S3's Babylon stage and `FakeStage` do). */
const editableOf = (stage: Stage | null): EditableStage | null =>
  stage && 'editing' in stage ? (stage as EditableStage) : null;

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
  // A press or hold of Camera view's buttons: its first step, and where the camera is now.
  const held = useRef<{ step: ViewStep; transform: Transform } | null>(null);
  // The point the last step turned round, and where it left the camera: the next step keeps it
  // while the camera is still there, so a run of steps circles one point (S3's #678).
  const carried = useRef<{ transform: Transform; around: Vec3 } | null>(null);
  const [stage, setStage] = useState<ShownStage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [slot] = useState(rehearsalSlot);
  // The App's callbacks, current for the effects below without making them run again.
  const announce = useRef(props.onAnnounce);
  const onRehearsal = useRef(props.onRehearsal);
  // The studio's voices, read when a rehearsal is made; they last as long as the App.
  const speaker = useRef(props.speaker);
  const onChoose = useRef(props.onChoose);
  const onMoved = useRef(props.onMoved);
  const onEditable = useRef(props.onEditable);
  useEffect(() => {
    announce.current = props.onAnnounce;
    onRehearsal.current = props.onRehearsal;
    speaker.current = props.speaker;
    onChoose.current = props.onChoose;
    onMoved.current = props.onMoved;
    onEditable.current = props.onEditable;
  });
  // Counts each time the set-up has been shown, so what asks the stage about it asks again.
  const [shown, setShown] = useState(0);
  const [looking, setLooking] = useState(false);
  const [shot, setShot] = useState<readonly string[] | null>(null);

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
    const rehearsal = new Rehearsal({
      production,
      scene,
      stage,
      startWorker,
      // Through the ref: the voices may load after the rehearsal is made.
      speaker: {
        start: (node, delay) => speaker.current?.start(node, delay),
        stop: () => speaker.current?.stop(),
      },
    });
    if (changed.current?.running && changed.current.scene === scene)
      announce.current(words.t('production.rehearse.codeChanged'));
    slot.set(rehearsal);
    const setup = production.scenes.find((s) => s.id === scene)?.setup;
    void models
      .prepare(setup ? setupModels(setup) : [])
      .then(() => rehearsal.showSetup())
      .then(() => {
        setShown((n) => n + 1);
        // "In this shot:", asked again each time the set-up is shown.
        const shownOn = editableOf(stage);
        if (shownOn) setShot(shownOn.inShot().map(String));
      })
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

  // Edit mode while nothing runs; Rehearse plays in Camera view, with no handles.
  const editable = editableOf(stage);
  const idle = state.status === 'idle';
  const canEdit = props.canEdit ?? false;
  useEffect(() => {
    editable?.editing(idle && canEdit);
  }, [editable, idle, canEdit]);
  /** Before a run: no handles, and Camera view. */
  const quiet = () => {
    editable?.editing(false);
    editable?.lookAround(false);
    setLooking(false);
  };

  // Clicks and handle drags on the stage. A drag moves the object live; only its end is written.
  useEffect(() => {
    if (!editable) return;
    const offTap = editable.onTap((picked) => onChoose.current?.(picked.target));
    const offEdit = editable.onEdit((e) => {
      if (e.final) onMoved.current?.(e.target, e.transform);
    });
    // Esc during a drag, a handle's or a hand's (0073), puts it back with no step; otherwise
    // the key is left for whatever else uses it.
    const onKey = (k: KeyboardEvent) => {
      if (k.key !== 'Escape' || !editable.cancelDrag()) return;
      k.preventDefault();
      k.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      offTap();
      offEdit();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [editable]);

  // The stage's editing half, for the Pose panel's hands and feet (7.16), once the set-up shows.
  const ready = shown > 0;
  useEffect(() => {
    if (!editable || !ready) return;
    onEditable.current?.(editable);
    return () => onEditable.current?.(null);
  }, [editable, ready]);

  // What's chosen in the list has the stage's outline and handles, once the set-up is shown.
  const chosen = props.chosen ?? null;
  useEffect(() => {
    if (!editable || shown === 0) return;
    try {
      editable.choose(chosen);
    } catch {
      // Not on the stage: gone in a change the stage hasn't been shown yet.
      editable.choose(null);
    }
  }, [editable, chosen, shown]);

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
    quiet();
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
                  quiet();
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
      <DropZone
        className={running ? 'pr-scene-view pr-scene-running' : 'pr-scene-view'}
        aria-label={words.t('production.view.drop')}
        isDisabled={!(idle && canEdit && editable && props.onDropModel)}
        getDropOperation={(types) => (types.has(MODEL_DRAG_TYPE) ? 'copy' : 'cancel')}
        onDrop={(e) => {
          void (async () => {
            for (const dropped of e.items) {
              if (dropped.kind !== 'text' || !dropped.types.has(MODEL_DRAG_TYPE)) continue;
              const id = await dropped.getText(MODEL_DRAG_TYPE);
              // The drop's point is from the view's top left, as the stage's `pick` wants it.
              props.onDropModel?.(id, editable?.pick(e.x, e.y).ground ?? null);
              return;
            }
          })();
        }}
      >
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
      </DropZone>
      {/* Always there, so the Code editor below doesn't move as the stage gets ready or a run starts. */}
      <div className="pr-scene-tools">
        <Segmented
          label={words.t('production.view.label')}
          isDisabled={!idle || !editable}
          options={[
            { id: 'camera', label: words.t('production.view.camera') },
            { id: 'look', label: words.t('production.view.look') },
          ]}
          value={looking ? 'look' : 'camera'}
          onChange={(v) => {
            editable?.lookAround(v === 'look');
            setLooking(v === 'look');
          }}
        />
        {editable && idle && looking && canEdit && props.onMoveCamera && (
          <Button
            variant="secondary"
            icon="videocam"
            onPress={() => props.onMoveCamera?.(editable.viewTransform())}
          >
            {words.t('production.view.moveCamera')}
          </Button>
        )}
        {editable && idle && canEdit && props.onAddMarker && (
          <Button
            variant="secondary"
            icon="keep"
            onPress={() => props.onAddMarker?.(editable.viewTransform())}
          >
            {words.t('production.view.addMarker')}
          </Button>
        )}
        {props.onSetUp && (
          <Button variant="secondary" icon="groups" isDisabled={!idle} onPress={props.onSetUp}>
            {words.t('production.fromStoryboard.button')}
          </Button>
        )}
        {shot && (
          <p className="pr-in-shot">
            {shot.length > 0
              ? words.t('production.view.inShot', { names: shot.join(', ') })
              : words.t('production.view.inShotNone')}
          </p>
        )}
      </div>
      {/* Move the view: always there, so nothing below moves as the stage gets ready. */}
      <ViewPad
        isDisabled={!editable || !idle || (!looking && !(canEdit && props.onCameraStepped))}
        onMove={(step) => {
          if (!editable) return;
          if (looking) return void editable.viewStep(step);
          // Camera view: the scene's camera moves live while held, and is written once let go.
          const last = carried.current;
          const still = last && sameTransform(last.transform, editable.viewTransform());
          const { transform, around } = editable.steppedCamera(
            step,
            still ? last.around : undefined,
          );
          editable.setObject(CAMERA, { transform });
          carried.current = { transform: editable.viewTransform(), around };
          held.current = { step: held.current?.step ?? step, transform };
        }}
        onMoveEnd={() => {
          const hold = held.current;
          held.current = null;
          if (hold) props.onCameraStepped?.(hold.transform, hold.step);
        }}
      />
      {problem && <NeutralNote>{problem}</NeutralNote>}
      {props.silentLines && <NeutralNote>{props.silentLines}</NeutralNote>}
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

/** Whether two places for the camera are the same, to a hair (the stage may round them). */
function sameTransform(a: Transform, b: Transform): boolean {
  const near = (p: number, q: number) => Math.abs(p - q) < 1e-6;
  const { position: ap, rotation: ar, scale: as } = a;
  const { position: bp, rotation: br, scale: bs } = b;
  return (
    near(ap.x, bp.x) &&
    near(ap.y, bp.y) &&
    near(ap.z, bp.z) &&
    near(ar.x, br.x) &&
    near(ar.y, br.y) &&
    near(ar.z, br.z) &&
    near(ar.w, br.w) &&
    near(as.x, bs.x) &&
    near(as.y, bs.y) &&
    near(as.z, bs.z)
  );
}
