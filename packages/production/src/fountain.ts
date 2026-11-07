/**
 * `script.fountain`: the script as plain Fountain (WP10.4; `docs/spec/03-production-format.md`,
 * section 5). Ids travel in notes at the end of a line, `[[scene:s1]]` and `[[line:l1 frame:f1]]`,
 * which other Fountain tools ignore.
 *
 * Text that another tool could read as something else (a line in capitals, or one starting with a
 * full stop) is written as Fountain's forced action (`!`) or forced character (`@`), so every line
 * reads back as it was written. Reading also takes scripts written elsewhere, within the limits in
 * `FOUNTAIN_LIMITS`, and is pure: no file access, nothing outside the text.
 */
import {
  SAFE_ID,
  frameId,
  lineId,
  sceneId,
  type FrameId,
  type LineId,
  type Production,
  type SceneId,
  type ScriptLine,
} from './types.ts';

/** What a script may hold before it is refused (spec section 5; `07-ux.md` section 6.9). */
export const FOUNTAIN_LIMITS = {
  /** The whole file, in bytes of UTF-8. */
  bytes: 512 * 1024,
  scenes: 50,
  /** Action and dialogue lines in the whole script. */
  lines: 2000,
  /** One line's text, in characters. */
  lineLength: 500,
  headingLength: 80,
  /** A speaker's name, in characters. */
  nameLength: 40,
} as const;

export type FountainProblem =
  | { readonly code: 'tooBig'; readonly limit: number }
  | { readonly code: 'tooManyScenes'; readonly limit: number }
  | { readonly code: 'tooManyLines'; readonly limit: number }
  | { readonly code: 'lineTooLong'; readonly limit: number }
  | { readonly code: 'headingTooLong'; readonly limit: number }
  | { readonly code: 'nameTooLong'; readonly limit: number };

/** A script as read: its scenes in order, with their headings, and its lines. */
export interface FountainScript {
  readonly scenes: readonly { readonly id: SceneId; readonly heading: string }[];
  /** Pins are as written; the caller drops pins to frames its production doesn't have. */
  readonly lines: readonly ScriptLine[];
}

export type ReadFountainResult =
  | { readonly ok: true; readonly script: FountainScript }
  | { readonly ok: false; readonly problem: FountainProblem };

/** New ids for scenes and lines that arrive without a usable one. */
export interface FountainIds {
  scene(): SceneId;
  line(): LineId;
}

// ---- Writing ---------------------------------------------------------------------------------

/** The production's script as Fountain text: the same production always gives the same text. */
export function writeFountain(p: Production): string {
  const out: string[] = [
    `Title: ${oneLine(p.manifest.title)}`,
    `Logline: ${oneLine(p.storyboard.logline)}`,
    'Synopsis:',
    ...paragraph(p.storyboard.synopsis)
      .split('\n')
      .filter(Boolean)
      .map((l) => `    ${l}`),
    '',
  ];
  const headings = new Map(p.storyboard.cards.map((c) => [c.id, c.heading]));
  for (const { scene } of p.manifest.runningOrder) {
    const heading = oneLine(headings.get(scene) ?? '');
    const dot = heading.startsWith('.') || heading === '' ? '. ' : '.';
    out.push(`${dot}${heading}`.trimEnd() + ` [[scene:${scene}]]`, '');
    for (const line of p.script.filter((l) => l.scene === scene)) {
      const note = `[[line:${line.id}${line.pinnedFrame ? ` frame:${line.pinnedFrame}` : ''}]]`;
      const text = paragraph(line.text);
      if (line.kind === 'dialogue') {
        const name = oneLine(line.character ?? '').toUpperCase();
        out.push(nameMightBeMisread(name) ? `@${name}` : name);
        out.push(`${text} ${note}`, '');
      } else {
        out.push(`${actionMightBeMisread(text) ? '!' : ''}${text} ${note}`, '');
      }
    }
  }
  return out.join('\n');
}

const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, ' ').trim();

/** Line breaks kept, blank lines dropped: a blank line would end the element in Fountain. */
const paragraph = (text: string) =>
  text
    .split(/\r\n?|\n/)
    .filter((l) => l.trim() !== '')
    .join('\n');

const HEADING = /^(int|ext|est|int\.?\/ext|i\/e)[.\s]/i;
const hasLetter = (s: string) => /\p{L}/u.test(s);
const isCapitals = (s: string) => hasLetter(s) && s === s.toUpperCase();
const isTransition = (s: string) => isCapitals(s) && s.trimEnd().endsWith('TO:');

/** Would this action's first line read back as something other than action? */
function actionMightBeMisread(text: string): boolean {
  const first = text.split('\n')[0]!.trimStart();
  return (
    /^[.!@#=~>]/.test(first) ||
    first.startsWith('[[') ||
    first.startsWith('/*') ||
    HEADING.test(first) ||
    isCapitals(first)
  );
}

/** Would this speaker's name, in capitals, read back as something other than a speaker? */
const nameMightBeMisread = (name: string) =>
  !hasLetter(name) ||
  HEADING.test(name) ||
  isTransition(name) ||
  /^[.!@#=~>]/.test(name) ||
  name.startsWith('[[') ||
  name.startsWith('/*') ||
  name.endsWith('^');

// ---- Reading ---------------------------------------------------------------------------------

/** An id note at the very end of a line: `[[scene:s1]]` or `[[line:l1 frame:f1]]`. */
const ID_NOTE = /\s*\[\[(scene|line):([^\s\]]*)(?:\s+frame:([^\s\]]*))?\]\]\s*$/;

interface Note {
  readonly kind: 'scene' | 'line';
  readonly id: string;
  readonly frame: string | null;
}

/** Splits an id note off the end of a line. */
function takeNote(line: string): { text: string; note: Note | null } {
  const m = ID_NOTE.exec(line);
  if (!m) return { text: line, note: null };
  return {
    text: line.slice(0, m.index),
    note: { kind: m[1] as Note['kind'], id: m[2]!, frame: m[3] ?? null },
  };
}

/**
 * Reads a script: one written by `writeFountain`, which gives back the same scenes and lines, or
 * one from another Fountain tool, whose scenes and lines get new ids from `ids`. The title page
 * is skipped (`manifest.json` and `storyboard.json` hold the title, logline and synopsis).
 * Sections, synopses, transitions, the boneyard and page breaks are left out.
 */
export function readFountain(text: string, ids: FountainIds): ReadFountainResult {
  if (new TextEncoder().encode(text).length > FOUNTAIN_LIMITS.bytes)
    return { ok: false, problem: { code: 'tooBig', limit: FOUNTAIN_LIMITS.bytes } };

  const scenes: { id: SceneId; heading: string }[] = [];
  const lines: ScriptLine[] = [];
  const usedScenes = new Set<string>();
  const usedLines = new Set<string>();
  let problem: FountainProblem | null = null;
  const fail = (code: FountainProblem['code'], limit: number) => {
    problem ??= { code, limit } as FountainProblem;
  };

  const newScene = (heading: string, note: Note | null) => {
    if (heading.length > FOUNTAIN_LIMITS.headingLength)
      fail('headingTooLong', FOUNTAIN_LIMITS.headingLength);
    const wanted = note?.kind === 'scene' ? note.id : null;
    const id =
      wanted !== null && SAFE_ID.test(wanted) && !usedScenes.has(wanted)
        ? sceneId(wanted)
        : ids.scene();
    usedScenes.add(id);
    scenes.push({ id, heading });
    if (scenes.length > FOUNTAIN_LIMITS.scenes) fail('tooManyScenes', FOUNTAIN_LIMITS.scenes);
  };

  const addLine = (
    kind: ScriptLine['kind'],
    character: string | null,
    body: string,
    note: Note | null,
  ) => {
    if (scenes.length === 0) newScene('', null);
    if (body.length > FOUNTAIN_LIMITS.lineLength) fail('lineTooLong', FOUNTAIN_LIMITS.lineLength);
    if (character !== null && character.length > FOUNTAIN_LIMITS.nameLength)
      fail('nameTooLong', FOUNTAIN_LIMITS.nameLength);
    const wanted = note?.kind === 'line' ? note.id : null;
    const id =
      wanted !== null && SAFE_ID.test(wanted) && !usedLines.has(wanted)
        ? lineId(wanted)
        : ids.line();
    usedLines.add(id);
    const frame = note?.kind === 'line' && note.frame !== null && SAFE_ID.test(note.frame);
    lines.push({
      id,
      scene: scenes[scenes.length - 1]!.id,
      kind,
      character,
      text: body,
      pinnedFrame: frame ? frameId(note!.frame!) : (null as FrameId | null),
    });
    if (lines.length > FOUNTAIN_LIMITS.lines) fail('tooManyLines', FOUNTAIN_LIMITS.lines);
  };

  for (const block of paragraphs(withoutBoneyard(withoutTitlePage(text)))) {
    if (problem) break;
    const first = block[0]!.trimStart();
    const last = takeNote(block[block.length - 1]!);
    const body = [...block.slice(0, -1), last.text].join('\n');

    if (first.startsWith('!')) {
      addLine('action', null, body.trimStart().slice(1).trimEnd(), last.note);
    } else if (first.startsWith('@') && block.length > 1) {
      const name = speaker(first.slice(1));
      addLine('dialogue', name, [...block.slice(1, -1), last.text].join('\n').trimEnd(), last.note);
    } else if (/^\.(?!\.)/.test(first) || HEADING.test(first)) {
      const headingLine = block.length === 1 ? last : takeNote(block[0]!);
      const heading = headingLine.text.trimStart();
      newScene((heading.startsWith('.') ? heading.slice(1) : heading).trim(), headingLine.note);
      if (block.length > 1)
        addLine('action', null, [...block.slice(1, -1), last.text].join('\n').trimEnd(), last.note);
    } else if (/^#/.test(first) || /^=(?!==)/.test(first) || /^={3,}\s*$/.test(first)) {
      continue; // a section, a synopsis or a page break
    } else if (block.length === 1 && (isTransition(first) || /^>(?!.*<\s*$)/.test(first))) {
      continue; // a transition
    } else if (block.length > 1 && isCapitals(takeNote(first).text) && !first.startsWith('>')) {
      addLine(
        'dialogue',
        speaker(first),
        [...block.slice(1, -1), last.text].join('\n').trimEnd(),
        last.note,
      );
    } else {
      const text = body
        .split('\n')
        .map((l) => {
          const t = l.trim();
          const centred = /^>(.*)<$/.exec(t);
          if (centred) return centred[1]!.trim();
          if (t.startsWith('~')) return t.slice(1).trim();
          return l;
        })
        .join('\n')
        .trimEnd();
      if (text.trim() !== '') addLine('action', null, text, last.note);
    }
  }

  return problem ? { ok: false, problem } : { ok: true, script: { scenes, lines } };
}

/** A speaker's name, without dual dialogue's caret. */
const speaker = (line: string) => line.replace(/\s*\^\s*$/, '').trim();

/** The title page is `Key: value` lines at the very start, up to the first blank line. */
function withoutTitlePage(text: string): string[] {
  const all = text.replace(/^\uFEFF/, '').split(/\r\n?|\n/);
  if (!/^[A-Za-z][A-Za-z ]*:/.test(all[0] ?? '')) return all;
  const end = all.findIndex((l) => l.trim() === '');
  return end === -1 ? [] : all.slice(end + 1);
}

/** Drops `/* … *\/` comments that begin a line. A forced line (`!`) never starts one. */
function withoutBoneyard(lines: string[]): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of lines) {
    if (!inside && line.trimStart().startsWith('/*')) inside = true;
    if (inside) {
      const end = line.indexOf('*/');
      if (end === -1) continue;
      inside = false;
      const rest = line.slice(end + 2);
      if (rest.trim() !== '') out.push(rest);
      continue;
    }
    out.push(line);
  }
  return out;
}

/** Blocks of lines between blank lines. */
function paragraphs(lines: string[]): string[][] {
  const out: string[][] = [];
  let block: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (block.length) out.push(block);
      block = [];
    } else block.push(line);
  }
  if (block.length) out.push(block);
  return out;
}
