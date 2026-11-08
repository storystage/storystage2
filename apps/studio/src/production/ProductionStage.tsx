import type { EditorHost } from '@storystage/editor-contract';
import type { Production, SceneId } from '@storystage/production';
import { Button, Icon } from '@storystage/ui';
import { words } from '../strings.ts';
import { sceneNumber } from '../storyboard/edits.ts';
import { sceneFrames } from '../storyboard/frames.ts';
import { CodeEditor } from './CodeEditor.tsx';

export interface ProductionStageProps {
  production: Production;
  /** The current scene, shared with the Storyboard; `null` with no scenes. */
  scene: SceneId | null;
  host: EditorHost;
  onGoToStoryboard: () => void;
  /** The polite live region's words: what the editors and the stage announce. */
  announcement: string;
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

/**
 * The Production stage (`07-ux.md` section 7; WP7). For now its Code editor, which stays closed
 * until the scene is storyboarded (section 1.4); the frame strip, the scene view and Rehearse
 * join it as the stage's editing (S3) and the runtime (S2) land.
 */
export function ProductionStage({
  production: p,
  scene,
  host,
  onGoToStoryboard,
  announcement,
}: ProductionStageProps) {
  const checks = scene ? storyboardChecks(p, scene) : [];
  const open = scene !== null && checks.every((c) => c.done);
  return (
    <div className="pr">
      {scene === null ? (
        <div className="pr-closed">
          <p>{words.t('production.noScene')}</p>
          <Button variant="secondary" icon="draw" onPress={onGoToStoryboard}>
            {words.t('production.closed.goToStoryboard')}
          </Button>
        </div>
      ) : open ? (
        <CodeEditor production={p} scene={scene} host={host} />
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
