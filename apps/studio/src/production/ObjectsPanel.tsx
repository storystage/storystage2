/**
 * Objects in this scene (`07-ux.md` section 7.2): the scene's set-up as a list beside the view,
 * its keyboard path, as the sketches are on a frame. Choosing an object shows its fields: x, y and
 * z in metres, its turn in turns (Alice's unit) and its size. Typing in a field moves it on the
 * stage, as one undo step for each run of typing ("Move penguin"). Choosing on the stage itself,
 * and handles, wait on the stage's editing contract (S3).
 */
import type { Production, SceneId } from '@storystage/production';
import { useState } from 'react';
import { Input, Label, ListBox, ListBoxItem, NumberField, type Key } from 'react-aria-components';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import { FIELD_LIMITS, fieldOf, withField, withObjectTransform, type SetupField } from './setup.ts';

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
}: {
  studio: Studio;
  scene: SceneId;
  /** A model's name in Backstage, for the list: "Emperor penguin". */
  modelName: (object: Production['scenes'][number]['setup']['objects'][number]) => string | null;
}) {
  const p = studio.production;
  const objects = p.scenes.find((s) => s.id === scene)?.setup.objects ?? [];
  const [chosen, setChosen] = useState<Key | null>(null);
  const object = objects.find((o) => o.id === chosen) ?? null;
  const readOnly = studio.readOnly !== null;

  return (
    <section className="pr-objects" aria-labelledby="pr-objects-title">
      <h2 id="pr-objects-title" className="pr-objects-title">
        {words.t('production.objects.title')}
      </h2>
      {objects.length === 0 ? (
        <p className="pr-objects-note">{words.t('production.objects.none')}</p>
      ) : (
        <ListBox
          className="pr-objects-list"
          aria-labelledby="pr-objects-title"
          selectionMode="single"
          selectedKeys={chosen === null ? [] : [chosen]}
          onSelectionChange={(keys) => {
            if (keys === 'all') return;
            const [key] = keys as Set<Key>;
            setChosen(key ?? null);
          }}
          items={objects.map((o) => ({ id: o.id, o }))}
        >
          {({ id, o }) => {
            const model = modelName(o);
            return (
              <ListBoxItem id={id} className="pr-object" textValue={id}>
                <span className="pr-object-name">{id}</span>
                {model && <span className="pr-object-model">{model}</span>}
              </ListBoxItem>
            );
          }}
        </ListBox>
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
                studio.commit(
                  words.t(STEP_WORD[field], { name: object.id }),
                  withObjectTransform(p, scene, object.id, transform),
                  `object:${scene}:${object.id}:${field}`,
                );
              }}
              onBlur={() => studio.seal()}
            >
              <Label className="pr-number-label">{words.t(`production.objects.${field}`)}</Label>
              <Input className="ss-input pr-number-input" />
            </NumberField>
          ))}
        </div>
      )}
    </section>
  );
}
