import type { NodeId } from '@storystage/ast';
import type { EditorHost } from '@storystage/editor-contract';
import type { Production, SceneId } from '@storystage/production';
import type { RuntimeWorker } from '@storystage/playback';
import { Button, Icon } from '@storystage/ui';
import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import { sceneNumber } from '../storyboard/edits.ts';
import { sceneFrames } from '../storyboard/frames.ts';
import type { Highlights } from './BlocksPanel.tsx';
import { CodeEditor } from './CodeEditor.tsx';
import type { RehearsalState } from './rehearsal.ts';

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
}: ProductionStageProps) {
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
      {scene !== null && models && (
        <Suspense fallback={<div className="pr-scene-view" aria-hidden="true" />}>
          <SceneView
            production={p}
            scene={scene}
            title={sceneTitle(p, scene)}
            models={models}
            unavailable={unavailable}
            selectedBlock={() => editorRef.current?.selection()[0] ?? null}
            onRehearsal={setRehearsal}
            onAnnounce={onAnnounce}
            active={active}
            {...(makeStage ? { makeStage } : {})}
            {...(startWorker ? { startWorker } : {})}
          />
        </Suspense>
      )}
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
