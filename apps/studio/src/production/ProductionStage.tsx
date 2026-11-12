import type { NodeId } from '@storystage/ast';
import type { EditorHost } from '@storystage/editor-contract';
import type { FrameId, Production, SceneId } from '@storystage/production';
import type { RuntimeWorker } from '@storystage/playback';
import { Button, Icon } from '@storystage/ui';
import { Suspense, lazy, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { Voices } from '../speech/voices.ts';
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
import { FrameCheck } from './FrameCheck.tsx';
import { useCheckRun } from '../check/useCheckRun.ts';
import type { Studio } from '../studio.ts';
import { sceneNumber as numberOfScene } from '../storyboard/edits.ts';
import type { Place } from '../storyboard/place.ts';

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
  return (
    <FrameCheck
      production={p}
      frame={frame}
      number={`${numberOfScene(p, frame.scene)}.${index + 1}`}
      check={check}
      readOnly={studio.readOnly !== null}
      onGoToBlock={onReveal}
      onGoToStoryboard={onShowFrame}
      onEdit={(edit) => void host.apply([edit], edit.label ?? '', 'blocks')}
    />
  );
}

const NO_MARKS: Highlights = { rehearse: [], error: [] };

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
export function sceneTitle(p: Production, scene: SceneId): string {
  const n = sceneNumber(p, scene);
  const heading = p.storyboard.cards.find((c) => c.id === scene)?.heading.trim() ?? '';
  return heading
    ? words.t('production.sceneView.titled', { n, heading })
    : words.t('storyboard.script.scene', { n });
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
}: ProductionStageProps) {
  const voicesState = useSyncExternalStore(
    (l) => voices?.subscribe(l) ?? (() => {}),
    () => voices?.state ?? null,
  );
  const silentLines =
    voicesState?.status === 'unavailable'
      ? words.t('production.voices.unavailable')
      : voicesState && voicesState.silent > 0
        ? words.plural('production.voices.silent', voicesState.silent)
        : null;
  const checks = scene ? storyboardChecks(p, scene) : [];
  const open = scene !== null && checks.every((c) => c.done);
  const [rehearsal, setRehearsal] = useState<RehearsalState | null>(null);
  // Only a change in what's marked gives the editor new marks.
  const running = rehearsal?.running;
  const error = rehearsal?.error;
  const highlights = useMemo(() => marksOf(rehearsal), [running, error]); // eslint-disable-line react-hooks/exhaustive-deps
  const editorRef = useRef<{ selection(): readonly NodeId[] } | null>(null);
  const setup = scene ? p.scenes.find((s) => s.id === scene)?.setup : undefined;
  const unavailable = !open
    ? words.t('production.rehearse.codeClosed')
    : (setup?.objects.length ?? 0) === 0
      ? words.t('production.rehearse.empty')
      : null;
  return (
    <div className="pr">
      {onPlaceChange && (
        <ProductionFrames
          production={p}
          frame={frame}
          rehearsed={rehearsed}
          onPlaceChange={onPlaceChange}
        />
      )}
      <div className="pr-top">
        {scene !== null && models && (
          <Suspense fallback={<div className="pr-scene-view" aria-hidden="true" />}>
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
            />
          </Suspense>
        )}
        {studio && models && frame && open && (
          <FrameCheckArea
            studio={studio}
            models={models}
            frameId={frame}
            makeStage={makeStage}
            startWorker={startWorker}
            onReveal={(node) => onReveal?.(node)}
            host={host}
            onShowFrame={() => {
              const chosen = p.frames.find((f) => f.id === frame);
              if (chosen) onPlaceChange?.({ scene: chosen.scene, frame: chosen.id });
              onGoToStoryboard();
            }}
          />
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
        <CodeEditor
          production={p}
          scene={scene}
          host={host}
          key={reveal ? `reveal-${reveal.n}` : 'code'}
          reveal={reveal?.node ?? null}
          highlights={highlights}
          editorRef={editorRef}
        />
      ) : (
        <section className="pr-closed" aria-labelledby="pr-closed-title">
          <h2 id="pr-closed-title" className="pr-closed-title">
            {words.t('production.closed.title', {
              scene: words.t('storyboard.script.scene', { n: sceneNumber(p, scene) }).toLowerCase(),
            })}
          </h2>
          <p>{words.t('production.closed.why')}</p>
          <ul className="pr-checklist">
            {checks.map((c) => (
              <li key={c.label} className="pr-check" data-done={c.done || undefined}>
                <Icon name={c.done ? 'check_circle' : 'radio_button_unchecked'} filled={c.done} />
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
      <p className="ss-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
