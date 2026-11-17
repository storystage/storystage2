/**
 * One study session (spec 14, 6.3 to 6.6): from a taking-part pupil's folder opening until it
 * closes. The studio tells it what happens, in counts and fixed words, and it keeps the log.
 *
 * - Outside a task only the editor's switches are logged; edits, undos, redos, help and checks
 *   count only while a task is open.
 * - Nothing is written until the first task or switch, so a session with neither keeps no log.
 * - After that the whole file is written after each event, so a crash keeps what happened. A
 *   write that fails goes to `onError`, never to the learner's way.
 */
import type { CodeEditor } from '@storystage/host';
import { newCode, type RandomBytes } from './code.ts';
import type {
  AgeBand,
  CheckOutcome,
  Choice,
  Ease,
  EndOutcome,
  HelpVia,
  StudyEvent,
  StudyTask,
} from './events.ts';
import type { StudyStore } from './store.ts';

/** What the `session` event says. */
export interface SessionContext {
  /** The device's local date, `YYYY-MM-DD`. */
  readonly date: string;
  readonly version: string;
  readonly classCode: string | null;
  readonly ageBand: AgeBand | null;
  readonly editorDefault: CodeEditor;
  readonly editorLocked: boolean;
  /** The editor showing when the session started. */
  readonly editor: CodeEditor;
}

export interface SessionOptions {
  readonly store: StudyStore;
  readonly context: SessionContext;
  /** Milliseconds, from any start: `performance.now` unless a test gives its own. */
  readonly now?: () => number;
  readonly random?: RandomBytes;
  readonly onError?: (error: unknown) => void;
}

/** Where the session is: no task, a task open, or its two questions being asked. */
export type SessionPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'task'; readonly task: StudyTask }
  | { readonly kind: 'asking'; readonly task: StudyTask };

/** The device's local date, as the `session` event has it. */
export function localDate(at: Date = new Date()): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${two(at.getMonth() + 1)}-${two(at.getDate())}`;
}

export class StudySession {
  readonly code: string;
  private readonly store: StudyStore;
  private readonly now: () => number;
  private readonly started: number;
  private readonly onError: (error: unknown) => void;
  private readonly events: StudyEvent[];
  private kept = false;
  private phase: SessionPhase = { kind: 'idle' };
  private readonly answered = new Set<'ease' | 'choice'>();
  private readonly finished = new Set<StudyTask>();
  private writing: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<() => void>();

  constructor(options: SessionOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => performance.now());
    this.started = this.now();
    this.onError = options.onError ?? (() => {});
    this.code = newCode(options.random);
    this.events = [{ kind: 'session', t: 0, ...options.context }];
  }

  /** The phase now. */
  current(): SessionPhase {
    return this.phase;
  }

  /** The tasks done in this session, which can't be opened again in it (6.4). */
  done(): ReadonlySet<StudyTask> {
    return this.finished;
  }

  /** Told after each change of phase, for the study bar and the task card. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Opens a task, unless one is open or it was done in this session. */
  openTask(task: StudyTask, editor: CodeEditor, held: boolean): boolean {
    if (this.phase.kind !== 'idle' || this.finished.has(task)) return false;
    this.phase = { kind: 'task', task };
    this.log({ kind: 'task', t: this.time(), task, editor, held }, true);
    this.changed();
    return true;
  }

  /** The editor changed, by the learner's switch. Logged in a task or not. */
  switched(from: CodeEditor, to: CodeEditor): void {
    if (from === to) return;
    this.log({ kind: 'switch', t: this.time(), from, to }, true);
  }

  /** One undoable step made in a task. */
  edited(): void {
    this.inTask({ kind: 'edit', t: this.time() });
  }

  undone(): void {
    this.inTask({ kind: 'undo', t: this.time() });
  }

  redone(): void {
    this.inTask({ kind: 'redo', t: this.time() });
  }

  help(via: HelpVia): void {
    this.inTask({ kind: 'help', t: this.time(), via });
  }

  checked(outcome: CheckOutcome): void {
    this.inTask({ kind: 'check', t: this.time(), outcome });
  }

  /** The task ends (a success, time up, or stopped), and its two questions come next. */
  endTask(outcome: EndOutcome): void {
    if (this.phase.kind !== 'task') return;
    const { task } = this.phase;
    this.log({ kind: 'end', t: this.time(), outcome }, false);
    this.finished.add(task);
    this.answered.clear();
    this.phase = { kind: 'asking', task };
    this.changed();
  }

  answer(question: 'ease', value: Ease): void;
  answer(question: 'choice', value: Choice): void;
  answer(question: 'ease' | 'choice', value: Ease | Choice): void {
    if (this.phase.kind !== 'asking' || this.answered.has(question)) return;
    this.answered.add(question);
    this.log({ kind: 'answer', t: this.time(), question, value } as StudyEvent, false);
    if (this.answered.size === 2) this.toIdle();
  }

  /**
   * Closes whatever is open: a task still open ends as stopped, and a question not answered is
   * logged as skipped. For Stop this task, the questions' dialog closing, and the session ending.
   */
  close(): void {
    if (this.phase.kind === 'task') this.endTask('stopped');
    if (this.phase.kind === 'asking') {
      if (!this.answered.has('ease')) this.answer('ease', 'skipped');
      if (!this.answered.has('choice')) this.answer('choice', 'skipped');
    }
  }

  /** Waits for every write so far. */
  flush(): Promise<void> {
    return this.writing;
  }

  private toIdle() {
    this.phase = { kind: 'idle' };
    this.changed();
  }

  private time() {
    return Math.max(0, Math.round(this.now() - this.started));
  }

  private inTask(event: StudyEvent) {
    if (this.phase.kind === 'task') this.log(event, false);
  }

  /** Adds the event. `keeps`: a task or a switch, the events that make a session worth keeping. */
  private log(event: StudyEvent, keeps: boolean) {
    this.events.push(event);
    if (keeps) this.kept = true;
    if (!this.kept) return;
    const events = [...this.events];
    this.writing = this.writing
      .then(() => this.store.writeSession(this.code, events))
      .catch((error: unknown) => this.onError(error));
  }

  private changed() {
    for (const listener of this.listeners) listener();
  }
}
