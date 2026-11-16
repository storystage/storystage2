/**
 * Undo and Redo (`07-ux.md` sections 6.8 and 7.5): the studio's one history, shared by the
 * Storyboard, the scene view and the Code editor. Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac or iPad)
 * undo and redo outside text fields, and the buttons do the same. Each says what it undid.
 */
import { Button } from '@storystage/ui';
import { useEffect } from 'react';
import { words } from './strings.ts';
import type { Studio } from './studio.ts';

/** Keys typed into a text field are the field's own: there, Ctrl+Z undoes the typing. */
export const isTextEntry = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

export interface History {
  readonly undoLabel: string | null;
  readonly redoLabel: string | null;
  undo(): void;
  redo(): void;
}

/**
 * The studio's history for one tab, with its keys while `enabled` (the tab showing, nothing
 * over it). `announce` says what was undone or redone.
 */
export function useHistory(
  studio: Studio,
  announce: (text: string) => void,
  enabled = true,
): History {
  const { undoLabel, redoLabel } = studio;
  const history: History = {
    undoLabel,
    redoLabel,
    undo() {
      if (!undoLabel) return;
      studio.undo();
      announce(words.t('history.undone', { step: undoLabel }));
    },
    redo() {
      if (!redoLabel) return;
      studio.redo();
      announce(words.t('history.redone', { step: redoLabel }));
    },
  };

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'z') return;
      if (isTextEntry(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) history.redo();
      else history.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return history;
}

/** The Undo and Redo buttons, each naming its step for screen readers. */
export function HistoryButtons({ history }: { history: History }) {
  const { undoLabel, redoLabel } = history;
  return (
    <>
      <Button variant="quiet" icon="undo" isDisabled={!undoLabel} onPress={history.undo}>
        {words.t('history.undo')}
        {undoLabel && <span className="ss-visually-hidden">: {undoLabel}</span>}
      </Button>
      <Button variant="quiet" icon="redo" isDisabled={!redoLabel} onPress={history.redo}>
        {words.t('history.redo')}
        {redoLabel && <span className="ss-visually-hidden">: {redoLabel}</span>}
      </Button>
    </>
  );
}
