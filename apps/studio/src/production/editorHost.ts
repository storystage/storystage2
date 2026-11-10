/**
 * The code editors' host (`14-editors.md` section 1), on the production's own session
 * (`studio.ts`): a step made in a code editor is one undo step in the same history as the
 * Storyboard's and the stage's (`07-ux.md` section 7.5), and the session checks it with the
 * Story API's rules (`checkProgram`). A refused step changes nothing.
 */
import type { Program } from '@storystage/ast';
import type { ChangeSource, EditorHost, ProgramChange } from '@storystage/editor-contract';
import type { ProductionChange, ProductionSession } from '@storystage/production';
import { useMemo } from 'react';
import type { StudioSource } from '../studio.ts';

/**
 * How the session's sources read to an editor: the Storyboard's and the stage's changes are loads.
 * A check's result (`annotate`) never changes the program, so editors don't see it; it reads as a
 * load too.
 */
function sourceOf(source: ProductionChange<StudioSource>['source']): ChangeSource {
  return source === 'storyboard' || source === 'check' ? 'load' : source;
}

export function editorHost(
  session: ProductionSession<StudioSource>,
  announce: (text: string) => void,
): EditorHost {
  return {
    program: () => session.program(),
    apply: (edits, label, source) => session.apply(edits, label, source),
    subscribe(listener) {
      let last: Program = session.program();
      return session.subscribe((change) => {
        const program = change.production.program;
        // Editors redraw from the program: a change elsewhere (a caption, a frame) isn't theirs.
        if (program === last) return;
        last = program;
        const told: ProgramChange = {
          program,
          edits: change.edits,
          label: change.label,
          source: sourceOf(change.source),
        };
        listener(told);
      });
    },
    undo: () => session.undo(),
    redo: () => session.redo(),
    undoLabel: () => session.undoLabel(),
    redoLabel: () => session.redoLabel(),
    announce,
    policy: { editorLocked: false },
  };
}

/**
 * The host for the studio's session, the same object for as long as the session lives.
 * `announce` should be stable (a state setter).
 */
export function useEditorHost(
  session: ProductionSession<StudioSource>,
  announce: (text: string) => void,
): EditorHost {
  return useMemo(() => editorHost(session, announce), [session, announce]);
}
