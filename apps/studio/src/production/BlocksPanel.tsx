/**
 * The Blocks editor for one method, with the cascade that asks for a dropped block's values
 * (`14-editors.md` sections 2.3 and 3i.6). Loaded on demand by the Code editor, so Blockly and the
 * menus stay out of the Storyboard's bundle. The menus are Tiles' own (`@storystage/tiles/cascade`):
 * one cascade for both editors.
 */
import type { Expression, NodeId } from '@storystage/ast';
import { createBlocksEditor, type AskRequest, type BlocksEditor } from '@storystage/blocks';
import type { EditorHost } from '@storystage/editor-contract';
import type { Ask as AskKind, PaletteTab } from '@storystage/story-api/editing';
import { AskValue, ValueMenu } from '@storystage/tiles/cascade';
import { useEffect, useRef, useState } from 'react';
import { words } from '../strings.ts';

export interface BlocksPanelProps {
  method: NodeId;
  host: EditorHost;
  /** The object the palette offers blocks for, and its tab. */
  target: Expression;
  tab: PaletteTab;
}

/** A question the editor is waiting on, and how to answer it. */
interface Question {
  readonly request: AskRequest & { readonly anchor: Element };
  /** Set when the learner chose "Other number…" or "Other words…". */
  readonly typing?: AskKind;
  readonly answer: (value: Expression | null) => void;
}

export default function BlocksPanel({ method, host, target, tab }: BlocksPanelProps) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<BlocksEditor | null>(null);
  const [ready, setReady] = useState(false);
  const [question, setQuestion] = useState<Question | null>(null);
  // Choosing "Other words…" closes the menu on its way to the typing field: not an Escape.
  const toTyping = useRef(false);

  useEffect(() => {
    if (!box.current) return;
    const blocks = createBlocksEditor({
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
    blocks.mount(box.current, host, { method, selection: [], focus: null });
    editor.current = blocks;
    setReady(true);
    return () => {
      editor.current = null;
      blocks.unmount();
    };
  }, [method, host]);

  useEffect(() => {
    editor.current?.setPalette(target, tab);
  }, [target, tab, ready]);

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
