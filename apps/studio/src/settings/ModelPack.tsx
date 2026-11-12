/**
 * Save models and Open models (spec 17, section 5, "The model pack"; decision 0066; `07-ux.md`
 * section 9.6): the class's own models to one file, and back on another device. Saving runs on
 * the page (S4's light `modelPackFromClass`); opening checks every model as an import in a fresh
 * worker (`openModelPackInWorker`), each with its own 60 seconds, then adds those that pass.
 */
import { MODEL_PACK_EXTENSION, modelPackFromClass } from '@storystage/backstage-import/pack';
import {
  openModelPackInWorker,
  type ImportWorker,
} from '@storystage/backstage-import/worker-client';
import { FILE_LIMIT, type ClassFolders, type FilePicker } from '@storystage/host';
import { Button } from '@storystage/ui';
import { useRef, useState } from 'react';
import { words } from '../strings.ts';

type Said =
  | { readonly kind: 'busy'; readonly text: string }
  | {
      readonly kind: 'done';
      readonly text: string;
      readonly leftOut: readonly { readonly name: string; readonly reason: string }[];
    };

/** A model's name from its id, as missing models are named: `class/Prop/big-crate` is "big crate". */
export const modelName = (id: string) => (id.split('/').pop() ?? id).replace(/-/g, ' ');

/** The pack's name: the class's models, on any device. */
export const MODEL_PACK_NAME = `Class models${MODEL_PACK_EXTENSION}`;

export function ModelPack({
  classes,
  picker,
  taken,
  hasClassModels,
  startWorker,
  onChanged,
  canOpen = true,
}: {
  classes: ClassFolders;
  picker: FilePicker;
  /** The ids the class Backstage has had, live and in the bin: a pack's model never reuses one. */
  taken: readonly string[];
  /** Whether the class has models of its own to save (pupils' own imports stay out). */
  hasClassModels: boolean;
  startWorker: () => ImportWorker;
  onChanged: () => void;
  /** Opening a pack imports its models: not offered when the school's policy has importing off. */
  canOpen?: boolean;
}) {
  const [said, setSaid] = useState<Said | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const busy = said?.kind === 'busy';
  const done = (text: string, leftOut: Extract<Said, { kind: 'done' }>['leftOut'] = []) =>
    setSaid({ kind: 'done', text, leftOut });

  const save = async () => {
    setSaid({ kind: 'busy', text: words.t('pack.saving') });
    try {
      const { pack, leftOut } = await modelPackFromClass(classes.backstage());
      await picker.saveCopy(MODEL_PACK_NAME, pack);
      done(
        words.t('pack.saved'),
        leftOut.map((id) => ({ name: modelName(id), reason: words.t('pack.unreadable') })),
      );
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 'cancelled') return setSaid(null);
      done(code === 'full' ? words.t('pack.full') : words.t('pack.notSaved'));
    }
  };

  const open = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > FILE_LIMIT) return done(words.t('pack.tooBig'));
    setSaid({ kind: 'busy', text: words.t('pack.opening') });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await openModelPackInWorker(startWorker, bytes, taken, {
      onProgress: (n, total) =>
        setSaid({ kind: 'busy', text: words.t('pack.checking', { n, total }) }),
    });
    if (!result.ok) return done(result.problem.message);
    let added = 0;
    const leftOut = [...result.leftOut];
    for (const { item, files } of result.models) {
      try {
        await classes.backstage().add('class', item.id, item, files);
        added++;
      } catch (error) {
        const code = (error as { code?: unknown } | null)?.code;
        leftOut.push({
          name: item.displayName,
          reason: code === 'full' ? words.t('models.full') : words.t('models.notAdded'),
        });
      }
    }
    onChanged();
    done(words.plural('pack.added', added), leftOut);
  };

  return (
    <div className="mp">
      <div className="st-actions">
        <Button
          variant="secondary"
          icon="download"
          isDisabled={busy || !hasClassModels}
          onPress={() => void save()}
        >
          {words.t('pack.save')}
        </Button>
        {canOpen && (
          <Button
            variant="secondary"
            icon="upload"
            isDisabled={busy}
            onPress={() => input.current?.click()}
          >
            {words.t('pack.open')}
          </Button>
        )}
        <input
          ref={input}
          type="file"
          accept={MODEL_PACK_EXTENSION}
          hidden
          aria-label={words.t('pack.file')}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = '';
            void open(file).catch(() => done(words.t('pack.notOpened')));
          }}
        />
      </div>
      <p role="status" className="st-status">
        {said?.text}
      </p>
      {said?.kind === 'done' && said.leftOut.length > 0 && (
        <>
          <h4 className="st-subtitle">{words.t('pack.leftOut')}</h4>
          <ul className="st-skipped">
            {said.leftOut.map((l, i) => (
              <li key={`${i}-${l.name}`}>
                <span className="st-row-name">{l.name}</span>
                <span className="st-note">{l.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
