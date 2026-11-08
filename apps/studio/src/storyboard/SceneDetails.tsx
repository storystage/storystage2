import {
  deleteScene,
  type Production,
  type SceneId,
  type Transition,
} from '@storystage/production';
import type { StandIn } from '@storystage/story-api';
import { Button, Dialog, NeutralNote, Segmented, TextField } from '@storystage/ui';
import { useState } from 'react';
import { words } from '../strings.ts';
import {
  LIMITS,
  framesOf,
  sceneNumber,
  setCardArcPart,
  setCardHeading,
  setTransition,
} from './edits.ts';
import { partName } from './ScriptHeader.tsx';

export interface SceneDetailsProps {
  production: Production;
  scene: SceneId;
  onChange: (label: string, next: Production, key?: string) => void;
  onLeave: () => void;
  /** After a delete, the strip chooses another scene. */
  onDeleted: () => void;
}

/** The "None" choice: no part of the arc. An arc's parts are words, so this can't be one. */
const NO_PART = '~none';

const TRANSITIONS: readonly Transition['kind'][] = ['cut', 'fadeToBlack', 'crossfade'];

/** A cast member's name: a stand-in's label, or the last part of a Backstage id. */
const castName = (member: string | StandIn) =>
  typeof member === 'string' ? (member.split('/').at(-1) ?? member) : member.standIn;

/**
 * The chosen scene's card in full (`07-ux.md` section 6.4): its heading (place and time), part of
 * the arc, how it ends, its cast, and Delete scene, which asks first. The cast is filled from
 * Backstage (10.9).
 */
export function SceneDetails({
  production: p,
  scene,
  onChange,
  onLeave,
  onDeleted,
}: SceneDetailsProps) {
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const card = p.storyboard.cards.find((c) => c.id === scene);
  const entry = p.manifest.runningOrder.find((r) => r.scene === scene);
  if (!card || !entry) return null;
  const n = sceneNumber(p, scene);
  const last = n === p.manifest.runningOrder.length;
  const frameCount = framesOf(p, scene).length;
  const { parts } = p.storyboard.arc;

  const remove = () => {
    const result = deleteScene(p, scene, words.t('step.deleteScene', { n }));
    if (!result.ok) {
      setRefusal(result.refusal.code === 'refused' ? result.refusal.reason : null);
      return;
    }
    setConfirming(false);
    onChange(result.step.label, result.step.production);
    onDeleted();
  };

  return (
    <section className="sb-details" aria-labelledby="sb-details-title">
      <h2 id="sb-details-title" className="sb-details-title">
        {words.t('storyboard.scene.details', { n })}
      </h2>
      <div className="sb-row">
        <TextField
          label={words.t('storyboard.scene.heading')}
          placeholder={words.t('storyboard.scene.headingPlaceholder')}
          value={card.heading}
          maxLength={LIMITS.heading}
          onChange={(v) =>
            onChange(
              words.t('step.heading', { n }),
              setCardHeading(p, scene, v),
              `heading:${scene}`,
            )
          }
          onBlur={onLeave}
        />
      </div>
      {parts.length > 0 && (
        <div className="sb-details-row">
          <span className="sb-details-label" aria-hidden="true">
            {words.t('storyboard.scene.arcPart')}
          </span>
          <Segmented
            label={words.t('storyboard.scene.arcPart')}
            options={[
              { id: NO_PART, label: words.t('storyboard.scene.noPart') },
              ...parts.map((part) => ({ id: part, label: partName(part) })),
            ]}
            value={card.arcPart ?? NO_PART}
            onChange={(part) =>
              onChange(
                part === NO_PART
                  ? words.t('step.noArcPart', { n })
                  : words.t('step.arcPart', { n, part: partName(part) }),
                setCardArcPart(p, scene, part === NO_PART ? null : part),
              )
            }
          />
        </div>
      )}
      <div className="sb-details-row">
        <span className="sb-details-label" aria-hidden="true">
          {words.t('storyboard.scene.transition')}
        </span>
        <Segmented
          label={words.t('storyboard.scene.transition')}
          options={TRANSITIONS.map((kind) => ({
            id: kind,
            label: words.t(`storyboard.transition.${kind}`),
          }))}
          value={entry.transition.kind}
          onChange={(kind) =>
            onChange(
              words.t('step.transition', {
                n,
                transition: words.t(`storyboard.transition.${kind}`).toLowerCase(),
              }),
              setTransition(p, scene, kind),
            )
          }
        />
        {last && <span className="sb-details-hint">{words.t('storyboard.scene.lastEnding')}</span>}
      </div>
      <div className="sb-details-row">
        <span className="sb-details-label">{words.t('storyboard.scene.cast')}</span>
        <span className="sb-details-cast">
          {card.cast.length === 0
            ? words.t('storyboard.scene.noCast')
            : card.cast.map(castName).join(', ')}
        </span>
      </div>
      {(frameCount < 3 || frameCount > 9) && (
        <p className="sb-details-hint">{words.t('storyboard.scene.framesHint')}</p>
      )}
      <div>
        <Button variant="quiet" icon="close" onPress={() => setConfirming(true)}>
          {words.t('storyboard.scene.delete')}
        </Button>
      </div>
      <Dialog
        isOpen={confirming}
        onOpenChange={(open) => {
          setConfirming(open);
          if (!open) setRefusal(null);
        }}
        title={words.t('storyboard.scene.deleteTitle', { n })}
        width={520}
      >
        {refusal ? (
          <NeutralNote>{refusal}</NeutralNote>
        ) : (
          <p className="sb-dialog-text">{words.t('storyboard.scene.deleteWhat')}</p>
        )}
        <div className="sb-dialog-actions">
          {!refusal && (
            <Button variant="stop" icon="close" iconFilled={false} onPress={remove}>
              {words.t('storyboard.scene.delete')}
            </Button>
          )}
          <Button variant="secondary" onPress={() => setConfirming(false)}>
            {words.t('storyboard.scene.keep')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
