import type { FrameId, LineId, Production } from '@storystage/production';
import type { Studio } from '../studio.ts';
import { addSketch } from '@storystage/sketches';
import { Button, useThemeStyle } from '@storystage/ui';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { words } from '../strings.ts';
import { FramePanel } from './FramePanel.tsx';
import { sceneNumber } from './edits.ts';
import { sceneFrames, updateFrame } from './frames.ts';
import { NOWHERE, currentPlace, type Place } from './place.ts';
import { sketchName, type SketchItem } from './SketchArt.tsx';
import { SketchLibrary } from './SketchLibrary.tsx';
import { SceneDetails } from './SceneDetails.tsx';
import { SceneStrip } from './SceneStrip.tsx';
import { ScriptHeader } from './ScriptHeader.tsx';
import { PrintStoryboard } from './PrintStoryboard.tsx';
import { ScriptPane } from './ScriptPane.tsx';

export interface StoryboardProps {
  /** The production and its one undo history (`studio.ts`). */
  studio: Studio;
  /** What the learner chose, shared with the other tabs. */
  place: Place;
  onPlaceChange: (place: Place) => void;
}

/** A CSS string, for the page foot's `content`. */
const cssString = (text: string) =>
  `"${text.replace(/[\\"]/g, (c) => `\\${c}`).replace(/\s/g, ' ')}"`;

/** Keys typed into a text field are the field's own: there, Ctrl+Z undoes the typing. */
const isTextEntry = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

/**
 * The Storyboard tab (`docs/spec/07-ux.md` section 6): the script header and arc (10.1, 10.2) and
 * the scene cards (10.3), the sketch library and the frames with their sketches (10.6), with the
 * Storyboard's undo history (6.8), and the script pane (10.4).
 */
export function Storyboard({ studio, place, onPlaceChange }: StoryboardProps) {
  const [announcement, setAnnouncement] = useState('');
  // Each press of Print storyboard, until the print dialog closes; 0 when not printing.
  const [printing, setPrinting] = useState(0);
  const themeStyle = useThemeStyle();
  const p = studio.production;
  // Where the learner is, shared with the other tabs (the App keeps it).
  const { scene: current, frame: currentFrame } = currentPlace(p, place);
  const frames = current ? sceneFrames(p, current) : [];
  const frameNumber =
    current && currentFrame
      ? `${sceneNumber(p, current)}.${frames.findIndex((f) => f.id === currentFrame) + 1}`
      : null;
  // The chosen sketch, while its frame is current.
  const [chosenSketch, setChosenSketch] = useState<{ frame: FrameId; id: string } | null>(null);
  const sketch = chosenSketch && chosenSketch.frame === currentFrame ? chosenSketch.id : null;
  // The chosen line, while it's in the current scene.
  const [chosenLine, setChosenLine] = useState<LineId | null>(null);
  const line = p.script.some((l) => l.id === chosenLine && l.scene === current) ? chosenLine : null;
  const commit = (label: string, next: Production, key?: string) => studio.commit(label, next, key);

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
  const { undoLabel, redoLabel } = studio;

  const undo = () => {
    if (!undoLabel) return;
    studio.undo();
    setAnnouncement(words.t('history.undone', { step: undoLabel }));
  };
  const redo = () => {
    if (!redoLabel) return;
    studio.redo();
    setAnnouncement(words.t('history.redone', { step: redoLabel }));
  };

  // Print: lay the storyboard out, open the device's print dialog, and put the layout away when
  // the dialog closes (decision 0054). The page foot reads the title and the word for page from
  // custom properties on the root, which `@page` margin boxes inherit.
  const footTitle = p.manifest.title.trim() || words.t('storyboard.untitled');
  useEffect(() => {
    if (printing === 0) return;
    const root = document.documentElement.style;
    root.setProperty('--sb-print-title', cssString(footTitle));
    root.setProperty('--sb-print-page', cssString(words.t('storyboard.print.page')));
    const done = () => setPrinting(0);
    window.addEventListener('afterprint', done);
    window.print();
    return () => {
      window.removeEventListener('afterprint', done);
      root.removeProperty('--sb-print-title');
      root.removeProperty('--sb-print-page');
    };
  }, [printing, footTitle]);

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
          <Button variant="quiet" icon="print" onPress={() => setPrinting((n) => n + 1)}>
            {words.t('storyboard.print')}
          </Button>
          <Button variant="quiet" icon="undo" isDisabled={!undoLabel} onPress={undo}>
            {words.t('history.undo')}
            {undoLabel && <span className="ss-visually-hidden">: {undoLabel}</span>}
          </Button>
          <Button variant="quiet" icon="redo" isDisabled={!redoLabel} onPress={redo}>
            {words.t('history.redo')}
            {redoLabel && <span className="ss-visually-hidden">: {redoLabel}</span>}
          </Button>
        </div>
        <ScriptHeader production={p} onChange={commit} onLeave={studio.seal} />
        <SceneStrip
          production={p}
          current={current}
          onCurrentChange={(scene) => onPlaceChange({ scene, frame: null })}
          onStep={(step) => studio.step(step)}
        />
        {current && (
          <SceneDetails
            production={p}
            scene={current}
            onChange={commit}
            onStep={(step) => studio.step(step)}
            onLeave={studio.seal}
            onDeleted={() => onPlaceChange(NOWHERE)}
          />
        )}
        {current && (
          <FramePanel
            production={p}
            scene={current}
            current={currentFrame}
            onCurrentChange={(frame) => onPlaceChange({ scene: current, frame })}
            onChange={commit}
            onLeave={studio.seal}
            sketch={sketch}
            onSketchChange={(id) =>
              setChosenSketch(id && currentFrame ? { frame: currentFrame, id } : null)
            }
            onAddSketch={addToFrame}
            onAnnounce={setAnnouncement}
          />
        )}
      </div>
      <ScriptPane
        production={p}
        scene={current}
        frame={currentFrame}
        chosen={line}
        onChosenChange={setChosenLine}
        onChange={commit}
        onLeave={studio.seal}
        onAnnounce={setAnnouncement}
      />
      {printing > 0 &&
        createPortal(
          <div className="ss-root sb-print-root" style={themeStyle}>
            <PrintStoryboard production={p} />
          </div>,
          document.body,
        )}
      <p className="ss-visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
