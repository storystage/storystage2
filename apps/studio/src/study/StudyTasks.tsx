/**
 * Study tasks (spec 14 section 6.4; WP7.13): the list the study bar opens, the task card in the
 * Prompter's place, Check my step on a hidden stage, the fifteen minutes, and the two questions
 * after every task. S6's `@storystage/study` has the tasks, their films, their success tests and
 * their words; this draws them and runs them.
 */
import type { HostInterface } from '@storystage/host';
import type * as Speech from '@storystage/speech';
import type { RuntimeWorker } from '@storystage/playback';
import {
  STUDY_TASKS,
  TASK_LIMIT_MS,
  TASK_SCENE,
  checkTask,
  studyTask,
  t,
  type CheckOutcome,
  type Choice,
  type Ease,
  type SessionPhase,
  type StudySession,
  type StudyTask,
} from '@storystage/study';
import { Button, Dialog, Icon, Segmented } from '@storystage/ui';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { editorSetting, editorShown } from '../production/editorSetting.ts';
import { editorName } from '../production/EditorSwitch.tsx';
import { hiddenCanvas, type StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import type { Study } from './useStudy.ts';

const IDLE: SessionPhase = { kind: 'idle' };

/** What Check my step said last, for the card. */
export type CheckSaid =
  | { readonly kind: 'checking' }
  | { readonly kind: 'notYet' }
  | { readonly kind: 'error'; readonly words: string }
  | null;

/** How a task ended, said at the top of the questions. */
export type Ended = 'success' | 'timeUp' | 'stopped';

export interface StudyTasks {
  readonly phase: SessionPhase;
  /** The task open now, and when it opened, while one is. */
  readonly open: StudyTask | null;
  readonly said: CheckSaid;
  readonly ended: Ended | null;
  /** The editor a held task shows, in words, for the switch's note; `null` when nothing's held. */
  readonly heldNote: string | null;
  start(task: StudyTask): Promise<void>;
  check(): Promise<void>;
  hint(): void;
  stop(): void;
  answer(ease: Ease, choice: Choice): void;
}

export interface StudyTasksOptions {
  readonly study: Study;
  readonly studio: Studio;
  readonly host: Pick<HostInterface, 'policy'>;
  readonly models: ModelSourceHandle;
  /** Before a task's film opens, the learner's own is saved. */
  readonly beforeOpen: () => Promise<unknown>;
  readonly onAnnounce: (text: string) => void;
  /** For tests: how the hidden stage and the runtime worker are made. */
  readonly makeStage?: StageMaker;
  readonly startWorker?: () => RuntimeWorker;
}

const NO_PHASE = () => () => {};

/** Runs the study's tasks: opening one, Check my step, the time limit, the end and the questions. */
export function useStudyTasks({
  study,
  studio,
  host,
  models,
  beforeOpen,
  onAnnounce,
  makeStage,
  startWorker,
}: StudyTasksOptions): StudyTasks {
  const { session, settle } = study;
  const phase = useSyncExternalStore(
    session ? (l) => session.subscribe(l) : NO_PHASE,
    () => session?.current() ?? IDLE,
  );
  const [said, setSaid] = useState<CheckSaid>(null);
  const [ended, setEnded] = useState<Ended | null>(null);
  const stopping = useRef<AbortController | null>(null);
  const open = phase.kind === 'task' ? phase.task : null;

  const end = useCallback(
    (outcome: Ended) => {
      if (!session || session.current().kind !== 'task') return;
      stopping.current?.abort();
      // The last run of typing counts before the task ends (S6's review of #500).
      settle();
      session.endTask(outcome);
      studio.closeTask();
      setSaid(null);
      setEnded(outcome);
    },
    [session, settle, studio],
  );

  // Fifteen minutes, then the task ends (6.4).
  useEffect(() => {
    if (open === null) return;
    const timer = setTimeout(() => {
      onAnnounce(t('task.timeUp'));
      end('timeUp');
    }, TASK_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [open, end, onAnnounce]);

  // The folder closing ends a task with the session: the learner's own film comes back.
  useEffect(() => {
    if (!session && studio.inTask) studio.closeTask();
  }, [session, studio]);

  const policy = host.policy.editor;
  const start = async (task: StudyTask) => {
    if (!session || session.current().kind !== 'idle' || session.done().has(task)) return;
    await beforeOpen();
    const def = studyTask(task);
    const shown = def.holdsEditor ? policy.default : editorShown(editorSetting.get(), policy);
    if (!session.openTask(task, shown, def.holdsEditor)) return;
    setEnded(null);
    setSaid(null);
    studio.openTask(def.film());
    onAnnounce(words.t('study.opened', { title: def.title }));
  };

  const check = async () => {
    if (!session || open === null || stopping.current) return;
    settle();
    const stop = new AbortController();
    stopping.current = stop;
    setSaid({ kind: 'checking' });
    const film = studio.production;
    try {
      // The check's runner and the stage load with the first check, as Check this frame's do.
      const [{ traceScene }, { usedModels }, stages, playback] = await Promise.all([
        import('@storystage/check'),
        import('@storystage/export'),
        makeStage ? null : import('../stage/makeStage.ts'),
        startWorker ? null : import('@storystage/playback'),
      ]);
      await models.prepare(usedModels(film));
      if (stop.signal.aborted) return;
      const hidden = await (makeStage ?? stages!.makeStage)(hiddenCanvas(), {
        hidden: true,
        models: models.source,
      });
      let outcome: CheckOutcome;
      let errorWords = '';
      try {
        const run = await traceScene({
          production: film,
          stage: hidden,
          startWorker: startWorker ?? playback!.startRuntimeWorker,
          signal: stop.signal,
          scene: TASK_SCENE,
          events: studyTask(open).events,
        });
        outcome = checkTask(open, run);
        errorWords = run.error?.words ?? '';
      } finally {
        hidden.dispose();
      }
      if (stop.signal.aborted) return;
      session.checked(outcome);
      if (outcome === 'success') {
        onAnnounce(t('check.success'));
        end('success');
        return;
      }
      const next: CheckSaid =
        outcome === 'error' ? { kind: 'error', words: errorWords } : { kind: 'notYet' };
      setSaid(next);
      onAnnounce(next.kind === 'error' ? next.words : t('check.notYet'));
    } catch (e) {
      if (!stop.signal.aborted) {
        console.error('Check my step could not finish.', e);
        setSaid({ kind: 'error', words: words.t('study.checkFailed') });
      }
    } finally {
      if (stopping.current === stop) stopping.current = null;
    }
  };

  return {
    phase,
    open,
    said,
    ended,
    heldNote:
      open !== null && studyTask(open).holdsEditor
        ? t('held.note', { editor: editorName(policy.default) })
        : null,
    start,
    check,
    hint: () => session?.help('hint'),
    stop: () => end('stopped'),
    answer: (ease, choice) => {
      session?.answer('ease', ease);
      session?.answer('choice', choice);
      setEnded(null);
    },
  };
}

/** The study's tasks, from the study bar: each opens its own film; one done can't be done again. */
export function TasksDialog({
  session,
  isOpen,
  onClose,
  onStart,
}: {
  session: StudySession;
  isOpen: boolean;
  onClose: () => void;
  onStart: (task: StudyTask) => void;
}) {
  const done = session.done();
  return (
    <Dialog
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={t('bar.tasks')}
      icon="flag"
      width={560}
    >
      <p className="st-dialog-text">{words.t('study.tasksHelp')}</p>
      <ul className="study-tasks">
        {STUDY_TASKS.map((def) => {
          const finished = done.has(def.task);
          return (
            <li key={def.task} className="study-task-row" data-done={finished || undefined}>
              <Icon name={finished ? 'check_circle' : 'radio_button_unchecked'} filled={finished} />
              <span className="study-task-name">
                {words.t('study.taskName', { number: def.task.slice(1), title: def.title })}
              </span>
              {finished ? (
                <span className="study-task-state">{words.t('study.taskDone')}</span>
              ) : (
                <Button
                  variant="secondary"
                  icon="play_arrow"
                  aria-label={words.t('study.startNamed', { title: def.title })}
                  onPress={() => {
                    onClose();
                    onStart(def.task);
                  }}
                >
                  {words.t('study.start')}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** Reads a text aloud with an on-device voice (spec 06 section 3.3); none, and there's no button. */
function useReadAloud() {
  const [speech, setSpeech] = useState<typeof Speech | null>(null);
  const [voices, setVoices] = useState<readonly SpeechSynthesisVoice[]>([]);
  const stopping = useRef<(() => void) | null>(null);
  const [reading, setReading] = useState(false);
  useEffect(() => {
    const synth = globalThis.speechSynthesis;
    if (!synth) return;
    let live = true;
    void import('@storystage/speech').then((m) => live && setSpeech(m));
    const read = () => setVoices(synth.getVoices());
    read();
    synth.addEventListener('voiceschanged', read);
    return () => {
      live = false;
      synth.removeEventListener('voiceschanged', read);
      // Stopped when the card closes.
      stopping.current?.();
    };
  }, []);
  const voice = speech ? speech.chooseVoice(voices) : null;
  if (!speech || !voice) return null;
  return {
    reading,
    toggle(text: string) {
      if (stopping.current) {
        stopping.current();
        stopping.current = null;
        setReading(false);
        return;
      }
      const speaker = speech.browserSpeaker(
        globalThis.speechSynthesis,
        voice,
        // The browser's utterance, which the speaker sets as its UtteranceLike says.
        (text) => new SpeechSynthesisUtterance(text) as never,
      );
      setReading(true);
      stopping.current = speech.readAloud(speaker, text, () => {
        stopping.current = null;
        setReading(false);
      });
    },
  };
}

/** The task card, in the Prompter's place (6.4): the task, Read it to me, Hint, Check and Stop. */
export function TaskCard({ tasks }: { tasks: StudyTasks }) {
  const task = tasks.open;
  const [hinted, setHinted] = useState(false);
  const reader = useReadAloud();
  if (task === null) return null;
  const def = studyTask(task);
  const checking = tasks.said?.kind === 'checking';
  return (
    <section className="pm study-card" aria-label={words.t('study.card', { title: def.title })}>
      <div className="pm-band">
        <span className="pm-disc study-disc" aria-hidden="true">
          <Icon name="flag" size={22} />
        </span>
        <div className="pm-titles">
          <h2 className="pm-title">{def.title}</h2>
          <span className="study-card-sub">
            {words.t('study.taskOf', { number: task.slice(1) })}
          </span>
        </div>
      </div>
      <div className="pm-body">
        <p className="study-instruction">{def.instruction}</p>
        {reader && (
          <Button
            variant="secondary"
            icon={reader.reading ? 'stop' : 'play_arrow'}
            onPress={() => reader.toggle(def.instruction)}
          >
            {words.t(reader.reading ? 'study.stopReading' : 'study.readAloud')}
          </Button>
        )}
        {hinted ? (
          <p className="study-hint">
            <Icon name="lightbulb" size={20} />
            <span>{def.hint}</span>
          </p>
        ) : (
          <Button
            variant="quiet"
            icon="lightbulb"
            onPress={() => {
              setHinted(true);
              tasks.hint();
            }}
          >
            {words.t('study.hint')}
          </Button>
        )}
        {tasks.said && tasks.said.kind !== 'checking' && (
          <p className="pm-message" role="status">
            {tasks.said.kind === 'notYet' ? t('check.notYet') : tasks.said.words}
          </p>
        )}
      </div>
      <div className="pm-foot">
        <Button
          variant="primary"
          size="key"
          icon="check_circle"
          isDisabled={checking}
          onPress={() => void tasks.check()}
        >
          {words.t(checking ? 'study.checking' : 'study.check')}
        </Button>
        <div className="pm-actions">
          <Button variant="stop" icon="stop_circle" onPress={tasks.stop}>
            {words.t('study.stop')}
          </Button>
        </div>
      </div>
    </section>
  );
}

const EASES: readonly Exclude<Ease, 'skipped'>[] = ['hard', 'ok', 'easy'];
const CHOICES: readonly Exclude<Choice, 'skipped'>[] = ['blocks', 'tiles', 'dontMind'];

/** The two questions after every task (6.4), each with Skip; the answers are never shown again. */
export function QuestionsDialog({ tasks }: { tasks: StudyTasks }) {
  const asking = tasks.phase.kind === 'asking';
  // Nothing chosen until the learner chooses: a question left is logged as skipped.
  const [ease, setEase] = useState<Ease | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const first = useRef<HTMLDivElement>(null);
  // Focus goes to the first question (6.9), once React Aria's dialog has taken it.
  useEffect(() => {
    if (!asking) return;
    const frame = requestAnimationFrame(() =>
      first.current?.querySelector<HTMLElement>('input')?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [asking]);
  const finish = () => {
    tasks.answer(ease ?? 'skipped', choice ?? 'skipped');
    // Ready for the next task's questions.
    setEase(null);
    setChoice(null);
  };
  const intro =
    tasks.ended === 'success'
      ? t('check.success')
      : tasks.ended === 'timeUp'
        ? t('task.timeUp')
        : null;
  return (
    <Dialog
      isOpen={asking}
      onOpenChange={(open) => !open && finish()}
      title={words.t('study.questions')}
      icon="flag"
      width={560}
    >
      {intro && <p className="st-dialog-text study-ended">{intro}</p>}
      <div className="study-question" ref={first}>
        <span className="st-label" aria-hidden="true">
          {t('question.ease')}
        </span>
        <Segmented
          label={t('question.ease')}
          options={[
            ...EASES.map((e) => ({ id: e, label: t(`question.ease.${e}`) })),
            { id: 'skipped' as const, label: t('question.skip') },
          ]}
          value={ease ?? ('' as Ease)}
          onChange={setEase}
        />
      </div>
      <div className="study-question">
        <span className="st-label" aria-hidden="true">
          {t('question.choice')}
        </span>
        <Segmented
          label={t('question.choice')}
          options={[
            ...CHOICES.map((c) => ({ id: c, label: t(`question.choice.${c}`) })),
            { id: 'skipped' as const, label: t('question.skip') },
          ]}
          value={choice ?? ('' as Choice)}
          onChange={setChoice}
        />
      </div>
      <div className="st-actions">
        <Button variant="primary" icon="check_circle" onPress={finish}>
          {words.t('study.questionsDone')}
        </Button>
      </div>
    </Dialog>
  );
}
