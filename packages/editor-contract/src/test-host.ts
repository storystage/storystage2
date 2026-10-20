/**
 * An `EditorHost` for editor tests (both options, and the parity tests' unit level). It keeps
 * an undo history of labelled steps and tells subscribers about every change. Until WP2 lands,
 * edits are applied by the `apply` function given to it (by default they leave the program as
 * it is); S2's edit operations plug in here.
 */
import type { EditOperation, Program } from '@storystage/ast';
import type { ChangeSource, EditResult, EditorHost, EditorId, ProgramChange } from './contract.ts';

export interface TestHostOptions {
  /** Applies edits to a program; throw to refuse them (the reason becomes the refusal). */
  readonly apply?: (program: Program, edits: readonly EditOperation[]) => Program;
  readonly editorLocked?: boolean;
}

interface Step {
  readonly before: Program;
  readonly after: Program;
  readonly edits: readonly EditOperation[];
  readonly label: string;
}

export class TestHost implements EditorHost {
  readonly announcements: string[] = [];
  readonly changes: ProgramChange[] = [];
  readonly policy: { readonly editorLocked: boolean };
  private current: Program;
  private done: Step[] = [];
  private undone: Step[] = [];
  private listeners = new Set<(c: ProgramChange) => void>();
  private readonly applyEdits: (program: Program, edits: readonly EditOperation[]) => Program;

  constructor(program: Program, options: TestHostOptions = {}) {
    this.current = program;
    this.applyEdits = options.apply ?? ((p) => p);
    this.policy = { editorLocked: options.editorLocked ?? false };
  }

  program(): Program {
    return this.current;
  }

  apply(edits: readonly EditOperation[], label: string, source: EditorId): EditResult {
    let after: Program;
    try {
      after = this.applyEdits(this.current, edits);
    } catch (e) {
      return { ok: false, reason: e instanceof Error ? e.message : String(e) };
    }
    this.done.push({ before: this.current, after, edits, label });
    this.undone = [];
    this.set(after, edits, label, source);
    return { ok: true };
  }

  subscribe(listener: (change: ProgramChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  undo(): void {
    const step = this.done.pop();
    if (!step) return;
    this.undone.push(step);
    this.set(step.before, step.edits, step.label, 'undo');
  }

  redo(): void {
    const step = this.undone.pop();
    if (!step) return;
    this.done.push(step);
    this.set(step.after, step.edits, step.label, 'redo');
  }

  undoLabel(): string | null {
    return this.done.at(-1)?.label ?? null;
  }

  redoLabel(): string | null {
    return this.undone.at(-1)?.label ?? null;
  }

  announce(text: string): void {
    this.announcements.push(text);
  }

  /** Test helper: a change from somewhere else (the Prompter, the stage, loading a file). */
  external(
    program: Program,
    label: string,
    source: Exclude<ChangeSource, EditorId | 'undo' | 'redo'>,
  ): void {
    this.set(program, [], label, source);
  }

  private set(
    program: Program,
    edits: readonly EditOperation[],
    label: string,
    source: ChangeSource,
  ) {
    this.current = program;
    const change: ProgramChange = { program, edits, label, source };
    this.changes.push(change);
    for (const l of [...this.listeners]) l(change);
  }
}
