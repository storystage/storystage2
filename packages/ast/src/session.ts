/**
 * An open program with its undo history (`docs/spec/01-ast.md`, section 5). The studio builds its
 * `EditorHost` on this; the session adds nothing the contract doesn't need but the history.
 */
import { applyAll, applyEdit, EditRefused, type EditOperation } from './edits.ts';
import type { Program } from './nodes.ts';
import { validateProgram, type Problem } from './validate.ts';

/** What `EditorHost.apply` returns. */
export type SessionResult = { readonly ok: true } | { readonly ok: false; readonly reason: string };

export interface SessionChange<Source extends string = string> {
  readonly program: Program;
  readonly edits: readonly EditOperation[];
  readonly label: string;
  readonly source: Source | 'undo' | 'redo' | 'load';
}

export interface HistoryEntry<Source extends string = string> {
  readonly label: string;
  readonly source: Source;
  /** `false` once undone, until it's redone. */
  readonly done: boolean;
}

export interface SessionOptions {
  /** More rules for every edit, such as the Story API's (spec section 4.5). */
  readonly check?: (program: Program) => readonly Problem[];
  /** Set for a file from a newer version: every edit is refused with this message. */
  readonly readOnly?: string;
}

interface Step<Source> {
  readonly label: string;
  readonly source: Source;
  readonly edits: EditOperation[];
  readonly inverses: EditOperation[];
}

export class EditSession<Source extends string = string> {
  private current: Program;
  private done: Step<Source>[] = [];
  private undone: Step<Source>[] = [];
  private open: Step<Source> | null = null;
  private readonly listeners = new Set<(change: SessionChange<Source>) => void>();
  private readonly options: SessionOptions;

  constructor(program: Program, options: SessionOptions = {}) {
    this.current = program;
    this.options = options;
  }

  program(): Program {
    return this.current;
  }

  /**
   * Applies edits as one undo step, all or nothing, or adds them to the open group, where
   * the group's label and source stand.
   */
  apply(edits: readonly EditOperation[], label: string, source: Source): SessionResult {
    if (this.options.readOnly !== undefined) return { ok: false, reason: this.options.readOnly };
    if (edits.length === 0) return { ok: true };
    let applied: ReturnType<typeof applyAll>;
    try {
      applied = applyAll(
        this.current,
        edits,
        this.options.check ? { check: this.options.check } : {},
      );
    } catch (e) {
      if (e instanceof EditRefused) return { ok: false, reason: e.reason };
      throw e;
    }
    const step = this.open ?? { label, source, edits: [], inverses: [] };
    step.edits.push(...edits);
    step.inverses.push(...applied.inverses);
    if (!this.open) this.done.push(step);
    this.undone = [];
    this.set(applied.program, edits, step.label, step.source);
    return { ok: true };
  }

  /** Opens a step that later `apply` calls join: a whole Prompter request is one undo step. */
  begin(label: string, source: Source): void {
    if (this.open) throw new Error('A group is already open.');
    this.open = { label, source, edits: [], inverses: [] };
  }

  commit(): void {
    const step = this.closeGroup();
    if (step.edits.length > 0) this.done.push(step);
  }

  /** Takes back everything done since `begin`. */
  cancel(): void {
    const step = this.closeGroup();
    if (step.edits.length > 0) this.runBack(step);
  }

  undo(): void {
    if (this.open) return;
    const step = this.done.pop();
    if (!step) return;
    this.undone.push(step);
    this.runBack(step);
  }

  redo(): void {
    if (this.open) return;
    const step = this.undone.pop();
    if (!step) return;
    this.done.push(step);
    this.set(this.run(step.edits), step.edits, step.label, 'redo');
  }

  undoLabel(): string | null {
    return this.done.at(-1)?.label ?? null;
  }

  redoLabel(): string | null {
    return this.undone.at(-1)?.label ?? null;
  }

  /** Every step, oldest first. */
  history(): HistoryEntry<Source>[] {
    const entry =
      (done: boolean) =>
      ({ label, source }: Step<Source>): HistoryEntry<Source> => ({ label, source, done });
    return [...this.done.map(entry(true)), ...this.undone.map(entry(false)).reverse()];
  }

  /** Undoes or redoes until `count` steps are done, as the history panel does. */
  goTo(count: number): void {
    const total = this.done.length + this.undone.length;
    if (!Number.isInteger(count) || count < 0 || count > total)
      throw new Error(`There is no step ${count}.`);
    while (this.done.length > count) this.undo();
    while (this.done.length < count) this.redo();
  }

  subscribe(listener: (change: SessionChange<Source>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Starts afresh with another program and an empty history, as opening a file does. */
  load(program: Program): void {
    if (this.open) throw new Error('Close the open group before loading.');
    const problems = validateProgram(program);
    if (problems.length > 0) throw new Error(`Not a valid program: ${problems[0]!.message}`);
    this.done = [];
    this.undone = [];
    this.set(program, [], 'Open', 'load');
  }

  private closeGroup(): Step<Source> {
    if (!this.open) throw new Error('No group is open.');
    const step = this.open;
    this.open = null;
    return step;
  }

  private runBack(step: Step<Source>): void {
    const inverses = [...step.inverses].reverse();
    this.set(this.run(inverses), inverses, step.label, 'undo');
  }

  /** These edits ran from this state before, or are their inverses, so they can't be refused. */
  private run(edits: readonly EditOperation[]): Program {
    return edits.reduce((program, edit) => applyEdit(program, edit).program, this.current);
  }

  private set(
    program: Program,
    edits: readonly EditOperation[],
    label: string,
    source: SessionChange<Source>['source'],
  ): void {
    this.current = program;
    const change = { program, edits, label, source };
    for (const listener of [...this.listeners]) listener(change);
  }
}
