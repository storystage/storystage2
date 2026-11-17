/**
 * The Blocks editor for one method, with the cascade that asks for a dropped block's values
 * (`14-editors.md` sections 2.3 and 3i.6). Loaded on demand by the Code editor, so Blockly and the
 * menus stay out of the Storyboard's bundle. The menus are Tiles' own (`@storystage/tiles/cascade`):
 * one cascade for both editors.
 */
import type { Expression, NodeId, Program } from '@storystage/ast';
import {
  createBlocksEditor,
  type AskRequest,
  type BlocksEditor,
  type VariableType,
} from '@storystage/blocks';
import type { EditorHost, HighlightMark } from '@storystage/editor-contract';
import type { Ask as AskKind, PaletteTab } from '@storystage/story-api/editing';
import type { NameInScope } from '@storystage/story-api/editing';
import {
  AskValue,
  ChooseVariable,
  DetailMenu,
  NewVariable,
  ValueMenu,
} from '@storystage/tiles/cascade';
import { useThemeStyle } from '@storystage/ui';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { words } from '../strings.ts';
import type { Handoff } from './handoff.ts';

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
  /** Where the learner was in Tiles, after a switch (`14-editors.md` section 4.2). */
  handoff?: Handoff;
}

/** What Rehearse highlights in the editor (`07-ux.md` section 7.4), and the frame's links. */
export interface Highlights {
  readonly rehearse: readonly HighlightMark[];
  readonly error: readonly HighlightMark[];
  /** The blocks the current frame links to (WP10.8). */
  readonly link?: readonly HighlightMark[];
  /** The blocks the Prompter's request added, as they land (spec 04 section 6.1). */
  readonly prompter?: readonly HighlightMark[];
}

const NO_MARKS: readonly HighlightMark[] = [];
const NO_HIGHLIGHTS: Highlights = { rehearse: NO_MARKS, error: NO_MARKS };

/** A question the editor is waiting on, and how to answer it. */
interface Question {
  readonly request: AskRequest & { readonly anchor: Element };
  /** Set when the learner chose "Other number…" or "Other words…". */
  readonly typing?: AskKind;
  readonly answer: (value: Expression | null) => void;
}

/** "add detail ▾" asking which detail (14-editors 2.3), and how to answer it. */
interface DetailQuestion {
  readonly program: Program;
  readonly node: NodeId;
  readonly anchor: Element;
  readonly answer: (detail: string | null) => void;
}

/** The variable or set block's question as it's dropped (14-editors 2.3), and its answer. */
type VariableQuestion =
  | {
      readonly kind: 'variable';
      readonly taken: readonly string[];
      readonly anchor: Element;
      readonly answer: (made: { name: string; type: VariableType } | null) => void;
    }
  | {
      readonly kind: 'assign';
      readonly names: readonly NameInScope[];
      readonly anchor: Element;
      readonly answer: (variable: NodeId | null) => void;
    };

export default function BlocksPanel({
  method,
  host,
  target,
  tab,
  focus = null,
  highlights = NO_HIGHLIGHTS,
  editorRef,
  handoff,
}: BlocksPanelProps) {
  const box = useRef<HTMLDivElement>(null);
  const editor = useRef<BlocksEditor | null>(null);
  // The text size scales the blocks too; a new size draws the method again at that size.
  const scale = Number(useThemeStyle()['--ss-text-size' as keyof CSSProperties] ?? 1) || 1;
  // How many times the editor has been made: a new one (another method, a new text size) starts
  // on the scene's actions with nothing highlighted, so the effects below give it the palette and
  // the highlights again each time.
  const [mounts, setMounts] = useState(0);
  const ready = mounts > 0;
  const [question, setQuestion] = useState<Question | null>(null);
  const [detail, setDetail] = useState<DetailQuestion | null>(null);
  const [variable, setVariable] = useState<VariableQuestion | null>(null);
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
      // "add detail ▾" opens Tiles' detail menu at the block; Escape adds nothing.
      chooseDetail: (request) =>
        new Promise((resolve) => {
          setDetail({
            ...request,
            answer: (name) => {
              setDetail(null);
              resolve(name);
            },
          });
        }),
      // The variable and set blocks ask Tiles' questions as they're dropped; Escape adds nothing.
      newVariable: ({ taken, anchor }) =>
        new Promise((resolve) => {
          if (!anchor) return resolve(null);
          setVariable({
            kind: 'variable',
            taken,
            anchor,
            answer: (made) => {
              setVariable(null);
              resolve(made);
            },
          });
        }),
      chooseVariable: ({ names, anchor }) =>
        new Promise((resolve) => {
          if (!anchor) return resolve(null);
          setVariable({
            kind: 'assign',
            names,
            anchor,
            answer: (id) => {
              setVariable(null);
              resolve(id);
            },
          });
        }),
    });
    const given = handoff?.take();
    blocks.mount(
      box.current,
      host,
      given ? { ...given, method } : { method, selection: focus ? [focus] : [], focus },
    );
    editor.current = blocks;
    if (editorRef) editorRef.current = blocks;
    // After a switch, focus goes back to the statement that had it, or into the editor (4.5): a
    // frame later, after the switch's dialog has handed focus back to where it opened from.
    const refocus = given
      ? requestAnimationFrame(() => {
          if (editor.current === blocks) blocks.focus(given.focus ?? undefined);
        })
      : 0;
    setMounts((n) => n + 1);
    return () => {
      cancelAnimationFrame(refocus);
      editor.current = null;
      if (editorRef?.current === blocks) editorRef.current = null;
      handoff?.leave(blocks.unmount());
    };
    // `focus` is for opening only: the Code editor opens afresh for each block it's asked to show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, host, scale]);

  useEffect(() => {
    editor.current?.setPalette(target, tab);
  }, [target, tab, mounts]);

  useEffect(() => {
    editor.current?.highlight(highlights.rehearse, 'rehearse');
  }, [highlights.rehearse, mounts]);
  useEffect(() => {
    editor.current?.highlight(highlights.error, 'error');
  }, [highlights.error, mounts]);
  const links = highlights.link ?? NO_MARKS;
  useEffect(() => {
    editor.current?.highlight(links, 'link');
  }, [links, mounts]);
  const built = highlights.prompter ?? NO_MARKS;
  useEffect(() => {
    editor.current?.highlight(built, 'prompter');
  }, [built, mounts]);

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
      {detail && (
        <DetailMenu
          program={detail.program}
          node={detail.node}
          anchor={detail.anchor}
          onChoose={(name) => detail.answer(name)}
          onClose={() => detail.answer(null)}
        />
      )}
      {variable?.kind === 'variable' && (
        <NewVariable
          anchor={variable.anchor}
          taken={variable.taken}
          onMake={(name, type) => variable.answer({ name, type })}
          onClose={() => variable.answer(null)}
        />
      )}
      {variable?.kind === 'assign' && (
        <ChooseVariable
          anchor={variable.anchor}
          names={variable.names}
          onChoose={(id) => variable.answer(id)}
          onClose={() => variable.answer(null)}
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
