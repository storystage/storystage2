/**
 * What the study log holds (spec 14, 6.6), and nothing else. Each event has `t`, whole
 * milliseconds since its session started. Every field is one of a few fixed words, a count of
 * time, the app's version, or the study class code: never a name, an id from the class list,
 * anything from the program, or anything typed. `isStudyEvent` refuses any other field, so a log
 * read back or exported can't carry more than this.
 */
import { CODE_EDITORS, type CodeEditor } from '@storystage/host';

export const TASKS = ['T1', 'T2', 'T3', 'T4', 'T5'] as const;
export type StudyTask = (typeof TASKS)[number];

export const AGE_BANDS = ['6-8', '9-11', '12-13'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

export const HELP = ['hint', 'learn'] as const;
export const CHECKS = ['success', 'notYet', 'error'] as const;
export const ENDS = ['success', 'timeUp', 'stopped'] as const;
export const EASE = ['hard', 'ok', 'easy', 'skipped'] as const;
export const CHOICE = ['blocks', 'tiles', 'dontMind', 'skipped'] as const;

export type HelpVia = (typeof HELP)[number];
export type CheckOutcome = (typeof CHECKS)[number];
export type EndOutcome = (typeof ENDS)[number];
export type Ease = (typeof EASE)[number];
export type Choice = (typeof CHOICE)[number];

export type StudyEvent =
  | {
      readonly kind: 'session';
      readonly t: number;
      /** The device's local date, `YYYY-MM-DD`: never the time of day. */
      readonly date: string;
      readonly version: string;
      readonly classCode: string | null;
      readonly ageBand: AgeBand | null;
      readonly editorDefault: CodeEditor;
      readonly editorLocked: boolean;
      readonly editor: CodeEditor;
    }
  | {
      readonly kind: 'task';
      readonly t: number;
      readonly task: StudyTask;
      readonly editor: CodeEditor;
      readonly held: boolean;
    }
  | {
      readonly kind: 'switch';
      readonly t: number;
      readonly from: CodeEditor;
      readonly to: CodeEditor;
    }
  | { readonly kind: 'edit' | 'undo' | 'redo'; readonly t: number }
  | { readonly kind: 'help'; readonly t: number; readonly via: HelpVia }
  | { readonly kind: 'check'; readonly t: number; readonly outcome: CheckOutcome }
  | { readonly kind: 'end'; readonly t: number; readonly outcome: EndOutcome }
  | { readonly kind: 'answer'; readonly t: number; readonly question: 'ease'; readonly value: Ease }
  | {
      readonly kind: 'answer';
      readonly t: number;
      readonly question: 'choice';
      readonly value: Choice;
    };

export type StudyEventKind = StudyEvent['kind'];

/** The study class code (6.8): a short label from the study team, never the class's name. */
const CLASS_CODE = /^[A-Za-z0-9-]{1,12}$/;
export const isClassCode = (value: unknown): value is string =>
  typeof value === 'string' && CLASS_CODE.test(value);

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** An app version, as `package.json` has it: "0.4.0" or "0.4.0-rc.1". */
const VERSION = /^[0-9A-Za-z.+-]{1,32}$/;

const isOneOf = <T>(list: readonly T[], value: unknown): value is T => list.includes(value as T);
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Each kind's fields, exactly: an event with any other field isn't one. */
const FIELDS: Record<StudyEventKind, readonly string[]> = {
  session: [
    'kind',
    't',
    'date',
    'version',
    'classCode',
    'ageBand',
    'editorDefault',
    'editorLocked',
    'editor',
  ],
  task: ['kind', 't', 'task', 'editor', 'held'],
  switch: ['kind', 't', 'from', 'to'],
  edit: ['kind', 't'],
  undo: ['kind', 't'],
  redo: ['kind', 't'],
  help: ['kind', 't', 'via'],
  check: ['kind', 't', 'outcome'],
  end: ['kind', 't', 'outcome'],
  answer: ['kind', 't', 'question', 'value'],
};

export function isStudyEvent(value: unknown): value is StudyEvent {
  if (!isObject(value) || !isOneOf(Object.keys(FIELDS), value.kind)) return false;
  const kind = value.kind as StudyEventKind;
  const keys = Object.keys(value);
  if (keys.length !== FIELDS[kind].length || !keys.every((k) => FIELDS[kind].includes(k)))
    return false;
  if (typeof value.t !== 'number' || !Number.isInteger(value.t) || value.t < 0) return false;
  switch (kind) {
    case 'session':
      return (
        typeof value.date === 'string' &&
        DATE.test(value.date) &&
        typeof value.version === 'string' &&
        VERSION.test(value.version) &&
        (value.classCode === null || isClassCode(value.classCode)) &&
        (value.ageBand === null || isOneOf(AGE_BANDS, value.ageBand)) &&
        isOneOf(CODE_EDITORS, value.editorDefault) &&
        typeof value.editorLocked === 'boolean' &&
        isOneOf(CODE_EDITORS, value.editor)
      );
    case 'task':
      return (
        isOneOf(TASKS, value.task) &&
        isOneOf(CODE_EDITORS, value.editor) &&
        typeof value.held === 'boolean'
      );
    case 'switch':
      return isOneOf(CODE_EDITORS, value.from) && isOneOf(CODE_EDITORS, value.to);
    case 'edit':
    case 'undo':
    case 'redo':
      return true;
    case 'help':
      return isOneOf(HELP, value.via);
    case 'check':
      return isOneOf(CHECKS, value.outcome);
    case 'end':
      return isOneOf(ENDS, value.outcome);
    case 'answer':
      return (
        (value.question === 'ease' && isOneOf(EASE, value.value)) ||
        (value.question === 'choice' && isOneOf(CHOICE, value.value))
      );
  }
}
