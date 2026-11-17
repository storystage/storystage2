/**
 * Settings › Class set-up › Study (spec 14 section 6.8; screen 11's "Study logs"): the study class
 * code and age band, the sessions kept on this device with Delete for each, and Export study logs,
 * which then asks to delete them from the device. For the teacher, behind Class set-up's check.
 */
import { FileError, type FilePicker, type PolicyInForce } from '@storystage/host';
import {
  AGE_BANDS,
  exportLogs,
  isClassCode,
  showCode,
  type AgeBand,
  type SessionSummary,
  type StudyStore,
} from '@storystage/study';
import { Button, Dialog, Icon, Segmented, TextField } from '@storystage/ui';
import { useEffect, useState } from 'react';
import { words } from '../strings.ts';

/** Study mode is on only by a policy from a trusted source (spec 14 section 6.1). */
export const studyOn = (policy: PolicyInForce): boolean => policy.trusted && policy.study.enabled;

/** As the Study card shows an age band: "9–11". */
const bandWords = (band: AgeBand) => band.replace('-', '–');

export interface StudyCardProps {
  store: StudyStore;
  picker: Pick<FilePicker, 'saveCopy'>;
  sessions: readonly SessionSummary[];
  /** Says something in Class set-up's status line. */
  onSaid: (text: string) => void;
  /** Runs a change, then reads the page again; says so if it fails. */
  act: (work: () => Promise<unknown>) => Promise<boolean>;
}

export function StudyCard({ store, picker, sessions, onSaid, act }: StudyCardProps) {
  const [classCode, setClassCode] = useState('');
  const [ageBand, setAgeBand] = useState<AgeBand | null>(null);
  const [saved, setSaved] = useState<{ classCode: string; ageBand: AgeBand | null }>({
    classCode: '',
    ageBand: null,
  });
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exported, setExported] = useState<readonly string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let gone = false;
    void store.settings().then((s) => {
      if (gone) return;
      setClassCode(s.classCode ?? '');
      setAgeBand(s.ageBand);
      setSaved({ classCode: s.classCode ?? '', ageBand: s.ageBand });
    });
    return () => {
      gone = true;
    };
  }, [store]);

  const code = classCode.trim();
  const codeOk = code === '' || isClassCode(code);
  const changed = code !== saved.classCode || ageBand !== saved.ageBand;
  const save = async () => {
    const next = { classCode: code === '' ? null : code, ageBand };
    if (await act(() => store.setSettings(next))) {
      setSaved({ classCode: code, ageBand });
      onSaid(words.t('settings.study.saved'));
    }
  };

  const exportAll = async () => {
    setBusy(true);
    try {
      const file = await exportLogs(store);
      await picker.saveCopy(file.name, file.bytes);
      onSaid(words.plural('settings.study.exported', file.codes.length, { name: file.name }));
      if (file.codes.length > 0) setExported(file.codes);
    } catch (e) {
      if (!(e instanceof FileError && e.code === 'cancelled'))
        onSaid(words.t('settings.study.exportFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="st-card st-study" aria-labelledby="st-study-title">
      <h3 id="st-study-title" className="st-card-title">
        {words.t('settings.study')}
      </h3>
      <p className="st-note">{words.t('settings.study.help')}</p>
      <form
        className="st-study-settings"
        onSubmit={(e) => {
          e.preventDefault();
          if (codeOk && changed) void save();
        }}
      >
        <TextField
          label={words.t('settings.study.classCode')}
          description={
            codeOk
              ? words.t('settings.study.classCodeHelp')
              : words.t('settings.study.classCodeBad')
          }
          isInvalid={!codeOk}
          value={classCode}
          onChange={setClassCode}
          maxLength={12}
        />
        <div className="st-study-band">
          <span className="st-study-label" aria-hidden="true">
            {words.t('settings.study.ageBand')}
          </span>
          <Segmented
            label={words.t('settings.study.ageBand')}
            options={AGE_BANDS.map((b) => ({ id: b, label: bandWords(b) }))}
            value={ageBand ?? ('' as AgeBand)}
            onChange={setAgeBand}
          />
        </div>
        <div className="st-actions">
          <Button
            variant="secondary"
            icon="check_circle"
            type="submit"
            isDisabled={!codeOk || !changed}
          >
            {words.t('settings.study.save')}
          </Button>
        </div>
      </form>

      <h4 className="st-subtitle">{words.t('settings.study.sessions')}</h4>
      {sessions.length === 0 ? (
        <p className="st-note">{words.t('settings.study.noSessions')}</p>
      ) : (
        <ul className="st-films">
          {sessions.map((s) => (
            <li key={s.code} className="st-film">
              <Icon name="description" />
              <span className="st-row-name">
                {words.t('settings.study.session', { code: showCode(s.code) })}
              </span>
              <span className="st-row-count">
                {s.date} · {words.plural('settings.study.tasks', s.tasks)}
              </span>
              <Button
                variant="quiet"
                icon="delete"
                aria-label={words.t('settings.study.deleteNamed', { code: showCode(s.code) })}
                onPress={() => setDeleting(s.code)}
              >
                {words.t('settings.study.delete')}
              </Button>
            </li>
          ))}
        </ul>
      )}
      <p className="st-note">{words.t('settings.study.exportHelp')}</p>
      <div className="st-actions">
        <Button
          variant="secondary"
          icon="download"
          isDisabled={busy || sessions.length === 0}
          onPress={() => void exportAll()}
        >
          {words.t('settings.study.export')}
        </Button>
      </div>

      <Dialog
        isOpen={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={words.t('settings.study.deleteTitle', { code: showCode(deleting ?? '') })}
        icon="delete"
      >
        <p className="st-dialog-text">{words.t('settings.study.deleteText')}</p>
        <div className="st-actions">
          <Button
            variant="stop"
            icon="delete"
            onPress={() => {
              const code = deleting!;
              setDeleting(null);
              void act(() => store.deleteSessions([code])).then(
                (done) =>
                  done && onSaid(words.t('settings.study.deleted', { code: showCode(code) })),
              );
            }}
          >
            {words.t('settings.study.delete')}
          </Button>
          <Button variant="secondary" onPress={() => setDeleting(null)}>
            {words.t('settings.cancel')}
          </Button>
        </div>
      </Dialog>

      <Dialog
        isOpen={exported !== null}
        onOpenChange={(open) => !open && setExported(null)}
        title={words.t('settings.study.deleteAfterTitle')}
        icon="delete"
      >
        <p className="st-dialog-text">{words.t('settings.study.deleteAfterText')}</p>
        <div className="st-actions">
          <Button
            variant="primary"
            icon="delete"
            onPress={() => {
              const codes = exported!;
              setExported(null);
              void act(() => store.deleteSessions(codes)).then(
                (done) => done && onSaid(words.plural('settings.study.deletedAfter', codes.length)),
              );
            }}
          >
            {words.t('settings.study.deleteAfter')}
          </Button>
          <Button variant="secondary" onPress={() => setExported(null)}>
            {words.t('settings.study.keep')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
