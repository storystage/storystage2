/**
 * The script's lines (`docs/spec/07-ux.md` section 6.6; WP10.4): adding, writing, moving, deleting
 * and pinning the lines under a scene heading. Pure functions from one production to the next, each
 * one undo step in the Storyboard.
 *
 * `Production.script` holds every scene's lines; a scene's lines are the ones with its id, in the
 * order they appear there.
 */
import {
  lineId,
  scriptLineText,
  type FrameId,
  type LineId,
  type Production,
  type SceneId,
  type ScriptLine,
} from '@storystage/production';
import { LIMITS } from './edits.ts';
import { sketchName } from './SketchArt.tsx';

const clamp = (text: string, limit: number) => [...text].slice(0, limit).join('');

/** The scene's lines, in order. */
export const sceneLines = (p: Production, scene: SceneId): ScriptLine[] =>
  p.script.filter((l) => l.scene === scene);

/** A line's number in its scene, from 1, as the learner sees it ("line 3"); 0 if it's gone. */
export function lineNumber(p: Production, id: LineId): number {
  const line = p.script.find((l) => l.id === id);
  return line ? sceneLines(p, line.scene).findIndex((l) => l.id === id) + 1 : 0;
}

/** Who says a line: `null` for action, or the character's name, trimmed and within the limit. */
export function speakerOf(who: string): string | null {
  const name = clamp(who.trim().replace(/\s+/g, ' '), LIMITS.speaker);
  return name === '' ? null : name;
}

/** The first of `l1`, `l2`, … that no line uses. */
function freeLineId(p: Production): LineId {
  const taken = new Set(p.script.map((l) => l.id));
  for (let n = 1; ; n++) if (!taken.has(lineId(`l${n}`))) return lineId(`l${n}`);
}

/**
 * Adds a line at the end of the scene. `character` is `null` for action. `null` when the text is
 * empty or the script already holds `LIMITS.lines` lines.
 */
export function addLine(
  p: Production,
  scene: SceneId,
  text: string,
  character: string | null,
): { production: Production; line: LineId } | null {
  // Stored as the script file keeps it, so it reopens exactly (spec 03 section 5).
  const words = clamp(scriptLineText(text), LIMITS.line);
  if (words === '' || p.script.length >= LIMITS.lines) return null;
  const id = freeLineId(p);
  const speaker = character === null ? null : speakerOf(character);
  const line: ScriptLine = {
    id,
    scene,
    kind: speaker === null ? 'action' : 'dialogue',
    character: speaker,
    text: words,
    pinnedFrame: null,
  };
  // After the scene's last line, so the script file keeps each scene's lines together.
  const last = p.script.findLastIndex((l) => l.scene === scene);
  const script = [...p.script];
  script.splice(last === -1 ? script.length : last + 1, 0, line);
  return { production: { ...p, script }, line: id };
}

const updateLine = (p: Production, id: LineId, change: (l: ScriptLine) => ScriptLine) => ({
  ...p,
  script: p.script.map((l) => (l.id === id ? change(l) : l)),
});

/**
 * Rewrites a line, within the limit, exactly as typed (trimming while typing would swallow the
 * space just typed). An emptied line stays, empty, until it's deleted.
 */
export const setLineText = (p: Production, id: LineId, text: string): Production =>
  updateLine(p, id, (l) => ({ ...l, text: clamp(text, LIMITS.line) }));

/**
 * The line tidied as the script file keeps it (`scriptLineText`: no blank lines, no spaces at the
 * ends), for when the learner leaves it; the same production if it is tidy already.
 */
export function tidyLine(p: Production, id: LineId): Production {
  const line = p.script.find((l) => l.id === id);
  if (!line) return p;
  const text = clamp(scriptLineText(line.text), LIMITS.line);
  return text === line.text ? p : updateLine(p, id, (l) => ({ ...l, text }));
}

/** Makes a line action (`null`) or dialogue said by `character`. */
export const setSpeaker = (p: Production, id: LineId, character: string | null): Production => {
  const speaker = character === null ? null : speakerOf(character);
  return updateLine(p, id, (l) => ({
    ...l,
    kind: speaker === null ? 'action' : 'dialogue',
    character: speaker,
  }));
};

export const deleteLine = (p: Production, id: LineId): Production => ({
  ...p,
  script: p.script.filter((l) => l.id !== id),
});

/** Moves a line to place `to` (from 0) among its scene's lines. */
export function moveLine(p: Production, id: LineId, to: number): Production {
  const line = p.script.find((l) => l.id === id);
  if (!line) return p;
  const rest = sceneLines(p, line.scene).filter((l) => l.id !== id);
  if (!Number.isInteger(to) || to < 0 || to > rest.length) return p;
  rest.splice(to, 0, line);
  // The scene's lines take the places its lines had, in their new order.
  const queue = [...rest];
  return { ...p, script: p.script.map((l) => (l.scene === line.scene ? queue.shift()! : l)) };
}

/** Pins a line to one of its scene's frames, or unpins it (`null`). */
export function pinLine(p: Production, id: LineId, frame: FrameId | null): Production {
  const line = p.script.find((l) => l.id === id);
  if (!line) return p;
  if (frame !== null && !p.frames.some((f) => f.id === frame && f.scene === line.scene)) return p;
  return updateLine(p, id, (l) => ({ ...l, pinnedFrame: frame }));
}

/** The lines pinned to a frame, in script order. */
export const pinnedLines = (p: Production, frame: FrameId): ScriptLine[] =>
  p.script.filter((l) => l.pinnedFrame === frame);

/**
 * Who can say a line in this scene: its cast, then every other name already speaking in the
 * script, each once, ignoring case.
 */
export function speakers(p: Production, scene: SceneId): string[] {
  const card = p.storyboard.cards.find((c) => c.id === scene);
  const names = [
    ...(card?.cast ?? []).map(sketchName),
    ...p.script.flatMap((l) => (l.character ? [l.character] : [])),
  ];
  const seen = new Set<string>();
  return names.filter((n) => {
    const key = n.toLocaleLowerCase('en-GB');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
