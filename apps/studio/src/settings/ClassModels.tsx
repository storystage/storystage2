/**
 * Settings › Class set-up › Class models (`07-ux.md` section 9.6; decision 0066): the models
 * imported into the class Backstage on this device, each with its thumbnail, kind and credit,
 * **Import a model…**, **Move to the bin**, and **Save models** and **Open models** (the pack). A pupil's own import says whose it is, with
 * **Make it the class's** (`promote`).
 */
import type { ClassFolders, FilePicker, StoredModel } from '@storystage/host';
import type { ImportWorker } from '@storystage/backstage-import/worker-client';
import { Button, Icon } from '@storystage/ui';
import { useEffect, useState } from 'react';
import { words, type WordKey } from '../strings.ts';
import { ImportModel } from './ImportModel.tsx';
import { ModelPack } from './ModelPack.tsx';
import { kindOf } from './modelKinds.ts';
import type { PupilFilms } from './Pupils.tsx';

/** What the card shows of a stored record, read defensively: the host keeps records as given. */
export interface ClassModel {
  readonly id: string;
  readonly owner: string;
  readonly name: string;
  readonly kind: string | null;
  readonly credit: string;
  readonly thumbnail: string | null;
  /** CC BY-NC or "not sure": films using it stay in school. */
  readonly staysInClass: boolean;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function classModel(stored: StoredModel): ClassModel {
  const r = (stored.record ?? {}) as Record<string, unknown>;
  const files = (r.files ?? {}) as Record<string, unknown>;
  const kind = kindOf(text(r.section), text(r.class));
  const licence = text(r.licence);
  return {
    id: stored.id,
    owner: stored.owner,
    name: text(r.displayName) || stored.id,
    kind: kind ? words.t(`models.kind.${kind.id}` as WordKey) : null,
    credit: text(r.credit),
    thumbnail: text(files.thumbnail) || null,
    staysInClass: licence === 'CC-BY-NC-4.0' || licence === 'not-sure',
  };
}

/** A stored thumbnail as an address for an <img>, freed when it goes. */
function Thumbnail({ classes, model }: { classes: ClassFolders; model: ClassModel }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!model.thumbnail) return;
    let made: string | null = null;
    let gone = false;
    classes
      .backstage()
      .read(model.id, model.thumbnail)
      .then(
        (bytes) => {
          if (gone) return;
          const type = model.thumbnail!.endsWith('.png') ? 'image/png' : 'image/webp';
          made = URL.createObjectURL(new Blob([bytes.slice()], { type }));
          setUrl(made);
        },
        () => {
          // No thumbnail: the model icon stands in.
        },
      );
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [classes, model.id, model.thumbnail]);
  return url ? (
    <img className="cm-thumb" src={url} alt="" />
  ) : (
    <span className="cm-thumb cm-thumb-empty" aria-hidden="true">
      <Icon name="view_in_ar" />
    </span>
  );
}

export function ClassModelsCard({
  classes,
  picker,
  models,
  taken,
  pupils,
  startWorker,
  act,
  onSaid,
}: {
  classes: ClassFolders;
  /** The system's picker, for Save models (07-ux 9.6). */
  picker: FilePicker;
  models: readonly ClassModel[];
  taken: readonly string[];
  pupils: readonly PupilFilms[];
  startWorker: () => ImportWorker;
  act: (work: () => Promise<unknown>) => Promise<boolean>;
  onSaid: (said: string) => void;
}) {
  const [importing, setImporting] = useState(false);
  const ownerName = (owner: string) => pupils.find((p) => p.pupil.id === owner)?.pupil.name;
  return (
    <section className="st-card" aria-labelledby="st-models-title">
      <div className="st-card-head">
        <h3 id="st-models-title" className="st-card-title">
          {words.t('models.title')}
        </h3>
        <Button variant="secondary" icon="upload_file" onPress={() => setImporting(true)}>
          {words.t('models.import')}
        </Button>
      </div>
      <p className="st-note">{words.t('models.help')}</p>
      {models.length === 0 ? (
        <p className="st-note">{words.t('models.none')}</p>
      ) : (
        <ul className="st-films">
          {models.map((m) => {
            const pupil = m.owner === 'class' ? null : ownerName(m.owner);
            return (
              <li key={m.id} className="st-film cm-model">
                <Thumbnail classes={classes} model={m} />
                <span className="st-binned-text">
                  <span className="st-row-name">{m.name}</span>
                  <span className="st-row-count">
                    {[
                      m.kind,
                      pupil ? words.t('models.ownedBy', { name: pupil }) : null,
                      m.staysInClass ? words.t('models.staysInClass') : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                  <span className="st-row-count cm-credit">{m.credit}</span>
                </span>
                {m.owner !== 'class' && (
                  <Button
                    variant="quiet"
                    icon="groups"
                    aria-label={words.t('models.promoteNamed', { name: m.name })}
                    onPress={() => void act(() => classes.backstage().promote(m.id))}
                  >
                    {words.t('models.promote')}
                  </Button>
                )}
                <Button
                  variant="quiet"
                  icon="delete"
                  aria-label={words.t('settings.toBinNamed', { name: m.name })}
                  onPress={() => void act(() => classes.backstage().remove(m.id))}
                >
                  {words.t('settings.toBin')}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <ModelPack
        classes={classes}
        picker={picker}
        taken={taken}
        hasClassModels={models.some((m) => m.owner === 'class')}
        startWorker={startWorker}
        onChanged={() => void act(async () => {})}
      />
      {importing && (
        <ImportModel
          classes={classes}
          taken={taken}
          startWorker={startWorker}
          onAdded={(name) => {
            onSaid(words.t('models.added', { name }));
            void act(async () => {});
          }}
          onClose={() => setImporting(false)}
        />
      )}
    </section>
  );
}
