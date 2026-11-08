/**
 * The studio's one production and its one undo history (`07-ux.md` sections 6.8 and 7.5;
 * `03-production-format.md` section 2.1): S4's `ProductionSession`, which every change goes
 * through, so undo never splits code from the set-up or storyboard it belongs with.
 *
 * - The Storyboard's changes to everything but the program are `change` steps. Typing into one
 *   field is one step until the learner leaves it: the first keystroke opens a group (`begin`),
 *   and leaving the field, or any other change, closes it (`commit`).
 * - Adding, deleting and moving scenes are the session's scene steps (`step`).
 * - The code editors' edits are `apply`, through the editors' host (`production/editorHost.ts`).
 */
import type { Production, ProductionRest, SceneStep } from '@storystage/production';
import { ProductionSession } from '@storystage/production';
import type { EditorId } from '@storystage/editor-contract';
import { checkProgram } from '@storystage/story-api/program-check';
import { useEffect, useMemo, useRef, useState } from 'react';

/** Who made a change, as the session records it. */
export type StudioSource = EditorId | 'storyboard' | 'prompter' | 'stage';

export interface Studio {
  readonly production: Production;
  readonly session: ProductionSession<StudioSource>;
  /**
   * A Storyboard change to anything but the program, named `label`. With `key`, changes with the
   * same key join one step until `seal`.
   */
  commit(label: string, next: Production, key?: string): void;
  /** A scene step (`addScene`, `deleteScene`, `moveScene`…): the program and the rest together. */
  step(step: SceneStep): { ok: true } | { ok: false; reason: string };
  /** Ends a run of keyed changes: the learner has left the field. */
  seal(): void;
  undo(): void;
  redo(): void;
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
}

const restOf = ({ program: _, ...rest }: Production): ProductionRest => rest;

export function useStudio(start: Production): Studio {
  const session = useMemo(
    () => new ProductionSession<StudioSource>(start, { check: (p) => checkProgram(p) }),
    // The session lives as long as the studio; opening a file loads into it (`session.load`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [production, setProduction] = useState(() => session.production());
  // The key of the group open now, if any.
  const open = useRef<string | null>(null);
  // Its label: what Undo would undo while the learner is still typing (07-ux 6.8). Setting it
  // also redraws the undo labels when the group closes, which leaves the production as it was.
  const [openLabel, setOpenLabel] = useState<string | null>(null);

  useEffect(() => session.subscribe((change) => setProduction(change.production)), [session]);

  return useMemo(() => {
    const close = () => {
      if (open.current === null) return;
      open.current = null;
      session.commit();
      setOpenLabel(null);
    };
    return {
      production,
      session,
      commit(label, next, key) {
        if (next.program !== session.program())
          throw new Error('A change to the program goes through step() or the editors.');
        if (key === undefined || key !== open.current) close();
        if (key !== undefined && open.current === null) {
          session.begin(label, 'storyboard');
          open.current = key;
          setOpenLabel(label);
        }
        session.change(label, 'storyboard', () => restOf(next));
      },
      step(step) {
        close();
        return session.step(step, 'storyboard');
      },
      seal: close,
      undo() {
        close();
        session.undo();
      },
      redo() {
        close();
        session.redo();
      },
      undoLabel: openLabel ?? session.undoLabel(),
      redoLabel: session.redoLabel(),
    };
  }, [session, production, openLabel]);
}
