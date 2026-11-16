/**
 * The program's text in either wording, for the whole program or one method, split into lines
 * that each know their block, so Rehearse, errors and the Prompter can mark lines (WP2.5, WP7.6).
 */
import { programText, type NodeId, type Program, type TextSpan } from '@storystage/ast';
import { javaText } from './java.ts';

/** Alice's two formatters: Python-like (`self.cat.say(text="Hello")`) or Java-like. */
export type TextStyle = 'python' | 'java';
export const TEXT_STYLES: readonly TextStyle[] = ['python', 'java'];

export interface TextLine {
  readonly text: string;
  /** Where the line starts in the whole text. */
  readonly start: number;
  /**
   * The innermost block, method, field, class or listener this line belongs to: the statement
   * that starts on it, or the one whose closing line it is. `null` for a blank line.
   */
  readonly node: NodeId | null;
}

export interface Text {
  /** Lines end with a new line, as `programText` writes them. */
  readonly text: string;
  /** Every node, outermost first, as `programText` gives them. */
  readonly spans: readonly TextSpan[];
  readonly lines: readonly TextLine[];
}

export interface TextOptions {
  readonly style: TextStyle;
  /** Just this method (or listener), taken out of its class, with no indent. */
  readonly method?: NodeId;
}

const EMPTY: Text = { text: '', spans: [], lines: [] };

/** The program as text in `style`, or one method of it. Empty if `method` isn't in it. */
export function textOf(program: Program, options: TextOptions): Text {
  const whole = options.style === 'java' ? javaText(program) : programText(program);
  if (options.method === undefined) return withLines(whole.text, whole.spans);
  const cut = cutOut(whole.text, whole.spans, options.method);
  return cut ? withLines(cut.text, cut.spans) : EMPTY;
}

/** One method's text, out of its class: its lines moved left by its indent, and spans to match. */
function cutOut(
  text: string,
  spans: readonly TextSpan[],
  method: NodeId,
): { text: string; spans: TextSpan[] } | null {
  const own = spans.find((s) => s.node === method);
  if (!own) return null;
  const from = text.lastIndexOf('\n', own.start - 1) + 1;
  const indent = own.start - from;
  const old = text.slice(from, own.end).split('\n');
  // Each old line's start, and the new one's, to move positions across.
  const moved: { old: number; removed: number; new: number }[] = [];
  let at = from;
  let now = 0;
  const lines = old.map((line) => {
    const removed = Math.min(indent, line.length - line.trimStart().length);
    moved.push({ old: at, removed, new: now });
    at += line.length + 1;
    now += line.length - removed + 1;
    return line.slice(removed);
  });
  const move = (pos: number): number => {
    let i = moved.length - 1;
    while (i > 0 && moved[i]!.old > pos) i--;
    const line = moved[i]!;
    return line.new + Math.max(0, pos - line.old - line.removed);
  };
  return {
    text: `${lines.join('\n')}\n`,
    spans: spans
      .filter((s) => s.start >= own.start && s.end <= own.end)
      .map((s) => ({ node: s.node, start: move(s.start), end: move(s.end) })),
  };
}

function withLines(text: string, spans: readonly TextSpan[]): Text {
  const raw = text === '' ? [] : (text.endsWith('\n') ? text.slice(0, -1) : text).split('\n');
  const starts: number[] = [];
  let at = 0;
  for (const line of raw) {
    starts.push(at);
    at += line.length + 1;
  }
  // A line's own node is the outermost one starting where its text starts (a call's statement,
  // not the `self` it begins with). Those are the nodes lines can belong to.
  const firstAt = new Map<number, number>();
  spans.forEach((s, i) => {
    if (!firstAt.has(s.start)) firstAt.set(s.start, i);
  });
  const lineLevel: TextSpan[] = [];
  raw.forEach((line, i) => {
    const content = starts[i]! + (line.length - line.trimStart().length);
    const first = line.trim() === '' ? undefined : firstAt.get(content);
    if (first !== undefined) lineLevel.push(spans[first]!);
  });
  const lines = raw.map((line, i): TextLine => {
    const start = starts[i]!;
    if (line.trim() === '') return { text: line, start, node: null };
    const content = start + (line.length - line.trimStart().length);
    let node: NodeId | null = null;
    // Outermost first, so the last that holds the line is the innermost.
    for (const s of lineLevel) if (s.start <= content && content < s.end) node = s.node;
    return { text: line, start, node };
  });
  return { text, spans, lines };
}

/** The lines `node`'s text runs over, by index; empty if it isn't in the text. */
export function linesOf(text: Text, node: NodeId): readonly number[] {
  const span = text.spans.find((s) => s.node === node);
  if (!span) return [];
  const out: number[] = [];
  text.lines.forEach((line, i) => {
    const end = line.start + line.text.length;
    if (line.start < span.end && end > span.start) out.push(i);
    else if (span.start === span.end && line.start <= span.start && span.start <= end) out.push(i);
  });
  return out;
}
