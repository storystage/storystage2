/**
 * Objects in this scene (`07-ux.md` section 7.2): the scene's set-up as a list beside the view,
 * its keyboard path, as the sketches are on a frame. Choosing an object shows its fields: x, y and
 * z in metres, its turn in turns (Alice's unit) and its size. Typing in a field moves it on the
 * stage, as one undo step for each run of typing ("Move penguin"). The choice is the scene view's
 * too: clicking an object on the stage chooses it here, and choosing it here gives it the stage's
 * outline and handles. From the keyboard, Enter (or Space) picks the focused object up: the arrow
 * keys, Page Up and Page Down, [ and ], and + and − move, raise, turn and resize it, and Enter,
 * Space or Esc puts it down, saying where it is. One pick-up is one undo step, as one drag is.
 */
import type { Production, SceneId } from '@storystage/production';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Input, Label, ListBox, ListBoxItem, NumberField, type Key } from 'react-aria-components';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import type { NodeId } from '@storystage/ast';
import { removeObject, withObject, type SceneRefusal } from '@storystage/production';
import { Button, NeutralNote } from '@storystage/ui';
import {
  FIELD_LIMITS,
  fieldOf,
  nudgeObject,
  withField,
  withObjectTransform,
  type SetupField,
} from './setup.ts';
import { refusalWords } from './refusals.ts';

const FIELDS: readonly SetupField[] = ['x', 'y', 'z', 'turn', 'size'];

const STEP_WORD: Record<
  SetupField,
  'production.objects.moveStep' | 'production.objects.turnStep' | 'production.objects.sizeStep'
> = {
  x: 'production.objects.moveStep',
  y: 'production.objects.moveStep',
  z: 'production.objects.moveStep',
  turn: 'production.objects.turnStep',
  size: 'production.objects.sizeStep',
};

export function ObjectsPanel({
  studio,
  scene,
  modelName,
  onReveal,
  chosen,
  onChoose,
  onAnnounce = () => {},
}: {
  studio: Studio;
  /** Says a pick-up and a put-down to a screen reader. */
  onAnnounce?: (words: string) => void;
  /** The object chosen, here or on the stage, by its name. */
  chosen: string | null;
  onChoose: (name: string | null) => void;
  /** Opens the Code editor at a block: Remove says where the code uses an object. */
  onReveal?: (node: NodeId) => void;
  scene: SceneId;
  /** A model's name in Backstage, for the list: "Emperor penguin". */
  modelName: (object: Production['scenes'][number]['setup']['objects'][number]) => string | null;
}) {
  const p = studio.production;
  const objects = p.scenes.find((s) => s.id === scene)?.setup.objects ?? [];
  const object = objects.find((o) => o.id === chosen) ?? null;
  const readOnly = studio.readOnly !== null;
  // What the last Remove said: refused while code uses the object, with where.
  const [refusal, setRefusal] = useState<{ name: string; refusal: SceneRefusal } | null>(null);
  // The object picked up from the keyboard, and which pick-up this is, for its one undo step.
  const [lifted, setLifted] = useState<string | null>(null);
  const lifts = useRef(0);
  const camera = p.scenes.find((s) => s.id === scene)?.setup.camera.transform ?? null;

  const putDown = () => {
    if (lifted === null) return;
    const o = objects.find((k) => k.id === lifted);
    setLifted(null);
    studio.seal();
    if (o)
      onAnnounce(
        words.t('production.objects.putDown', {
          name: o.id,
          x: fieldOf(o.transform, 'x'),
          y: fieldOf(o.transform, 'y'),
          z: fieldOf(o.transform, 'z'),
          turn: fieldOf(o.transform, 'turn'),
          size: fieldOf(o.transform, 'size'),
        }),
      );
  };

  // Before the list's own keys: while an object is up, its keys move it, not the focus.
  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = (e.target as HTMLElement).closest('[data-key]')?.getAttribute('data-key');
    const o = objects.find((k) => k.id === key);
    if (!o) return;
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (lifted !== o.id) {
      if ((e.key === 'Enter' || e.key === ' ') && !readOnly && camera) {
        stop();
        onChoose(o.id);
        setLifted(o.id);
        lifts.current += 1;
        onAnnounce(words.t('production.objects.pickedUp', { name: o.id }));
      }
      return;
    }
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      stop();
      return putDown();
    }
    const nudge = camera && nudgeObject(o.transform, e.key, e.shiftKey, camera);
    if (!nudge) {
      // Nothing else happens to the list while an object is up.
      if (e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End' || e.key.length === 1)
        stop();
      return;
    }
    stop();
    studio.commit(
      words.t(STEP_WORD[nudge.kind === 'move' ? 'x' : nudge.kind], { name: o.id }),
      withObjectTransform(studio.production, scene, o.id, nudge.transform),
      `lift:${scene}:${o.id}:${lifts.current}`,
    );
  };

  const remove = (name: string) => {
    const result = removeObject(p, scene, name, words.t('production.objects.removeStep', { name }));
    if (!result.ok) return setRefusal({ name, refusal: result.refusal });
    const done = studio.step(result.step);
    if (!done.ok) return setRefusal({ name, refusal: { code: 'refused', reason: done.reason } });
    setRefusal(null);
    onChoose(null);
  };

  return (
    <section className="pr-objects" aria-labelledby="pr-objects-title">
      <h2 id="pr-objects-title" className="pr-objects-title">
        {words.t('production.objects.title')}
      </h2>
      {objects.length === 0 ? (
        <p className="pr-objects-note">{words.t('production.objects.none')}</p>
      ) : (
        <div
          className="pr-objects-keys"
          onKeyDownCapture={onKeyDownCapture}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) putDown();
          }}
        >
          <ListBox
            className="pr-objects-list"
            aria-labelledby="pr-objects-title"
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={chosen === null ? [] : [chosen]}
            onSelectionChange={(keys) => {
              if (keys === 'all') return;
              const [key] = keys as Set<Key>;
              onChoose(key === undefined ? null : String(key));
            }}
            items={objects.map((o) => ({ id: o.id, o }))}
          >
            {({ id, o }) => {
              const model = modelName(o);
              return (
                <ListBoxItem
                  id={id}
                  className="pr-object"
                  textValue={id}
                  data-lifted={lifted === id || undefined}
                >
                  <span className="pr-object-name">{id}</span>
                  {model && <span className="pr-object-model">{model}</span>}
                </ListBoxItem>
              );
            }}
          </ListBox>
        </div>
      )}
      {object && (
        <div
          className="pr-object-fields"
          role="group"
          aria-label={words.t('production.objects.fieldsOf', { name: object.id })}
        >
          {FIELDS.map((field) => (
            <NumberField
              key={`${object.id}-${field}`}
              className="pr-number"
              value={fieldOf(object.transform, field)}
              minValue={FIELD_LIMITS[field].min}
              maxValue={FIELD_LIMITS[field].max}
              step={FIELD_LIMITS[field].step}
              isDisabled={readOnly}
              formatOptions={{ maximumFractionDigits: 3 }}
              onChange={(value) => {
                if (!Number.isFinite(value)) return;
                const transform = withField(object.transform, field, value);
                const next = withObject(p, scene, object.id, { transform });
                if ('code' in next) return;
                studio.commit(
                  words.t(STEP_WORD[field], { name: object.id }),
                  next,
                  `object:${scene}:${object.id}:${field}`,
                );
              }}
              onBlur={() => studio.seal()}
            >
              <Label className="pr-number-label">{words.t(`production.objects.${field}`)}</Label>
              <Input className="ss-input pr-number-input" />
            </NumberField>
          ))}
          {!readOnly && (
            <Button
              variant="quiet"
              icon="delete"
              aria-label={words.t('production.objects.removeNamed', { name: object.id })}
              onPress={() => remove(object.id)}
            >
              {words.t('production.objects.remove')}
            </Button>
          )}
        </div>
      )}
      {refusal && (
        <NeutralNote>
          <span role="status">{refusalWords(refusal.refusal, refusal.name)}</span>
          {refusal.refusal.code === 'objectInUse' && refusal.refusal.uses[0] && onReveal && (
            <>
              {' '}
              <Button
                variant="secondary"
                icon="extension"
                onPress={() => {
                  if (refusal.refusal.code === 'objectInUse' && refusal.refusal.uses[0])
                    onReveal(refusal.refusal.uses[0]);
                }}
              >
                {words.t('production.check.block')}
              </Button>
            </>
          )}
        </NeutralNote>
      )}
    </section>
  );
}
