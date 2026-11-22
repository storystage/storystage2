/**
 * Objects in this scene (`07-ux.md` section 7.2): the scene's set-up as a list beside the view,
 * its keyboard path, as the sketches are on a frame: its objects, then its markers. Choosing one
 * shows its fields: x, y and z in metres, its turn in turns (Alice's unit) and, for an object, its
 * size. Typing in a field moves it on the stage, as one undo step for each run of typing ("Move
 * penguin"). The choice is the scene view's too: clicking an object or a marker on the stage
 * chooses it here, and choosing it here gives it the stage's outline and handles. From the
 * keyboard, Enter (or Space) picks the focused one up: the arrow keys, Page Up and Page Down,
 * [ and ], and + and − move, raise, turn and resize it, and Enter, Space or Esc puts it down,
 * saying where it is. One pick-up is one undo step, as one drag is.
 */
import type { SceneId } from '@storystage/production';
import type { SceneObjectSetup, Transform } from '@storystage/story-api';
import { useRef, useState, type KeyboardEvent } from 'react';
import { Input, Label, ListBox, ListBoxItem, NumberField, type Key } from 'react-aria-components';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import type { NodeId } from '@storystage/ast';
import { removeObject, type SceneRefusal } from '@storystage/production';
import { Button, NeutralNote } from '@storystage/ui';
import {
  FIELD_LIMITS,
  fieldOf,
  nudgeObject,
  removeMarker,
  withField,
  withMarker,
  withObjectTransform,
  type SetupField,
} from './setup.ts';
import { refusalWords } from './refusals.ts';
import { PosePanel } from './PosePanel.tsx';
import type { PoseJoint } from './pose.ts';

const OBJECT_FIELDS: readonly SetupField[] = ['x', 'y', 'z', 'turn', 'size'];
/** A marker has a place and a turn, and no size. */
const MARKER_FIELDS: readonly SetupField[] = ['x', 'y', 'z', 'turn'];

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

/** A marker's key in the list and in `chosen`: object names can't hold a colon. */
export const MARKER_KEY = 'marker:';

/** One row of the list: an object or a marker. */
interface Entry {
  readonly key: string;
  readonly name: string;
  readonly transform: Transform;
  /** The object, or null for a marker. */
  readonly object: SceneObjectSetup | null;
}

export function ObjectsPanel({
  studio,
  scene,
  modelName,
  onReveal,
  chosen,
  onChoose,
  onAnnounce = () => {},
  poseJoints = () => [],
}: {
  studio: Studio;
  /** The joints an object can be posed by, from its model's joints and its class's joint map. */
  poseJoints?: (object: SceneObjectSetup) => readonly PoseJoint[];
  /** Says a pick-up and a put-down to a screen reader. */
  onAnnounce?: (words: string) => void;
  /** What's chosen, here or on the stage: an object's name, or `marker:` and a marker's id. */
  chosen: string | null;
  onChoose: (key: string | null) => void;
  /** Opens the Code editor at a block: Remove says where the code uses an object. */
  onReveal?: (node: NodeId) => void;
  scene: SceneId;
  /** A model's name in Backstage, for the list: "Emperor penguin". */
  modelName: (object: SceneObjectSetup) => string | null;
}) {
  const p = studio.production;
  const setup = p.scenes.find((s) => s.id === scene)?.setup;
  const entries: Entry[] = [
    ...(setup?.objects ?? []).map((o) => ({
      key: o.id as string,
      name: o.id as string,
      transform: o.transform,
      object: o,
    })),
    ...(setup?.markers ?? []).map((m) => ({
      key: `${MARKER_KEY}${m.id}`,
      name: m.id,
      transform: m.transform,
      object: null,
    })),
  ];
  const entry = entries.find((e) => e.key === chosen) ?? null;
  const readOnly = studio.readOnly !== null;
  // What the last Remove said: refused while code uses the object, with where.
  const [refusal, setRefusal] = useState<{ name: string; refusal: SceneRefusal } | null>(null);
  // The entry picked up from the keyboard, and which pick-up this is, for its one undo step.
  const [lifted, setLifted] = useState<string | null>(null);
  const lifts = useRef(0);
  const camera = setup?.camera.transform ?? null;

  /** The production with an entry given a new transform. */
  const placed = (e: Entry, transform: Transform) =>
    e.object
      ? withObjectTransform(studio.production, scene, e.name, transform)
      : withMarker(studio.production, scene, e.name, transform);

  const putDown = () => {
    if (lifted === null) return;
    const e = entries.find((k) => k.key === lifted);
    setLifted(null);
    studio.seal();
    if (!e) return;
    const where = {
      name: e.name,
      x: fieldOf(e.transform, 'x'),
      y: fieldOf(e.transform, 'y'),
      z: fieldOf(e.transform, 'z'),
      turn: fieldOf(e.transform, 'turn'),
    };
    onAnnounce(
      e.object
        ? words.t('production.objects.putDown', { ...where, size: fieldOf(e.transform, 'size') })
        : words.t('production.objects.putDownMarker', where),
    );
  };

  // Before the list's own keys: while something is up, its keys move it, not the focus.
  const onKeyDownCapture = (k: KeyboardEvent<HTMLDivElement>) => {
    if (k.altKey || k.ctrlKey || k.metaKey) return;
    const key = (k.target as HTMLElement).closest('[data-key]')?.getAttribute('data-key');
    const e = entries.find((x) => x.key === key);
    if (!e) return;
    const stop = () => {
      k.preventDefault();
      k.stopPropagation();
    };
    if (lifted !== e.key) {
      if ((k.key === 'Enter' || k.key === ' ') && !readOnly && camera) {
        stop();
        onChoose(e.key);
        setLifted(e.key);
        lifts.current += 1;
        onAnnounce(words.t('production.objects.pickedUp', { name: e.name }));
      }
      return;
    }
    if (k.key === 'Enter' || k.key === ' ' || k.key === 'Escape') {
      stop();
      return putDown();
    }
    const nudge = camera && nudgeObject(e.transform, k.key, k.shiftKey, camera);
    // A marker has no size to change.
    if (!nudge || (nudge.kind === 'size' && !e.object)) {
      // Nothing else happens to the list while something is up.
      if (k.key.startsWith('Arrow') || k.key === 'Home' || k.key === 'End' || k.key.length === 1)
        stop();
      return;
    }
    stop();
    studio.commit(
      words.t(STEP_WORD[nudge.kind === 'move' ? 'x' : nudge.kind], { name: e.name }),
      placed(e, nudge.transform),
      `lift:${scene}:${e.key}:${lifts.current}`,
    );
  };

  const remove = (e: Entry) => {
    const name = e.name;
    const label = words.t('production.objects.removeStep', { name });
    if (!e.object) {
      studio.commit(label, removeMarker(studio.production, scene, name));
      setRefusal(null);
      onChoose(null);
      return;
    }
    const result = removeObject(p, scene, name, label);
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
      {entries.length === 0 ? (
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
            items={entries.map((e) => ({ id: e.key, e }))}
          >
            {({ id, e }) => {
              const model = e.object ? modelName(e.object) : words.t('production.objects.marker');
              return (
                <ListBoxItem
                  id={id}
                  className="pr-object"
                  textValue={e.name}
                  data-lifted={lifted === id || undefined}
                >
                  <span className="pr-object-name">{e.name}</span>
                  {model && <span className="pr-object-model">{model}</span>}
                </ListBoxItem>
              );
            }}
          </ListBox>
        </div>
      )}
      {entry && (
        <div
          className="pr-object-fields"
          role="group"
          aria-label={words.t('production.objects.fieldsOf', { name: entry.name })}
        >
          {(entry.object ? OBJECT_FIELDS : MARKER_FIELDS).map((field) => (
            <NumberField
              key={`${entry.key}-${field}`}
              className="pr-number"
              value={fieldOf(entry.transform, field)}
              minValue={FIELD_LIMITS[field].min}
              maxValue={FIELD_LIMITS[field].max}
              step={FIELD_LIMITS[field].step}
              isDisabled={readOnly}
              formatOptions={{ maximumFractionDigits: 3 }}
              onChange={(value) => {
                if (!Number.isFinite(value)) return;
                studio.commit(
                  words.t(STEP_WORD[field], { name: entry.name }),
                  placed(entry, withField(entry.transform, field, value)),
                  `object:${scene}:${entry.key}:${field}`,
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
              aria-label={words.t('production.objects.removeNamed', { name: entry.name })}
              onPress={() => remove(entry)}
            >
              {words.t('production.objects.remove')}
            </Button>
          )}
        </div>
      )}
      {entry?.object && poseJoints(entry.object).length > 0 && (
        <PosePanel
          key={entry.key}
          studio={studio}
          scene={scene}
          object={entry.object}
          joints={poseJoints(entry.object)}
        />
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
