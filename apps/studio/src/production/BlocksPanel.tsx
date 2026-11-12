/**
 * The Blocks editor for one method, with the cascade that asks for a dropped block's values
 * (`14-editors.md` sections 2.3 and 3i.6). Loaded on demand by the Code editor, so Blockly and the
 * menus stay out of the Storyboard's bundle. The menus are Tiles' own (`@storystage/tiles/cascade`):
 * one cascade for both editors.
 */
import type { Expression, NodeId } from '@storystage/ast';
import { createBlocksEditor, type AskRequest, type BlocksEditor } from '@storystage/blocks';
import type { EditorHost, HighlightMark } from '@storystage/editor-contract';
import type { Ask as AskKind, PaletteTab } from '@storystage/story-api/editing';
import { AskValue, ValueMenu } from '@storystage/tiles/cascade';
import { useThemeStyle } from '@storystage/ui';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { words } from '../strings.ts';

export interface BlocksPanelProps {
  method: NodeId;
  host: EditorHost;
  /** The object the palette offers blocks for, and its tab. */
  target: Expression;
  tab: PaletteTab;
  /** A block to put keyboard focus on as the editor opens: the one Screening's Fix pointed at. */
  focus?: NodeId | null;
  /** Rehearse's marks: the blocks running, and the error a run stopped at with its words. */
  highlights?: Highlights;
  /** Where the Code editor finds the editor showing, for the block chosen in it. */
  editorRef?: { current: { selection(): readonly NodeId[] } | null };
}

/** What Rehearse highlights in the editor (`07-ux.md` section 7.4). */
export interface Highlights {
  readonly rehearse: readonly HighlightMark[];
  readonly error: readonly HighlightMark[];
}

const NO_HIGHLIGHTS: Highlights = { rehearse: [], error: [] };

/** A question the editor is waiting on, and how to answer it. */
interface Question {
  readonly request: AskRequest & { readonly anchor: Element };
  /** Set when the learner chose "Other number…" or "Other words…". */
  readonly typing?: AskKind;
  readonly answer: (value: Expression | null) => void;
}

export default function BlocksPanel({
  method,
  host,
  target,
  tab,
  focus = null,
  highlights = NO_HIGHLIGHTS,
  editorRef,
}: BlocksPanelProps) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<BlocksEditor | null>(null);
  // The text size scales the blocks too; a new size draws the method again at that size.
  const scale = Number(useThemeStyle()['--ss-text-size' as keyof CSSProperties] ?? 1) || 1;
  const [ready, setReady] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  // Choosing "Other words…" closes the menu on its way to the typing field: not an Escape.
  const toTyping = useRef(false);

  useEffect(() => {
    if (!box.current) return;
    const blocks = createBlocksEditor({
      scale,
      // Each question opens Tiles' menu at the dropped block; Escape cancels the drop.
      ask: (request) =>
        new Promise((resolve) => {
          const anchor = request.anchor;
          if (!anchor) return resolve(null);
          setQuestion({
            request: { ...request, anchor },
            answer: (value) => {
              setQuestion(null);
              resolve(value);
            },
          });
        }),
    });
    blocks.mount(box.current, host, { method, selection: focus ? [focus] : [], focus });
    editor.current = blocks;
    if (editorRef) editorRef.current = blocks;
    setReady(true);
    return () => {
      editor.current = null;
      if (editorRef?.current === blocks) editorRef.current = null;
      blocks.unmount();
    };
    // `focus` is for opening only: the Code editor opens afresh for each block it's asked to show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, host, scale]);

  useEffect(() => {
    editor.current?.setPalette(target, tab);
  }, [target, tab, ready]);

  useEffect(() => {
    editor.current?.highlight(highlights.rehearse, 'rehearse');
  }, [highlights.rehearse, ready]);
  useEffect(() => {
    editor.current?.highlight(highlights.error, 'error');
  }, [highlights.error, ready]);

  return (
    <div className="pr-workspace-frame">
      {!ready && <p className="pr-loading">{words.t('production.loading')}</p>}
      <div ref={box} className="pr-workspace" data-ready={ready || undefined} />
      {question && !question.typing && (
        <ValueMenu
          program={question.request.program}
          place={question.request.place}
          label={question.request.label}
          anchor={question.request.anchor}
          onChoose={(value) => question.answer(value)}
          onAsk={(typing) => {
            toTyping.current = true;
            setQuestion({ ...question, typing });
          }}
          onClose={() => {
            if (toTyping.current) toTyping.current = false;
            else question.answer(null);
          }}
        />
      )}
      {question?.typing && (
        <AskValue
          program={question.request.program}
          place={question.request.place}
          ask={question.typing}
          label={question.request.label}
          anchor={question.request.anchor}
          onAnswer={(value) => question.answer(value)}
          onClose={() => question.answer(null)}
        />
      )}
    </div>
  );
}
