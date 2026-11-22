import type { NodeId } from '@storystage/ast';
import type { EditorHost, EditorId } from '@storystage/editor-contract';
import type { CheckItem, FrameId, Production, SceneId } from '@storystage/production';
import type { RuntimeWorker } from '@storystage/playback';
import { Button, Icon, NeutralNote, messages as uiMessages } from '@storystage/ui';
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { Voices } from '../speech/voices.ts';
import { VoicesDownload } from '../speech/VoicesDownload.tsx';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import { sceneNumber } from '../storyboard/edits.ts';
import { sceneFrames } from '../storyboard/frames.ts';
import type { Highlights } from './BlocksPanel.tsx';
import { CodeEditor } from './CodeEditor.tsx';
import type { RehearsalState } from './rehearsal.ts';
import { NONE_REHEARSED, framesReached, withRehearsed, type Rehearsed } from './frameProgress.ts';
import { ProductionFrames } from './ProductionFrames.tsx';
import { HistoryButtons, useHistory } from '../history.tsx';
import { FrameCheck } from './FrameCheck.tsx';
import { FrameLinks } from './FrameLinks.tsx';
import {
  chosenPlan,
  modelKey,
  newObjectType,
  placeFromStoryboard,
  storyboardPlan,
  type PlanBackstage,
} from '@storystage/staging';
import { StoryboardSetup } from './StoryboardSetup.tsx';
import { liveLinks, withLink } from './links.ts';
import { MARKER_KEY, ObjectsPanel } from './ObjectsPanel.tsx';
import { poseJoints } from './pose.ts';
import { BackstageRail } from './BackstageRail.tsx';
import { refusalWords } from './refusals.ts';
import {
  backdropPartOf,
  dragKind,
  facingCamera,
  inFrontOfCamera,
  withBackdrop,
  withCamera,
  withMarker,
  addMarker,
} from './setup.ts';
import { addObject, objectName, withObject } from '@storystage/production';
import type { EditTarget } from '@storystage/stage';
import {
  CAMERA,
  type BackstageId,
  type ObjectId,
  type Transform,
  type Vec3,
} from '@storystage/story-api';
import type { BackstageItem } from '@storystage/backstage';
import { useCheckRun } from '../check/useCheckRun.ts';
import type { Studio, StudioSource } from '../studio.ts';
import { sceneNumber as numberOfScene } from '../storyboard/edits.ts';
import type { Place } from '../storyboard/place.ts';
import type { PanelPhase, PrompterPanel } from '@storystage/prompter';
import { PrompterAside } from '../prompter/PrompterAside.tsx';
import type { StepWorld } from '../prompter/StepEditor.tsx';

const SceneView = lazy(() => import('./SceneView.tsx'));

export interface ProductionStageProps {
  production: Production;
  /** The current scene, shared with the Storyboard; `null` with no scenes. */
  scene: SceneId | null;
  host: EditorHost;
  onGoToStoryboard: () => void;
  /** The polite live region's words: what the editors and the stage announce. */
  announcement: string;
  /** A block to open the Code editor at (Screening's Fix), with a count so each request is new. */
  reveal?: { readonly node: NodeId; readonly n: number } | null;
  /**
   * The App's one model source, for the scene view's stage. Without it there's no scene view
   * (the Code editor's own tests).
   */
  models?: ModelSourceHandle;
  /** Says something in the polite live region. */
  onAnnounce?: (text: string) => void;
  /** False while Learn or Settings covers the tab: Rehearse pauses. Default true. */
  active?: boolean;
  /** For tests: how the scene view's stage and runtime worker are made. */
  makeStage?: StageMaker;
  startWorker?: () => RuntimeWorker;
  /** The class's default code editor, from policy (`editor.default`; 14-editors 4.3). */
  editorDefault?: EditorId;
  /**
   * The school lets an imported Alice world's Code editor open before it's storyboarded (policy
   * `storyboard.allowImportedWithoutStoryboard`; 10.8, 07-ux 1.4). Default false.
   */
  allowImportedWithoutStoryboard?: boolean;
  /** Speak lines' voices, for Rehearse (spec 06 section 4.5). */
  voices?: Voices | null;
  /** The current frame, shared with the other tabs; the strip shows it chosen. */
  frame?: FrameId | null;
  /** The learner chose a frame on the strip. Without it there's no strip. */
  onPlaceChange?: (place: Place) => void;
  /** The frames Rehearse has played since they last changed, kept by the App for the session. */
  rehearsed?: Rehearsed;
  onRehearsed?: (next: Rehearsed) => void;
  /** The studio, for the frame's automatic check (spec 08 section 9). Without it, no check. */
  studio?: Studio;
  /** Opens the Code editor at a block: the check's Go to the block. */
  onReveal?: (node: NodeId) => void;
  /**
   * The Prompter (WP13c), drawn beside the scene view and the code. `null` in the browser version,
   * which says so where the panel would be (07-ux 2.4, screen 12b); left out, neither (tests).
   */
  prompter?: PrompterPanel<StudioSource> | null;
  /** Opens the Prompter's set-up wizard, for the panel's Set up… (WP13.6). */
  onSetUp?: () => void;
  /** A study task's card, in the Prompter's place on the right (spec 14 section 6.4). */
  taskCard?: ReactNode;
  /** A study task holds the class's editor, with these words beside the switch (6.5). */
  heldEditor?: string | null;
}

/** The current frame's check, with its own run, which stops when the learner leaves the tab. */
function FrameCheckArea({
  studio,
  models,
  frameId,
  makeStage,
  startWorker,
  onReveal,
  onShowFrame,
  host,
  onAsk,
}: {
  studio: Studio;
  models: ModelSourceHandle;
  frameId: FrameId;
  makeStage?: StageMaker | undefined;
  startWorker?: (() => RuntimeWorker) | undefined;
  onReveal: (node: NodeId) => void;
  onShowFrame: () => void;
  /** The code editors' host: "Use the script's words" is a program edit, one undo step. */
  host: EditorHost;
  /** Asks the Prompter about a flag, with the frame's number; left out when it can't be asked. */
  onAsk?: ((item: CheckItem, frame: FrameId, number: string) => void) | undefined;
}) {
  const check = useCheckRun({
    studio,
    models,
    ...(makeStage ? { makeStage } : {}),
    ...(startWorker ? { startWorker } : {}),
  });
  const p = studio.production;
  const frame = p.frames.find((f) => f.id === frameId);
  if (!frame) return null;
  const index = sceneFrames(p, frame.scene).findIndex((f) => f.id === frame.id);
  const number = `${numberOfScene(p, frame.scene)}.${index + 1}`;
  return (
    <FrameCheck
      production={p}
      frame={frame}
      number={number}
      {...(onAsk ? { onAsk: (item: CheckItem) => onAsk(item, frame.id, number) } : {})}
      check={check}
      readOnly={studio.readOnly !== null}
      onGoToBlock={onReveal}
      onGoToStoryboard={onShowFrame}
      onEdit={(edit) => void host.apply([edit], edit.label ?? '', 'blocks')}
    />
  );
}

const NO_MARKS: Highlights = { rehearse: [], error: [] };

/** The panel's phases in which it waits for a question. */
const ASKABLE: readonly PanelPhase[] = ['ready', 'planned', 'built', 'problem'];

/**
 * The scenes whose "Set up this scene from your storyboard?" the learner has answered, for each
 * film's session, with the cast it offered then: it's offered once a session, then waits behind
 * Set up from storyboard, unless the storyboard gains cast of its own.
 */
const answered = new WeakMap<object, Map<SceneId, Set<string>>>();

const DRAG_STEP = {
  move: 'production.objects.moveStep',
  turn: 'production.objects.turnStep',
  size: 'production.objects.sizeStep',
} as const;

/**
 * A handle drag let go, as one undo step: an object named for what the drag did ("Turn
 * penguin"), the camera, or a marker. `null` when there's nothing to write.
 */
function moved(
  p: Production,
  scene: SceneId,
  target: EditTarget,
  transform: Transform,
): { label: string; next: Production } | null {
  const setup = p.scenes.find((s) => s.id === scene)?.setup;
  if (!setup) return null;
  if ('marker' in target)
    return {
      label: words.t('production.view.markerStep'),
      next: withMarker(p, scene, target.marker, transform),
    };
  if (target.object === CAMERA)
    return {
      label: words.t('production.view.cameraStep'),
      next: withCamera(p, scene, transform),
    };
  const object = setup.objects.find((o) => o.id === target.object);
  if (!object) return null;
  const next = withObject(p, scene, object.id, { transform });
  if ('code' in next) return null;
  const kind = dragKind(object.transform, transform);
  return { label: words.t(DRAG_STEP[kind], { name: object.id }), next };
}

/**
 * The block last chosen in the code, read again after each click and key press in it: the editor
 * contract has no selection event, and the selection only changes on one. Only a choice changes
 * it: a block chosen, or a click on the code's empty space. Moving focus out through the palette
 * to Link keeps it, though the editor lets go of its selection as focus leaves.
 */
function useChosenBlock(editorRef: { current: { selection(): readonly NodeId[] } | null }) {
  const [chosen, setChosen] = useState<NodeId | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (e: Event) => {
      const at = e.target instanceof Element ? e.target : null;
      if (!at?.closest('.pr-workspace')) return;
      const cleared = e.type === 'pointerup' && !at.closest('.blocklyFlyout');
      clearTimeout(timer);
      // After the editor has handled the event.
      timer = setTimeout(() => {
        const block = editorRef.current?.selection()[0] ?? null;
        if (block || cleared) setChosen(block);
      }, 0);
    };
    document.addEventListener('pointerup', read, true);
    document.addEventListener('keyup', read, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerup', read, true);
      document.removeEventListener('keyup', read, true);
    };
  }, [editorRef]);
  return chosen;
}

/** Rehearse's state as the Code editor's marks: the blocks running, and the error with its words. */
function marksOf(state: RehearsalState | null): Highlights {
  if (!state) return NO_MARKS;
  const node = state.error?.node;
  return {
    rehearse: state.running.map((n) => ({ node: n })),
    error: node && state.error ? [{ node, message: state.error.words }] : [],
  };
}

/** What the scene still needs before its Code editor opens (`07-ux.md` section 1.4; 10.8). */
export function storyboardChecks(p: Production, scene: SceneId) {
  const card = p.storyboard.cards.find((c) => c.id === scene);
  const n = sceneNumber(p, scene);
  const name = words.t('storyboard.script.scene', { n }).toLowerCase();
  return [
    {
      label: words.t('production.closed.loglineSynopsis'),
      done: p.storyboard.logline.trim() !== '' && p.storyboard.synopsis.trim() !== '',
    },
    {
      label: words.t('production.closed.heading', { scene: name }),
      done: (card?.heading.trim() ?? '') !== '',
    },
    { label: words.t('production.closed.frame'), done: sceneFrames(p, scene).length > 0 },
  ];
}

/** The scene's name on the scene view's band: "Scene 1: The kite", or "Scene 1" before it has one. */
/** The blocks the latest request added, while it builds and once it's built: one string, so it's stable. */
function usePrompterNodes(panel: PrompterPanel<StudioSource> | null): string {
  return useSyncExternalStore(
    (l) => panel?.subscribe(l) ?? (() => {}),
    () => {
      const state = panel?.state;
      if (!state || (state.phase !== 'building' && state.phase !== 'built')) return '';
      const asked = state.entries.findLastIndex((e) => e.kind === 'asked');
      return state.entries
        .slice(asked + 1)
        .flatMap((e) => (e.kind === 'change' ? e.nodes : []))
        .join(' ');
    },
  );
}

export function sceneTitle(p: Production, scene: SceneId): string {
  const n = sceneNumber(p, scene);
  const heading = p.storyboard.cards.find((c) => c.id === scene)?.heading.trim() ?? '';
  return heading
    ? words.t('production.sceneView.titled', { n, heading })
    : words.t('storyboard.script.scene', { n });
}

/**
 * Undo and Redo for the scene view and the Code editor (`07-ux.md` section 7.5): the studio's one
 * history, so a step undoes here whichever tab made it. The keys work while the tab shows.
 */
function StageHistory({
  studio,
  onAnnounce,
  active,
}: {
  studio: Studio;
  onAnnounce: (text: string) => void;
  active: boolean;
}) {
  const history = useHistory(studio, onAnnounce, active);
  return (
    <div className="pr-toolbar" role="toolbar" aria-label={words.t('history.label')}>
      <HistoryButtons history={history} />
    </div>
  );
}

/**
 * The Production stage (`07-ux.md` section 7; WP7): the scene view with Rehearse (sections 7.2
 * and 7.4) above the Code editor, which stays closed until the scene is storyboarded (section
 * 1.4). The frame strip, Backstage's rail and editing the set-up join it as the stage's editing
 * contract (S3) lands.
 */
export function ProductionStage({
  production: p,
  scene,
  host,
  onGoToStoryboard,
  announcement,
  reveal = null,
  models,
  onAnnounce = () => {},
  active = true,
  makeStage,
  startWorker,
  frame = null,
  onPlaceChange,
  rehearsed = NONE_REHEARSED,
  onRehearsed,
  studio,
  onReveal,
  voices = null,
  editorDefault,
  allowImportedWithoutStoryboard = false,
  prompter,
  onSetUp,
  taskCard,
  heldEditor = null,
}: ProductionStageProps) {
  const voicesState = useSyncExternalStore(
    (l) => voices?.subscribe(l) ?? (() => {}),
    () => voices?.state ?? null,
  );
  const silentLines =
    voicesState?.status === 'unavailable'
      ? words.t('production.voices.unavailable')
      : voicesState &&
          voicesState.silent > 0 &&
          voicesState.status !== 'ask' &&
          voicesState.status !== 'downloading'
        ? words.plural('production.voices.silent', voicesState.silent)
        : null;
  const checks = scene ? storyboardChecks(p, scene) : [];
  // An imported Alice world arrives with code and no storyboard; a school may let it be coded as it is.
  const relaxed = allowImportedWithoutStoryboard && p.manifest.origin === 'alice';
  const open = scene !== null && (relaxed || checks.every((c) => c.done));
  // The Prompter panel, open or folded to its rail: asking from the frame card opens it.
  const [prompterOpen, setPrompterOpen] = useState(true);
  const prompterState = useSyncExternalStore(
    (l) => prompter?.subscribe(l) ?? (() => {}),
    () => prompter?.state ?? null,
  );
  // A flag can be asked about while the Prompter is waiting for a question (11.6).
  const askAbout =
    prompter &&
    !taskCard &&
    prompterState &&
    prompterState.modes.includes('explain') &&
    ASKABLE.includes(prompterState.phase)
      ? (item: CheckItem, frameId: FrameId, number: string) => {
          studio?.seal();
          setPrompterOpen(true);
          prompter.setMode('explain');
          // The flag goes as data (`asked` in the check result), never in the question: its words
          // are saved in the film, so a shared film could make them say anything (spec 04, 11.6).
          void prompter.ask(words.t('production.check.askText', { frame: number }), {
            frame: frameId,
            item: item.id,
          });
        }
      : undefined;
  const [rehearsal, setRehearsal] = useState<RehearsalState | null>(null);
  // What the last add from Backstage said, when it couldn't.
  const [stageNote, setStageNote] = useState<string | null>(null);
  // What's chosen on the stage and in Objects in this scene, for the scene it was chosen in.
  const [choice, setChoice] = useState<{ scene: SceneId; target: EditTarget } | null>(null);
  const chosen = choice && choice.scene === scene ? choice.target : null;
  // Set the stage from the storyboard (WP10.10): what it shows that the stage doesn't have yet.
  const planBackstage = useMemo<PlanBackstage | null>(
    () =>
      models
        ? {
            item: (id) => models.item(id as BackstageId),
            backdrops: models.catalogue.filter((i) => i.section === 'backdrops'),
          }
        : null,
    [models],
  );
  const plan = useMemo(
    () =>
      studio && planBackstage && scene !== null && studio.readOnly === null
        ? storyboardPlan(p, scene, planBackstage)
        : [],
    [p, scene, planBackstage, studio],
  );
  // The offer, asked again by Set up from storyboard, for the scene it was asked in.
  const [asking, setAsking] = useState<SceneId | null>(null);
  const [, setAnswers] = useState(0);
  const offered = studio && scene !== null ? answered.get(studio.session)?.get(scene) : undefined;
  // Cast the storyboard has gained since the offer was answered: offered again, on their own.
  const newCast = offered
    ? plan.filter((x) => x.kind === 'object' && x.section === 'cast' && !offered.has(modelKey(x)))
    : [];
  const offer = plan.length > 0 && (!offered || asking === scene) ? plan : newCast;
  const again = offer === newCast;
  const answer = () => {
    if (!studio || scene === null) return;
    const scenes = answered.get(studio.session) ?? new Map<SceneId, Set<string>>();
    const cast = new Set(scenes.get(scene));
    for (const x of plan) if (x.kind === 'object') cast.add(modelKey(x));
    scenes.set(scene, cast);
    answered.set(studio.session, scenes);
    setAsking(null);
    setAnswers((n) => n + 1);
  };
  const placeChosen = (chosen: ReadonlySet<string>) => {
    if (!studio || scene === null || !planBackstage) return;
    const n = numberOfScene(p, scene);
    const now = studio.production;
    const these = chosenPlan(now, scene, planBackstage, offer, chosen);
    const placed = placeFromStoryboard(
      now,
      scene,
      these,
      words.t('production.fromStoryboard.step', { n }),
    );
    answer();
    if (!placed.ok) return setStageNote(refusalWords(placed.refusal, placed.name));
    const done = studio.step(placed.step);
    if (!done.ok) return setStageNote(done.reason);
    setStageNote(null);
    onAnnounce(words.plural('production.fromStoryboard.placed', these.length));
  };
  const hasFrames = scene !== null && sceneFrames(p, scene).length > 0;
  const choose = (target: EditTarget | null) =>
    setChoice(target && scene !== null ? { scene, target } : null);
  // Only a change in what's marked gives the editor new marks.
  const running = rehearsal?.running;
  const error = rehearsal?.error;
  const marks = useMemo(() => marksOf(rehearsal), [running, error]); // eslint-disable-line react-hooks/exhaustive-deps
  const editorRef = useRef<{ selection(): readonly NodeId[] } | null>(null);
  const chosenBlock = useChosenBlock(editorRef);
  // The current frame, when it's this scene's, and its links marked on the blocks (WP10.8).
  const current = p.frames.find((f) => f.id === frame && f.scene === scene) ?? null;
  const frameNumber =
    current && scene !== null
      ? `${numberOfScene(p, scene)}.${sceneFrames(p, scene).findIndex((f) => f.id === current.id) + 1}`
      : '';
  const linked = current ? liveLinks(p, current).join(' ') : '';
  // What plan steps are changed against beyond the panel's own choices: the scene's lines.
  const stepWorld = useMemo<StepWorld | null>(() => {
    if (scene === null) return null;
    return {
      lines: p.script
        .filter((l) => l.scene === scene)
        .map((l) => ({ id: l.id, words: l.character ? `${l.character}: ${l.text}` : l.text })),
    };
  }, [p, scene]);
  // The blocks the Prompter's request added, marked as they land (spec 04 section 6.1, step 8).
  const built = usePrompterNodes(prompter ?? null);
  const highlights = useMemo(() => {
    const withLinks = linked
      ? { ...marks, link: linked.split(' ').map((n) => ({ node: n as NodeId })) }
      : marks;
    return built
      ? { ...withLinks, prompter: built.split(' ').map((n) => ({ node: n as NodeId })) }
      : withLinks;
  }, [marks, linked, built]);
  const setup = scene ? p.scenes.find((s) => s.id === scene)?.setup : undefined;
  const unavailable = !open
    ? words.t('production.rehearse.codeClosed')
    : (setup?.objects.length ?? 0) === 0
      ? words.t('production.rehearse.empty')
      : null;
  const use = (item: BackstageItem, ground: Vec3 | null = null) => {
    if (!studio || scene === null) return;
    const now = studio.production;
    const setup = now.scenes.find((s) => s.id === scene)?.setup;
    if (!setup) return;
    if (item.section === 'backdrops') {
      const part = backdropPartOf(item.class);
      if (!part) return;
      studio.commit(
        words.t('production.backstage.useStep', {
          name: item.displayName,
          part: words.t(`production.backstage.part.${part}`),
        }),
        withBackdrop(now, scene, part, item.id),
      );
      setStageNote(null);
      return;
    }
    const name = objectName(now, scene, item.displayName);
    if (!name) return;
    const result = addObject(
      now,
      scene,
      {
        model: item.id,
        class: item.class,
        name: item.displayName,
        // Of the learner's class for the model once there is one, so it has its moves (0074).
        type: newObjectType(now, { model: item.id, class: item.class, name: item.displayName }),
        // Where it was dropped, or in front of the camera for Add and Enter.
        transform: ground
          ? facingCamera(setup.camera.transform, ground)
          : inFrontOfCamera(setup.camera.transform, setup.objects.length),
      },
      words.t('production.backstage.addStep', { name }),
    );
    if (!result.ok) return setStageNote(refusalWords(result.refusal, name));
    const done = studio.step(result.step);
    if (!done.ok) return setStageNote(done.reason);
    setStageNote(null);
    // The new object is chosen, so its handles show where it landed.
    choose({ object: name as ObjectId });
    onAnnounce(
      words.t(ground ? 'production.backstage.dropped' : 'production.backstage.added', { name }),
    );
  };

  return (
    <div className="pr">
      {/* The frame strip, with Undo and Redo at its end, so they take no row of their own. */}
      <div className="pr-head">
        {onPlaceChange && (
          <ProductionFrames
            production={p}
            frame={frame}
            rehearsed={rehearsed}
            onPlaceChange={onPlaceChange}
          />
        )}
        {studio && <StageHistory studio={studio} onAnnounce={onAnnounce} active={active} />}
      </div>
      <div className="pr-work">
        <div className="pr-main">
          {voices && <VoicesDownload voices={voices} />}
          {stageNote && <NeutralNote>{stageNote}</NeutralNote>}
          {offer.length > 0 && scene !== null && (
            <StoryboardSetup
              key={`${scene}:${again}`}
              plan={offer}
              again={again}
              frameNumber={`${numberOfScene(p, scene)}.1`}
              onPlace={placeChosen}
              onNotNow={answer}
            />
          )}
          <div className="pr-top">
            {studio && models && scene !== null && (
              <BackstageRail
                catalogue={models.catalogue}
                thumbnail={(id) => models.thumbnail(id)}
                canAdd={studio.readOnly === null}
                onUse={(item) => use(item)}
              />
            )}
            {scene !== null && models && (
              // The same height as the scene view, band and all, so nothing below moves as it loads.
              <Suspense
                fallback={
                  <div className="pr-scene" aria-hidden="true">
                    <div className="pr-scene-band">
                      <p className="pr-scene-title">{sceneTitle(p, scene)}</p>
                      <div className="pr-scene-controls pr-scene-controls-waiting" />
                    </div>
                    {unavailable && <p className="pr-scene-why">{unavailable}</p>}
                    <div className="pr-scene-view" />
                    <div className="pr-scene-tools pr-scene-controls-waiting" />
                  </div>
                }
              >
                <SceneView
                  production={p}
                  scene={scene}
                  title={sceneTitle(p, scene)}
                  models={models}
                  unavailable={unavailable}
                  selectedBlock={() => editorRef.current?.selection()[0] ?? null}
                  onRehearsal={(state) => {
                    setRehearsal(state);
                    // The frames this run has reached are Rehearsed until they change (section 2.3).
                    if (!onRehearsed) return;
                    const reached = framesReached(
                      p,
                      scene,
                      state.ran,
                      state.status === 'ended' && state.reachedEnd,
                    );
                    const next = withRehearsed(rehearsed, p, reached);
                    if (next !== rehearsed) onRehearsed(next);
                  }}
                  onAnnounce={onAnnounce}
                  active={active}
                  {...(makeStage ? { makeStage } : {})}
                  {...(startWorker ? { startWorker } : {})}
                  speaker={voices ?? undefined}
                  silentLines={silentLines}
                  chosen={chosen}
                  onChoose={choose}
                  {...(studio && studio.readOnly === null && hasFrames && offer.length === 0
                    ? {
                        onSetUp: () => {
                          if (plan.length > 0) return setAsking(scene);
                          setStageNote(words.t('production.fromStoryboard.nothing'));
                        },
                      }
                    : {})}
                  canEdit={!!studio && studio.readOnly === null}
                  onMoved={(target, transform) => {
                    if (!studio) return;
                    const step = moved(studio.production, scene, target, transform);
                    if (step) studio.commit(step.label, step.next);
                  }}
                  onDropModel={(id, ground) => {
                    const item = models.catalogue.find((i) => i.id === id);
                    if (item) use(item, ground);
                  }}
                  onAddMarker={(transform) => {
                    if (!studio) return;
                    const { production: next, id } = addMarker(studio.production, scene, transform);
                    studio.commit(words.t('production.view.addMarkerStep', { name: id }), next);
                    choose({ marker: id });
                    onAnnounce(words.t('production.view.markerAdded', { name: id }));
                  }}
                  onMoveCamera={(transform) => {
                    if (!studio) return;
                    studio.commit(
                      words.t('production.view.cameraStep'),
                      withCamera(studio.production, scene, transform),
                    );
                    onAnnounce(words.t('production.view.cameraMoved'));
                  }}
                />
              </Suspense>
            )}
            {studio && models && scene !== null && (
              <div className="pr-side">
                <ObjectsPanel
                  studio={studio}
                  scene={scene}
                  chosen={
                    chosen === null
                      ? null
                      : 'marker' in chosen
                        ? `${MARKER_KEY}${chosen.marker}`
                        : chosen.object
                  }
                  onChoose={(key) =>
                    choose(
                      key === null
                        ? null
                        : key.startsWith(MARKER_KEY)
                          ? { marker: key.slice(MARKER_KEY.length) }
                          : { object: key as ObjectId },
                    )
                  }
                  onAnnounce={onAnnounce}
                  poseJoints={(o) =>
                    typeof o.model === 'string'
                      ? poseJoints(o.class, models.item(o.model)?.joints)
                      : []
                  }
                  {...(onReveal ? { onReveal } : {})}
                  modelName={(o) =>
                    typeof o.model === 'string'
                      ? (models.item(o.model)?.displayName ?? null)
                      : words.t('production.objects.standIn', { kind: o.model.standIn })
                  }
                />
                {/* The browser version says so where the Prompter would be (12b), in the side
                    column, so the code below keeps its height. */}
                {prompter === null && !taskCard && (
                  <NeutralNote>{uiMessages.t('note.prompterNotInBrowser')}</NeutralNote>
                )}
                {frame && open && (
                  <FrameCheckArea
                    studio={studio}
                    models={models}
                    frameId={frame}
                    makeStage={makeStage}
                    startWorker={startWorker}
                    onReveal={(node) => onReveal?.(node)}
                    host={host}
                    onAsk={askAbout}
                    onShowFrame={() => {
                      const chosen = p.frames.find((f) => f.id === frame);
                      if (chosen) onPlaceChange?.({ scene: chosen.scene, frame: chosen.id });
                      onGoToStoryboard();
                    }}
                  />
                )}
              </div>
            )}
          </div>
          {scene === null ? (
            <div className="pr-closed">
              <p>{words.t('production.noScene')}</p>
              <Button variant="secondary" icon="draw" onPress={onGoToStoryboard}>
                {words.t('production.closed.goToStoryboard')}
              </Button>
            </div>
          ) : open ? (
            <>
              {studio && current && (
                <FrameLinks
                  production={p}
                  frame={current}
                  number={frameNumber}
                  readOnly={studio.readOnly !== null}
                  chosen={chosenBlock}
                  onLink={(block, link) => {
                    const next = withLink(studio.production, current.id, block, link);
                    if (next === studio.production) return;
                    const n = frameNumber;
                    studio.commit(
                      words.t(link ? 'production.links.linkStep' : 'production.links.unlinkStep', {
                        n,
                      }),
                      next,
                    );
                    onAnnounce(
                      words.t(link ? 'production.links.linked' : 'production.links.unlinked', {
                        n,
                      }),
                    );
                  }}
                />
              )}
              <CodeEditor
                production={p}
                scene={scene}
                host={host}
                key={reveal ? `reveal-${reveal.n}` : 'code'}
                reveal={reveal?.node ?? null}
                highlights={highlights}
                editorRef={editorRef}
                {...(editorDefault ? { editorDefault } : {})}
                held={heldEditor}
                modelName={(id) => models?.item(id)?.displayName ?? null}
                {...(onReveal ? { onReveal } : {})}
              />
            </>
          ) : (
            <section className="pr-closed" aria-labelledby="pr-closed-title">
              <h2 id="pr-closed-title" className="pr-closed-title">
                {words.t('production.closed.title', {
                  scene: words
                    .t('storyboard.script.scene', { n: sceneNumber(p, scene) })
                    .toLowerCase(),
                })}
              </h2>
              <p>{words.t('production.closed.why')}</p>
              <ul className="pr-checklist">
                {checks.map((c) => (
                  <li key={c.label} className="pr-check" data-done={c.done || undefined}>
                    <Icon
                      name={c.done ? 'check_circle' : 'radio_button_unchecked'}
                      filled={c.done}
                    />
                    <span>{c.label}</span>
                    <span className="pr-check-state">
                      {words.t(c.done ? 'production.closed.done' : 'production.closed.todo')}
                    </span>
                  </li>
                ))}
              </ul>
              <Button variant="primary" icon="draw" onPress={onGoToStoryboard}>
                {words.t('production.closed.goToStoryboard')}
              </Button>
            </section>
          )}
        </div>
        {taskCard}
        {prompter && !taskCard && (
          <PrompterAside
            panel={prompter}
            {...(onSetUp ? { onSetUp } : {})}
            frame={current ? { id: current.id, number: frameNumber } : null}
            open={prompterOpen}
            onOpenChange={setPrompterOpen}
            onAnnounce={onAnnounce}
            canChange={!studio || studio.readOnly === null}
            {...(studio ? { seal: studio.seal } : {})}
            {...(stepWorld ? { world: stepWorld } : {})}
          />
        )}
      </div>
      {/* React Aria's mark for a live announcer: its modals make the rest of the page inert, and
          this must still be heard, as at Repeat…, which opens Change step as it speaks. */}
      <p className="ss-visually-hidden" aria-live="polite" data-live-announcer="true">
        {announcement}
      </p>
    </div>
  );
}
