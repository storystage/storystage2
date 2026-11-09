/**
 * Import a model into the class Backstage (`07-ux.md` section 9.6, Direction A screen 07; spec 17,
 * sections 5 and 6). Details first: the files, the name, what it is, the licence and where it came
 * from. **Check model** runs S4's import in a fresh worker, stopped after 60 seconds; then the
 * report: what Backstage did, the thumbnail and front sketch, the credit line and any licence
 * warning, with **Add to class models**. Changing a detail goes back a step.
 */
import { DESCRIPTION_MAX } from '@storystage/backstage';
import {
  LICENCE_CHOICES,
  LICENCE_PROBLEMS,
  MAKER_MAX,
  SOURCE_MAX,
  importInWorker,
  type ImportResult,
  type ImportWorker,
  type ImportedFile,
  type LicenceChoice,
} from '@storystage/backstage-import/worker-client';
import { FILE_LIMIT, type ClassFolders } from '@storystage/host';
import {
  Button,
  Dialog,
  Icon,
  NeutralNote,
  RadioCards,
  Segmented,
  TextField,
} from '@storystage/ui';
import { useEffect, useMemo, useState } from 'react';
import { FileTrigger } from 'react-aria-components';
import { words, type WordKey } from '../strings.ts';
import { MODEL_KINDS } from './modelKinds.ts';

/** The longest name for an imported model. */
export const MODEL_NAME_LIMIT = 40;

/** The files a model may come in (spec 17, section 5, "What can be imported"). */
const ACCEPTED = [
  '.glb',
  '.vrm',
  '.gltf',
  '.bin',
  '.obj',
  '.mtl',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
];

type Added = Extract<ImportResult, { ok: true }>;

type Step =
  | { readonly kind: 'details'; readonly problems: readonly string[] }
  | { readonly kind: 'checking' }
  | { readonly kind: 'report'; readonly result: Added };

interface Picked {
  readonly name: string;
  readonly bytes: Uint8Array;
}

const kindWord = (id: string) => words.t(`models.kind.${id}` as WordKey);
const licenceWord = (choice: LicenceChoice) => words.t(`models.licence.${choice}` as WordKey);
const licenceAbout = (choice: LicenceChoice) =>
  words.t(`models.licence.${choice}.about` as WordKey);

/** A picture of one of the import's files, as an address for an <img>, freed when it goes. */
function useFileUrl(file: ImportedFile | undefined, type: string): string | null {
  const url = useMemo(
    () => (file ? URL.createObjectURL(new Blob([file.bytes.slice()], { type })) : null),
    [file, type],
  );
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  return url;
}

export function ImportModel({
  classes,
  taken,
  startWorker,
  onAdded,
  onClose,
}: {
  classes: ClassFolders;
  /** The ids the class Backstage has had, live and in the bin: an id is never reused. */
  taken: readonly string[];
  /** A fresh import worker. */
  startWorker: () => ImportWorker;
  onAdded: (name: string) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'details', problems: [] });
  const [files, setFiles] = useState<readonly Picked[]>([]);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  const [description, setDescription] = useState('');
  const [licence, setLicence] = useState<LicenceChoice | ''>('');
  const [version, setVersion] = useState<'4.0' | '3.0'>('4.0');
  const [source, setSource] = useState('');
  const [maker, setMaker] = useState('');
  const [adding, setAdding] = useState(false);

  const pick = async (list: FileList | null) => {
    if (!list) return;
    const chosen = [...list];
    const big = chosen.find((f) => f.size > FILE_LIMIT);
    if (big) {
      setStep({ kind: 'details', problems: [words.t('models.tooBig', { name: big.name })] });
      return;
    }
    const read = await Promise.all(
      chosen.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })),
    );
    setFiles(read);
    if (name.trim() === '' && read[0]) setName(nameFrom(read[0].name));
    setStep({ kind: 'details', problems: [] });
  };

  const missing: string[] = [];
  if (files.length === 0) missing.push(words.t('models.needFiles'));
  if (name.trim() === '') missing.push(words.t('models.needName'));
  if (kind === '') missing.push(words.t('models.needKind'));
  if (licence === '') missing.push(words.t('models.needLicence'));

  const check = async () => {
    if (missing.length > 0) return setStep({ kind: 'details', problems: missing });
    const chosen = MODEL_KINDS.find((k) => k.id === kind)!;
    setStep({ kind: 'checking' });
    const result = await importInWorker(startWorker, {
      files: files.map((f) => [f.name, f.bytes] as const),
      choices: {
        section: chosen.section,
        class: chosen.class,
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        licence: {
          choice: licence as LicenceChoice,
          ...(licence === 'CC BY' ? { version } : {}),
          ...(source.trim() ? { sourceUrl: source.trim() } : {}),
          ...(maker.trim() ? { maker: maker.trim() } : {}),
        },
      },
      taken,
    });
    if (result.ok) return setStep({ kind: 'report', result });
    setStep({
      kind: 'details',
      problems:
        'licence' in result
          ? result.licence.map((p) => LICENCE_PROBLEMS[p])
          : result.problems.map((p) => p.message),
    });
  };

  const add = async (result: Added) => {
    setAdding(true);
    try {
      await classes.backstage().add('class', result.item.id, result.item, result.files);
      onAdded(result.item.displayName);
      onClose();
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      setStep({
        kind: 'details',
        problems: [code === 'full' ? words.t('models.full') : words.t('models.notAdded')],
      });
    } finally {
      setAdding(false);
    }
  };

  const needsMaker = licence === 'CC BY' || licence === 'CC BY-SA' || licence === 'CC BY-NC';

  return (
    <Dialog
      isOpen
      onOpenChange={(open) => !open && onClose()}
      title={words.t('models.importTitle')}
      icon="upload_file"
      width={760}
    >
      {step.kind === 'details' && (
        <div className="im-details">
          {step.problems.length > 0 && (
            <div role="alert" className="im-problems">
              {step.problems.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
          )}
          <div className="im-files">
            <FileTrigger
              allowsMultiple
              acceptedFileTypes={ACCEPTED}
              onSelect={(list) => void pick(list)}
            >
              <Button variant="secondary" icon="upload_file">
                {files.length === 0 ? words.t('models.chooseFiles') : words.t('models.chooseOther')}
              </Button>
            </FileTrigger>
            <p className="st-note">
              {files.length === 0
                ? words.t('models.filesHelp')
                : files.map((f) => f.name).join(', ')}
            </p>
          </div>
          <TextField
            label={words.t('models.name')}
            value={name}
            onChange={setName}
            maxLength={MODEL_NAME_LIMIT}
          />
          <RadioCards
            label={words.t('models.whatIsIt')}
            options={MODEL_KINDS.map((k) => ({
              value: k.id,
              label: kindWord(k.id),
              description: words.t(`models.kind.${k.id}.about` as WordKey),
            }))}
            value={kind}
            onChange={setKind}
          />
          <TextField
            label={words.t('models.description')}
            description={words.t('models.descriptionHelp')}
            value={description}
            onChange={setDescription}
            maxLength={DESCRIPTION_MAX}
          />
          <RadioCards
            label={words.t('models.licence')}
            options={LICENCE_CHOICES.map((c) => ({
              value: c,
              label: licenceWord(c),
              description: licenceAbout(c),
            }))}
            value={licence}
            onChange={(v) => setLicence(v as LicenceChoice)}
          />
          {licence === 'CC BY' && (
            <Segmented
              label={words.t('models.version')}
              options={[
                { id: '4.0', label: 'CC BY 4.0' },
                { id: '3.0', label: 'CC BY 3.0' },
              ]}
              value={version}
              onChange={setVersion}
            />
          )}
          <TextField
            label={words.t('models.source')}
            description={
              licence === 'own-work'
                ? words.t('models.sourceOptional')
                : words.t('models.sourceHelp')
            }
            value={source}
            onChange={setSource}
            maxLength={SOURCE_MAX}
            type="url"
          />
          {(needsMaker || licence === 'CC0') && (
            <TextField
              label={words.t('models.maker')}
              description={
                needsMaker ? words.t('models.makerHelp') : words.t('models.makerOptional')
              }
              value={maker}
              onChange={setMaker}
              maxLength={MAKER_MAX}
            />
          )}
          <div className="st-actions">
            <Button variant="primary" icon="check_circle" onPress={() => void check()}>
              {words.t('models.check')}
            </Button>
            <Button variant="secondary" onPress={onClose}>
              {words.t('settings.cancel')}
            </Button>
          </div>
        </div>
      )}
      {step.kind === 'checking' && (
        <div className="im-checking" role="status">
          <Icon name="hourglass_empty" />
          <p>{words.t('models.checking')}</p>
        </div>
      )}
      {step.kind === 'report' && (
        <Report
          result={step.result}
          adding={adding}
          onAdd={() => void add(step.result)}
          onBack={() => setStep({ kind: 'details', problems: [] })}
          onCancel={onClose}
        />
      )}
    </Dialog>
  );
}

/** A name from a file's name: "red-dragon_v2.glb" gives "Red dragon v2". */
export function nameFrom(fileName: string): string {
  const stem = fileName
    .replace(/\.[^.]*$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const shown = stem.charAt(0).toLocaleUpperCase('en-GB') + stem.slice(1);
  return [...shown].slice(0, MODEL_NAME_LIMIT).join('');
}

function Report({
  result,
  adding,
  onAdd,
  onBack,
  onCancel,
}: {
  result: Added;
  adding: boolean;
  onAdd: () => void;
  onBack: () => void;
  onCancel: () => void;
}) {
  const { item, files, report } = result;
  const thumbnail = files.find((f) => f.path === item.files.thumbnail);
  const front = item.sketches.find((s) => s.facing === 'front' && !s.pose);
  const sketch = files.find((f) => f.path === front?.file);
  const thumbnailUrl = useFileUrl(
    thumbnail,
    item.files.thumbnail.endsWith('.png') ? 'image/png' : 'image/webp',
  );
  const sketchUrl = useFileUrl(sketch, 'image/svg+xml');
  return (
    <div className="im-report">
      <div className="im-pictures">
        {thumbnailUrl && (
          <img src={thumbnailUrl} alt={words.t('models.thumbnailOf', { name: item.displayName })} />
        )}
        {sketchUrl && (
          <img
            className="im-sketch"
            src={sketchUrl}
            alt={words.t('models.sketchOf', { name: item.displayName })}
          />
        )}
      </div>
      <div className="im-did">
        <h3 className="st-subtitle">{words.t('models.whatDone')}</h3>
        <ul className="im-lines">
          {report.lines.map((line) => (
            <li key={line}>
              <Icon name="check_circle" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <h3 className="st-subtitle">{words.t('models.credit')}</h3>
        <p className="im-credit">{item.credit}</p>
        <p className="st-note">{words.t('models.creditHelp')}</p>
        {report.staysInClass && <NeutralNote>{report.staysInClass}</NeutralNote>}
      </div>
      <div className="st-actions im-report-actions">
        <Button variant="primary" icon="add" isDisabled={adding} onPress={onAdd}>
          {words.t('models.add')}
        </Button>
        <Button variant="secondary" icon="edit" isDisabled={adding} onPress={onBack}>
          {words.t('models.changeDetails')}
        </Button>
        <Button variant="quiet" isDisabled={adding} onPress={onCancel}>
          {words.t('settings.cancel')}
        </Button>
      </div>
    </div>
  );
}
