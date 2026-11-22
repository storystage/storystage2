/**
 * The read-only text view beside the code (07-ux §7.3 "Show as text", WP7.2 and 7.6): one row per
 * line, marked where Rehearse is running, where an error is, or where the Prompter points.
 * The Code editor's bar owns "Show as text" and the wording; this takes them as props.
 */
import type { NodeId, Program } from '@storystage/ast';
import type { HighlightKind, HighlightMark } from '@storystage/editor-contract';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { describer, isSceneScriptIn, methodTitleIn } from '@storystage/story-api/editing';
import { linesOf, textOf, type TextStyle } from './text.ts';
import { t } from './words.ts';
import './text-view.css';

/** The marks to show, by kind, as the editors take them through `highlight` in the contract. */
export type TextMarks = Partial<Record<HighlightKind, readonly HighlightMark[]>>;

/** The order kinds are drawn in, and which one the view scrolls to first. */
const KINDS: readonly HighlightKind[] = ['rehearse', 'error', 'prompter', 'link'];

export interface TextViewProps {
  readonly program: Program;
  readonly style: TextStyle;
  /** Just this method or listener; the whole program if left out. */
  readonly method?: NodeId;
  readonly highlight?: TextMarks;
  /** The region's name; "Text of <method>" if left out. */
  readonly label?: string;
}

interface LineMarks {
  readonly kinds: Set<HighlightKind>;
  readonly messages: string[];
}

export function TextView(props: TextViewProps) {
  const { program, style, method, highlight } = props;
  const text = useMemo(() => textOf(program, { style, method }), [program, style, method]);

  const marks = useMemo(() => {
    const byLine = new Map<number, LineMarks>();
    let first: number | null = null;
    for (const kind of KINDS) {
      for (const mark of highlight?.[kind] ?? []) {
        const lines = linesOf(text, mark.node);
        lines.forEach((line, i) => {
          const at = byLine.get(line) ?? { kinds: new Set(), messages: [] };
          at.kinds.add(kind);
          if (i === 0 && mark.message) at.messages.push(mark.message);
          byLine.set(line, at);
        });
        if (first === null && lines.length > 0) first = lines[0]!;
      }
    }
    return { byLine, first };
  }, [text, highlight]);

  // Keeps the first mark in sight (the running line during Rehearse), when it moves.
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (marks.first === null) return;
    const row = root.current?.querySelector(`[data-line="${marks.first}"]`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [marks.first]);

  const label =
    props.label ?? (method ? t('method', { name: methodName(program, method) }) : t('program'));

  return (
    <div
      ref={root}
      role="region"
      aria-label={label}
      className="tv"
      data-style={style}
      // Scrolls, so it takes focus: the keyboard can scroll it too.
      tabIndex={0}
    >
      {text.lines.length === 0 ? (
        <p className="tv-empty">{t('empty')}</p>
      ) : (
        <pre className="tv-text" lang="en">
          {text.lines.map((line, i) => {
            const at = marks.byLine.get(i);
            const kinds = at ? KINDS.filter((k) => at.kinds.has(k)) : [];
            return (
              <code
                key={i}
                className={['tv-line', ...kinds.map((k) => `tv-hl-${k}`)].join(' ')}
                data-line={i}
                data-node={line.node ?? undefined}
              >
                {line.text === '' ? ' ' : style === 'python' ? withNotes(line.text) : line.text}
                {at?.messages.map((m, j) => (
                  <span key={j} className="tv-message">
                    {m}
                  </span>
                ))}
              </code>
            );
          })}
        </pre>
      )}
    </div>
  );
}

/**
 * StoryStage's own words in the Python-like text, which Python hasn't got (16.8, the pathway's
 * first rung): each carries a note, so the view doesn't teach syntax that doesn't exist.
 */
const NOT_PYTHON = /^(\s*(?:# off: )?)(do_in_order|do_together|each_together|when)(?=[ :])/;

function withNotes(line: string): ReactNode {
  const found = NOT_PYTHON.exec(line);
  if (!found) return line;
  const [all, before, word] = found as unknown as [string, string, string];
  return (
    <>
      {before}
      <span className="tv-not-python" title={t(`notPython.${word}`)}>
        {word}
      </span>
      {line.slice(all.length)}
    </>
  );
}

/** A method's name as the editors give it: a scene's script method is "When the scene starts". */
function methodName(program: Program, method: NodeId): string {
  for (const type of program.types) {
    const found = type.methods.find((m) => m.id === method);
    if (found) return isSceneScriptIn(type, found) ? methodTitleIn(type, found) : found.name;
    const listener = type.listeners.find((l) => l.id === method);
    if (listener) return describer(program)(listener);
  }
  return '';
}
