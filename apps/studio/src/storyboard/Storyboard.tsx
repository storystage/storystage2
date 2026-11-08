import type { FrameId, Production, SceneId } from '@storystage/production';
import { addSketch } from '@storystage/sketches';
import { Button } from '@storystage/ui';
import { useEffect, useState, type Dispatch } from 'react';
import { words } from '../strings.ts';
import { nextRedo, nextUndo, type History, type HistoryAction } from './history.ts';
import { FramePanel } from './FramePanel.tsx';
import { sceneNumber } from './edits.ts';
import { sceneFrames, updateFrame } from './frames.ts';
import { sketchName, type SketchItem } from './SketchArt.tsx';
import { SketchLibrary } from './SketchLibrary.tsx';
import { SceneDetails } from './SceneDetails.tsx';
import { SceneStrip } from './SceneStrip.tsx';
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
 * The Storyboard tab (`docs/spec/07-ux.md` section 6): the script header and arc (10.1, 10.2) and
 * the scene cards (10.3), the sketch library and the frames with their sketches (10.6), with the
 * Storyboard's undo history (6.8). The script pane follows.
 */
export function Storyboard({ history, dispatch }: StoryboardProps) {
  const [announcement, setAnnouncement] = useState('');
  const [chosen, setChosen] = useState<SceneId | null>(null);
  const p = history.present;
  // The chosen scene, or the first one if it has gone (deleted, or undone).
  const order = p.manifest.runningOrder.map((r) => r.scene);
  const current = chosen !== null && order.includes(chosen) ? chosen : (order[0] ?? null);
  const [chosenFrame, setChosenFrame] = useState<FrameId | null>(null);
  // The chosen frame if it's in the current scene, or the scene's first frame.
  const frames = current ? sceneFrames(p, current) : [];
  const currentFrame = frames.some((f) => f.id === chosenFrame)
    ? chosenFrame
    : (frames[0]?.id ?? null);
  const frameNumber =
    current && currentFrame
      ? `${sceneNumber(p, current)}.${frames.findIndex((f) => f.id === currentFrame) + 1}`
      : null;
  // The chosen sketch, while its frame is current.
  const [chosenSketch, setChosenSketch] = useState<{ frame: FrameId; id: string } | null>(null);
  const sketch = chosenSketch && chosenSketch.frame === currentFrame ? chosenSketch.id : null;
  const commit = (label: string, next: Production, key?: string) =>
    dispatch({ type: 'commit', label, next, key });

  const addToFrame = (item: SketchItem, x?: number, y?: number) => {
    const frame = p.frames.find((f) => f.id === currentFrame);
    const added = frame && frameNumber ? addSketch(frame, { item, x, y }) : null;
    if (!frame || !frameNumber || !added) return;
    const name = sketchName(item);
    commit(
      words.t('step.addSketch', { name }),
      updateFrame(p, frame.id, () => added.frame),
    );
    setChosenSketch({ frame: frame.id, id: added.id });
    setAnnouncement(words.t('storyboard.canvas.added', { name, number: frameNumber }));
  };
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
      <SketchLibrary
        production={p}
        frame={currentFrame && frameNumber ? { id: currentFrame, number: frameNumber } : null}
        onAdd={(item) => addToFrame(item)}
      />
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
        <ScriptHeader production={p} onChange={commit} onLeave={() => dispatch({ type: 'seal' })} />
        <SceneStrip
          production={p}
          current={current}
          onCurrentChange={setChosen}
          onChange={commit}
        />
        {current && (
          <SceneDetails
            production={p}
            scene={current}
            onChange={commit}
            onLeave={() => dispatch({ type: 'seal' })}
            onDeleted={() => setChosen(null)}
          />
        )}
        {current && (
          <FramePanel
            production={p}
            scene={current}
            current={currentFrame}
            onCurrentChange={setChosenFrame}
            onChange={commit}
            onLeave={() => dispatch({ type: 'seal' })}
            sketch={sketch}
            onSketchChange={(id) =>
              setChosenSketch(id && currentFrame ? { frame: currentFrame, id } : null)
            }
            onAddSketch={addToFrame}
            onAnnounce={setAnnouncement}
          />
        )}
      </div>
      <p className="ss-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
