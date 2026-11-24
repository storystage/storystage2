/**
 * The Tiles editor for one method (`14-editors.md` sections 3 and 4; WP7.11), beside the Blocks
 * editor under the Code editor's one bar: the bar chooses the palette's object and tab and the
 * method, so Tiles draws none of those itself (`studio: true`). Loaded on demand, as Blocks is.
 */
import type { Expression, NodeId } from '@storystage/ast';
import type { EditorHost, HighlightMark } from '@storystage/editor-contract';
import type { PaletteTab } from '@storystage/story-api/editing';
import { TileEditor } from '@storystage/tiles';
import { useEffect, useRef, useState } from 'react';
import { words } from '../strings.ts';
import type { Highlights } from './BlocksPanel.tsx';
import type { Handoff } from './handoff.ts';
import type { SoundWords } from '../sound/codeWords.ts';

export interface TilesPanelProps {
  method: NodeId;
  host: EditorHost;
  /** The object the palette offers blocks for, and its tab: the bar's. */
  target: Expression;
  tab: PaletteTab;
  /** A statement to put keyboard focus on as the editor opens: the one Screening's Fix chose. */
  focus?: NodeId | null;
  highlights?: Highlights;
  /** Where the Code editor finds the editor showing, for the statement chosen in it. */
  editorRef?: { current: { selection(): readonly NodeId[] } | null };
  /** Where the learner was in Blocks, after a switch (section 4.2). */
  handoff?: Handoff;
  /** The film's sounds and their names, for a block's sound (7.17; `soundWords`). */
  sounds?: SoundWords;
}

const NO_MARKS: readonly HighlightMark[] = [];
const NO_HIGHLIGHTS: Highlights = { rehearse: NO_MARKS, error: NO_MARKS };

export default function TilesPanel({
  method,
  host,
  target,
  tab,
  focus = null,
  highlights = NO_HIGHLIGHTS,
  editorRef,
  handoff,
  sounds,
}: TilesPanelProps) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<TileEditor | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!box.current) return;
    const tiles = new TileEditor({ studio: true, ...sounds });
    const given = handoff?.take();
    tiles.mount(
      box.current,
      host,
      given ? { ...given, method } : { method, selection: focus ? [focus] : [], focus },
    );
    editor.current = tiles;
    if (editorRef) editorRef.current = tiles;
    // After a switch, focus goes back to the statement that had it, or into the editor (4.5): a
    // frame later, after the switch's dialog has handed focus back to where it opened from.
    const refocus = given
      ? requestAnimationFrame(() => {
          if (editor.current === tiles) tiles.focus(given.focus ?? undefined);
        })
      : 0;
    setReady(true);
    return () => {
      cancelAnimationFrame(refocus);
      editor.current = null;
      if (editorRef?.current === tiles) editorRef.current = null;
      handoff?.leave(tiles.unmount());
    };
    // `focus` is for opening only, as in Blocks; `sounds` reads the film's sounds as it's asked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, host]);

  useEffect(() => {
    editor.current?.setPalette(target, tab);
  }, [target, tab, ready]);
  useEffect(() => {
    editor.current?.highlight(highlights.rehearse, 'rehearse');
  }, [highlights.rehearse, ready]);
  useEffect(() => {
    editor.current?.highlight(highlights.error, 'error');
  }, [highlights.error, ready]);
  const links = highlights.link ?? NO_MARKS;
  useEffect(() => {
    editor.current?.highlight(links, 'link');
  }, [links, ready]);
  const built = highlights.prompter ?? NO_MARKS;
  useEffect(() => {
    editor.current?.highlight(built, 'prompter');
  }, [built, ready]);

  return (
    <div className="pr-workspace-frame pr-tiles-frame">
      {!ready && <p className="pr-loading">{words.t('production.loading')}</p>}
      <div ref={box} className="pr-tiles" data-ready={ready || undefined} />
    </div>
  );
}
