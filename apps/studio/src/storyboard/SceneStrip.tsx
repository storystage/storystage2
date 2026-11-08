import {
  SCENE_LIMIT,
  addScene,
  moveScene,
  type Production,
  type SceneId,
  type SceneStep,
} from '@storystage/production';
import { Button, Icon } from '@storystage/ui';
import {
  Button as AriaButton,
  GridList,
  GridListItem,
  useDragAndDrop,
  type Key,
  type Selection,
} from 'react-aria-components';
import { words } from '../strings.ts';
import { canAddScene, framesOf, sceneNumber, sceneSeconds } from './edits.ts';
import { partName } from './ScriptHeader.tsx';

export interface SceneStripProps {
  production: Production;
  current: SceneId | null;
  onCurrentChange: (scene: SceneId) => void;
  /** A scene step (add, move): the program and the rest of the production, one undo step. */
  onStep: (step: SceneStep) => void;
}

/**
 * The scene strip (Direction A screen 01; `07-ux.md` section 6.4): a card per scene in running
 * order, with its heading, frames, length and part of the arc, then Add a scene. Reorder a card by
 * dragging its handle, or with the keyboard: Enter on the handle, the arrow keys, Enter.
 */
export function SceneStrip({ production: p, current, onCurrentChange, onStep }: SceneStripProps) {
  const order = p.manifest.runningOrder.map((r) => r.scene);
  const cards = new Map(p.storyboard.cards.map((c) => [c.id, c]));
  const ready = canAddScene(p.storyboard);
  const full = order.length >= SCENE_LIMIT;

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (e) => {
      const [moving] = [...e.keys] as SceneId[];
      if (!moving) return;
      const rest = order.filter((s) => s !== moving);
      const at = rest.indexOf(e.target.key as SceneId);
      const to = e.target.dropPosition === 'before' ? at : at + 1;
      const result = moveScene(
        p,
        moving,
        to,
        words.t('step.moveScene', { n: sceneNumber(p, moving) }),
      );
      if (result.ok) onStep(result.step);
    },
  });

  const add = () => {
    const n = order.length + 1;
    const result = addScene(p, { heading: '', label: words.t('step.addScene', { n }) });
    if (!result.ok) return;
    onStep(result.step);
    const added = result.step.production.manifest.runningOrder.at(-1)!.scene;
    onCurrentChange(added);
  };

  return (
    <section className="sb-scenes" aria-labelledby="sb-scenes-title">
      <h2 id="sb-scenes-title" className="ss-visually-hidden">
        {words.t('storyboard.scenes')}
      </h2>
      <div className="sb-scene-row">
        {order.length > 0 && (
          <GridList
            className="sb-scene-list"
            aria-label={words.t('storyboard.scenes')}
            layout="grid"
            items={order.map((id) => ({ id }))}
            selectionMode="single"
            selectionBehavior="replace"
            disallowEmptySelection
            selectedKeys={current ? [current] : []}
            onSelectionChange={(keys: Selection) => {
              if (keys === 'all') return;
              const [id] = keys as Set<Key>;
              if (id !== undefined) onCurrentChange(id as SceneId);
            }}
            dragAndDropHooks={dragAndDropHooks}
          >
            {({ id }) => {
              const card = cards.get(id)!;
              const n = sceneNumber(p, id);
              const heading = card.heading.trim() || words.t('storyboard.scene.noHeading');
              const frames = framesOf(p, id);
              return (
                <GridListItem
                  id={id}
                  textValue={words.t('storyboard.scene.title', { n, title: heading })}
                  className="sb-scene-card"
                >
                  <AriaButton
                    slot="drag"
                    className="sb-scene-handle"
                    aria-label={words.t('storyboard.scene.move', { n })}
                  >
                    <Icon name="drag_indicator" size={20} />
                  </AriaButton>
                  <span className="sb-scene-body">
                    <span className="sb-scene-top">
                      <span className="sb-scene-title">
                        {words.t('storyboard.scene.title', { n, title: heading })}
                      </span>
                      <span className="sb-scene-length">
                        {words.t('storyboard.seconds', { seconds: sceneSeconds(p, id) })}
                      </span>
                    </span>
                    {card.arcPart !== null && (
                      <span className="sb-scene-part">{partName(card.arcPart)}</span>
                    )}
                    {frames.length > 0 && (
                      <span className="sb-scene-frames">
                        {frames.map((f) => (
                          <span key={f.frame.id} className="sb-scene-frame">
                            {f.number}
                          </span>
                        ))}
                      </span>
                    )}
                  </span>
                </GridListItem>
              );
            }}
          </GridList>
        )}
        <div className="sb-scene-add">
          <Button variant="secondary" icon="add" isDisabled={!ready || full} onPress={add}>
            {words.t('storyboard.scene.add')}
          </Button>
          {!ready && (
            <span className="sb-scene-add-why">
              {words.t('storyboard.needsLoglineAndSynopsis')}
            </span>
          )}
          {ready && full && (
            <span className="sb-scene-add-why">
              {words.t('storyboard.scene.tooMany', { limit: SCENE_LIMIT })}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
