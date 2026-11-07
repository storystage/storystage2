import type { Production } from '@storystage/production';
import { Button } from '@storystage/ui';
import { useEffect, useState, type Dispatch } from 'react';
import { words } from '../strings.ts';
import { nextRedo, nextUndo, type History, type HistoryAction } from './history.ts';
import { ScriptHeader } from './ScriptHeader.tsx';

export interface StoryboardProps {
  history: History<Production>;
  dispatch: Dispatch<HistoryAction<Production>>;
}

/** Keys typed into a text field are the field's own: there, Ctrl+Z undoes the typing. */
const isTextEntry = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * The Storyboard tab (`docs/spec/07-ux.md` section 6). This is its main area's first part, the
 * script header and arc (10.1, 10.2), with the Storyboard's undo history (6.8). Scenes, frames,
 * the script pane and the sketch library follow.
 */
export function Storyboard({ history, dispatch }: StoryboardProps) {
  const [announcement, setAnnouncement] = useState('');
  const undoLabel = nextUndo(history);
  const redoLabel = nextRedo(history);

  const undo = () => {
    if (!undoLabel) return;
    dispatch({ type: 'undo' });
    setAnnouncement(words.t('history.undone', { step: undoLabel }));
  };
  const redo = () => {
    if (!redoLabel) return;
    dispatch({ type: 'redo' });
    setAnnouncement(words.t('history.redone', { step: redoLabel }));
  };

  // Ctrl+Z and Ctrl+Shift+Z (Cmd on a Mac or iPad): the keymap's first shortcuts (07-ux 6.8).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'z') return;
      if (isTextEntry(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="sb">
      <div className="sb-main">
        <div className="sb-toolbar" role="toolbar" aria-label={words.t('history.label')}>
          <Button variant="quiet" icon="undo" isDisabled={!undoLabel} onPress={undo}>
            {words.t('history.undo')}
            {undoLabel && <span className="ss-visually-hidden">: {undoLabel}</span>}
          </Button>
          <Button variant="quiet" icon="redo" isDisabled={!redoLabel} onPress={redo}>
            {words.t('history.redo')}
            {redoLabel && <span className="ss-visually-hidden">: {redoLabel}</span>}
          </Button>
        </div>
        <ScriptHeader
          production={history.present}
          onChange={(label, next, key) => dispatch({ type: 'commit', label, next, key })}
          onLeave={() => dispatch({ type: 'seal' })}
        />
      </div>
      <p className="ss-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
