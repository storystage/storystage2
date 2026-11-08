/**
 * The code editors' host (`14-editors.md` section 1), on the studio's history: a step made in
 * the Code editor is one undo step in the same history as the Storyboard's (`07-ux.md` section
 * 7.5). Edits are checked as the AST checks every edit, with the Story API's whole-program check
 * (`checkProgram`, WP4a), and a refused step changes nothing.
 *
 * When the production's own undo session (WP8.2, `ProductionSession`) takes over the studio's
 * history, this host moves onto it without the editors noticing.
 */
import { EditRefused, applyAll, type EditOperation, type Program } from '@storystage/ast';
import type {
  ChangeSource,
  EditResult,
  EditorHost,
  EditorId,
  ProgramChange,
} from '@storystage/editor-contract';
import type { Production } from '@storystage/production';
import { checkProgram } from '@storystage/story-api/program-check';
import { useEffect, useLayoutEffect, useMemo, useRef, type Dispatch } from 'react';
import { nextRedo, nextUndo, type History, type HistoryAction } from '../storyboard/history.ts';

/** Applies an editor's edits, all or nothing, with the Story API's rules. */
export function applyCode(program: Program, edits: readonly EditOperation[]): Program {
  return applyAll(program, edits, { check: (p) => checkProgram(p) }).program;
}

interface Pending {
  readonly source: ChangeSource;
  readonly edits: readonly EditOperation[];
  readonly label: string;
}

export function useEditorHost(
  history: History<Production>,
  dispatch: Dispatch<HistoryAction<Production>>,
  announce: (text: string) => void,
): EditorHost {
  const latest = useRef(history);
  const say = useRef(announce);
  // The host reads the latest history and live region when an editor calls it, after rendering.
  // A program applied but not yet rendered: what `program()` gives until the history catches up.
  const ahead = useRef<Program | null>(null);
  useLayoutEffect(() => {
    latest.current = history;
    say.current = announce;
    ahead.current = null;
  });
  const listeners = useRef(new Set<(change: ProgramChange) => void>());
  const pending = useRef<Pending | null>(null);
  const told = useRef(history.present.program);

  const host = useMemo<EditorHost>(
    () => ({
      program: () => ahead.current ?? latest.current.present.program,
      apply(edits: readonly EditOperation[], label: string, source: EditorId): EditResult {
        const present = latest.current.present;
        let next: Program;
        try {
          next = applyCode(ahead.current ?? present.program, edits);
        } catch (e) {
          if (e instanceof EditRefused) return { ok: false, reason: e.reason };
          throw e;
        }
        pending.current = { source, edits, label };
        ahead.current = next;
        dispatch({ type: 'commit', label, next: { ...present, program: next } });
        return { ok: true };
      },
      subscribe(listener) {
        listeners.current.add(listener);
        return () => listeners.current.delete(listener);
      },
      undo() {
        const label = nextUndo(latest.current);
        if (!label) return;
        pending.current = { source: 'undo', edits: [], label };
        dispatch({ type: 'undo' });
      },
      redo() {
        const label = nextRedo(latest.current);
        if (!label) return;
        pending.current = { source: 'redo', edits: [], label };
        dispatch({ type: 'redo' });
      },
      undoLabel: () => nextUndo(latest.current),
      redoLabel: () => nextRedo(latest.current),
      announce: (text) => say.current(text),
      policy: { editorLocked: false },
    }),
    [dispatch],
  );

  // Every change to the program, whatever made it, reaches the editor showing (section 1.1).
  const program = history.present.program;
  useEffect(() => {
    if (program === told.current) return;
    told.current = program;
    const why = pending.current;
    pending.current = null;
    const change: ProgramChange = {
      program,
      edits: why?.edits ?? [],
      label: why?.label ?? '',
      // A change from the Storyboard (a scene added, deleted or undone there) counts as a load.
      source: why?.source ?? 'load',
    };
    for (const listener of listeners.current) listener(change);
  }, [program]);

  return host;
}
