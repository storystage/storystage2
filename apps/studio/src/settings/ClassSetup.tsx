/**
 * Settings › Class set-up (`07-ux.md` section 9.4, Direction A screen 11): Pupils and folders,
 * Collect and Hand back, the Prompter's use today and the bin. For the teacher, on the trust of
 * the name page (PS1); reached from the studio's header, or from the name page's corner.
 */
import type { BinnedProduction, HostInterface, ProductionInfo, UsageToday } from '@storystage/host';
import { collectClass, handBackClass, type HandBackReport } from '@storystage/production';
import { Button, Dialog, NeutralNote } from '@storystage/ui';
import { useCallback, useEffect, useState } from 'react';
import { sinceWords } from '../lesson/LessonPages.tsx';
import { words } from '../strings.ts';
import { DeviceFilmsCard } from './DeviceFilms.tsx';
import { PupilsCard, type OpenNow, type PupilFilms } from './Pupils.tsx';

const DEVICE = 'device';

const newestFirst = <T extends { savedAt: string }>(list: readonly T[]) =>
  [...list].sort((a, b) => b.savedAt.localeCompare(a.savedAt));

export function ClassSetup({
  host,
  open = { pupil: null, film: null },
}: {
  host: HostInterface;
  open?: OpenNow;
}) {
  const { classes } = host;
  // Every change bumps the version, and the page reads the class again.
  const [version, setVersion] = useState(0);
  const [pupils, setPupils] = useState<readonly PupilFilms[] | null>(null);
  const [bin, setBin] = useState<readonly BinnedProduction[]>([]);
  const [deviceFilms, setDeviceFilms] = useState<readonly ProductionInfo[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    void (async () => {
      const list = await classes.pupils();
      const withFilms = await Promise.all(
        list.map(async (pupil) => ({
          pupil,
          films: newestFirst(await (await classes.folder(pupil.id)).list()),
        })),
      );
      const binned = await classes.bin();
      const device = await classes.deviceFilms();
      if (gone) return;
      setDeviceFilms(newestFirst(device));
      setPupils(withFilms.sort((a, b) => a.pupil.name.localeCompare(b.pupil.name, 'en-GB')));
      setBin([...binned].sort((a, b) => b.binnedAt.localeCompare(a.binnedAt)));
    })().catch(() => {
      if (!gone) setProblem(words.t('lesson.folderProblem'));
    });
    return () => {
      gone = true;
    };
  }, [classes, version]);

  const act = useCallback(async (work: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await work();
      return true;
    } catch {
      setProblem(words.t('settings.problem'));
      return false;
    } finally {
      setVersion((v) => v + 1);
    }
  }, []);

  return (
    <div className="st-page">
      <div className="st-page-head">
        <h2 className="st-page-title">{words.t('settings.classSetup')}</h2>
        {pupils && (
          <span className="st-page-sub">
            {pupils.length > 0
              ? words.plural('settings.pupilCount', pupils.length)
              : words.t('settings.noClass')}
          </span>
        )}
      </div>
      {problem && (
        <p role="alert" className="st-problem">
          {problem}
        </p>
      )}
      <p role="status" className="st-status">
        {said}
      </p>
      {pupils && (
        <div className="st-grid">
          <PupilsCard classes={classes} pupils={pupils} open={open} act={act} />
          <div className="st-column">
            {pupils.length > 0 && deviceFilms.length > 0 && (
              <DeviceFilmsCard
                films={deviceFilms}
                pupils={pupils}
                deviceOpen={open.pupil === DEVICE}
                classes={classes}
                act={act}
                onMoved={setSaid}
              />
            )}
            <CollectCard
              host={host}
              hasPupils={pupils.length > 0}
              onChanged={() => setVersion((v) => v + 1)}
            />
            {host.prompterUsage && (
              <UsageCard usage={host.prompterUsage} pupils={pupils} version={version} />
            )}
            <BinCard bin={bin} pupils={pupils} classes={classes} act={act} />
          </div>
        </div>
      )}
    </div>
  );
}

function CollectCard({
  host,
  hasPupils,
  onChanged,
}: {
  host: HostInterface;
  hasPupils: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [report, setReport] = useState<HandBackReport | null>(null);

  const collect = async () => {
    setBusy(true);
    setReport(null);
    const outcome = await collectClass(host.classes, host.picker);
    setBusy(false);
    if (outcome.ok) return setSaid(words.plural('settings.collect.done', outcome.count));
    if (outcome.code === 'cancelled') return setSaid(null);
    setSaid(
      outcome.code === 'invalid'
        ? words.t('settings.collect.clash')
        : outcome.code === 'full'
          ? words.t('settings.collect.full')
          : words.t('settings.collect.failed'),
    );
  };

  const handBack = async () => {
    setBusy(true);
    setReport(null);
    const outcome = await handBackClass(host.classes, host.picker);
    setBusy(false);
    if ('ok' in outcome) {
      setSaid(outcome.code === 'cancelled' ? null : words.t('settings.handBack.failed'));
      return;
    }
    setSaid(words.plural('settings.handBack.done', outcome.written));
    setReport(outcome);
    onChanged();
  };

  return (
    <section className="st-card" aria-labelledby="st-collect-title">
      <h3 id="st-collect-title" className="st-card-title">
        {words.t('settings.collect')}
      </h3>
      <p className="st-note">{words.t('settings.collect.help')}</p>
      <div className="st-actions">
        <Button
          variant="secondary"
          icon="download"
          isDisabled={busy || !hasPupils}
          onPress={() => void collect()}
        >
          {words.t('settings.collect.button')}
        </Button>
        <Button
          variant="secondary"
          icon="upload"
          isDisabled={busy || !hasPupils}
          onPress={() => void handBack()}
        >
          {words.t('settings.handBack.button')}
        </Button>
      </div>
      <p role="status" className="st-status">
        {said}
      </p>
      {report && report.skipped.length > 0 && (
        <>
          <h4 className="st-subtitle">{words.t('settings.handBack.skipped')}</h4>
          <ul className="st-skipped">
            {report.skipped.map((s) => (
              <li key={`${s.folder}/${s.file}`}>
                <span className="st-row-name">
                  {s.folder} / {s.file}
                </span>
                <span className="st-note">{s.reason}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function UsageCard({
  usage,
  pupils,
  version,
}: {
  usage: NonNullable<HostInterface['prompterUsage']>;
  pupils: readonly PupilFilms[];
  version: number;
}) {
  const [today, setToday] = useState<UsageToday | null>(null);
  useEffect(() => {
    let gone = false;
    usage.today().then(
      (t) => !gone && setToday(t),
      () => !gone && setToday(null),
    );
    return () => {
      gone = true;
    };
  }, [usage, version]);
  if (!today) return null;
  const nameOf = (id: string | null) =>
    id === null
      ? words.t('settings.usage.device')
      : (pupils.find((p) => p.pupil.id === id)?.pupil.name ?? words.t('settings.usage.gone'));
  const amount = (used: number) =>
    today.dailyCap === null
      ? String(used)
      : words.t('settings.usage.of', { used, cap: today.dailyCap });
  return (
    <section className="st-card" aria-labelledby="st-usage-title">
      <h3 id="st-usage-title" className="st-card-title">
        {words.t('settings.usage')}
      </h3>
      <p className="st-note">{words.t('settings.usage.help')}</p>
      {today.entries.length === 0 ? (
        <p className="st-note">{words.t('settings.usage.none')}</p>
      ) : (
        <table className="st-usage">
          <thead>
            <tr>
              <th scope="col">{words.t('settings.usage.pupil')}</th>
              <th scope="col">{words.t('settings.usage.requests')}</th>
            </tr>
          </thead>
          <tbody>
            {[...today.entries]
              .sort((a, b) => b.used - a.used)
              .map((e) => (
                <tr key={e.pupil ?? DEVICE}>
                  <td>{nameOf(e.pupil)}</td>
                  <td>{amount(e.used)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BinCard({
  bin,
  pupils,
  classes,
  act,
}: {
  bin: readonly BinnedProduction[];
  pupils: readonly PupilFilms[];
  classes: HostInterface['classes'];
  act: (work: () => Promise<unknown>) => Promise<boolean>;
}) {
  const [emptying, setEmptying] = useState(false);
  const inClass = (id: string) => id === DEVICE || pupils.some((p) => p.pupil.id === id);
  const whose = (id: string) => {
    if (id === DEVICE) return words.t('settings.bin.device');
    const pupil = pupils.find((p) => p.pupil.id === id)?.pupil;
    return pupil
      ? words.t('settings.bin.whose', { name: pupil.name })
      : words.t('settings.bin.gone');
  };
  const anyGone = bin.some((b) => !inClass(b.pupil));
  return (
    <section className="st-card" aria-labelledby="st-bin-title">
      <h3 id="st-bin-title" className="st-card-title">
        {words.t('settings.bin')}
      </h3>
      <p className="st-note">{words.t('settings.bin.help')}</p>
      {bin.length === 0 ? (
        <p className="st-note">{words.t('settings.bin.empty')}</p>
      ) : (
        <>
          <ul className="st-films">
            {bin.map((b) => (
              <li key={`${b.pupil}/${b.key}`} className="st-film st-binned">
                <span className="st-binned-text">
                  <span className="st-row-name">{b.name}</span>
                  <span className="st-row-count">
                    {whose(b.pupil)} ·{' '}
                    {words.t('settings.bin.when', { when: sinceWords(b.binnedAt) })}
                  </span>
                </span>
                <Button
                  variant="quiet"
                  icon="restore_from_trash"
                  isDisabled={!inClass(b.pupil)}
                  aria-label={words.t('settings.bin.restoreNamed', { name: b.name })}
                  onPress={() => void act(() => classes.restore(b.pupil, b.key))}
                >
                  {words.t('settings.bin.restore')}
                </Button>
              </li>
            ))}
          </ul>
          {anyGone && <NeutralNote>{words.t('settings.bin.goneNote')}</NeutralNote>}
          <Button variant="secondary" icon="delete" onPress={() => setEmptying(true)}>
            {words.t('settings.bin.emptyBin')}
          </Button>
        </>
      )}
      <Dialog
        isOpen={emptying}
        onOpenChange={setEmptying}
        title={words.t('settings.bin.emptyTitle')}
        icon="delete"
      >
        <p className="st-dialog-text">{words.plural('settings.bin.emptyWarning', bin.length)}</p>
        <div className="st-actions">
          <Button
            variant="stop"
            icon="delete"
            onPress={() => {
              setEmptying(false);
              void act(() => classes.emptyBin());
            }}
          >
            {words.t('settings.bin.emptyBin')}
          </Button>
          <Button variant="secondary" onPress={() => setEmptying(false)}>
            {words.t('settings.cancel')}
          </Button>
        </div>
      </Dialog>
    </section>
  );
}
