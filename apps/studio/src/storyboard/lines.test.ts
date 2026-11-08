import { exampleProduction, frameId, lineId, sceneId } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { LIMITS } from './edits.ts';
import {
  addLine,
  deleteLine,
  lineNumber,
  moveLine,
  pinLine,
  pinnedLines,
  sceneLines,
  setLineText,
  setSpeaker,
  speakers,
} from './lines.ts';

const s1 = sceneId('s1');
const s2 = sceneId('s2');
const texts = (p: ReturnType<typeof exampleProduction>, scene = s1) =>
  sceneLines(p, scene).map((l) => l.text);

describe('script lines (10.4)', () => {
  it('adds action and dialogue at the end of the scene, keeping scenes together', () => {
    const p = exampleProduction();
    const before = sceneLines(p, s1).length;
    const action = addLine(p, s1, '  The ice cracks.  ', null)!;
    const said = addLine(action.production, s1, 'Help!', '  Pip  ')!;
    const lines = sceneLines(said.production, s1);
    expect(lines).toHaveLength(before + 2);
    expect(lines.at(-2)).toMatchObject({
      kind: 'action',
      character: null,
      text: 'The ice cracks.',
    });
    expect(lines.at(-1)).toMatchObject({ kind: 'dialogue', character: 'Pip', text: 'Help!' });
    expect(lineNumber(said.production, said.line)).toBe(before + 2);
    // The new lines come before the next scene's.
    const scenes = said.production.script.map((l) => l.scene);
    expect(scenes.lastIndexOf(s1)).toBeLessThan(scenes.indexOf(s2));
  });

  it('adds nothing for an empty line, or past the script’s limit', () => {
    const p = exampleProduction();
    expect(addLine(p, s1, '   ', null)).toBeNull();
    const many = {
      ...p,
      script: Array.from({ length: LIMITS.lines }, (_, i) => ({
        ...p.script[0]!,
        id: lineId(`x${i}`),
      })),
    };
    expect(addLine(many, s1, 'One more.', null)).toBeNull();
  });

  it('keeps a line and a name within their limits', () => {
    const p = exampleProduction();
    const long = addLine(p, s1, 'a'.repeat(600), 'N'.repeat(60))!;
    const line = long.production.script.find((l) => l.id === long.line)!;
    expect(line.text).toHaveLength(LIMITS.line);
    expect(line.character).toHaveLength(LIMITS.speaker);
  });

  it('rewrites a line, and changes who says it', () => {
    const p = exampleProduction();
    const id = sceneLines(p, s1)[0]!.id;
    expect(setLineText(p, id, 'New words.').script.find((l) => l.id === id)!.text).toBe(
      'New words.',
    );
    const said = setSpeaker(p, id, 'Fox');
    expect(said.script.find((l) => l.id === id)).toMatchObject({
      kind: 'dialogue',
      character: 'Fox',
    });
    expect(setSpeaker(said, id, null).script.find((l) => l.id === id)).toMatchObject({
      kind: 'action',
      character: null,
    });
  });

  it('moves a line within its scene, leaving other scenes alone', () => {
    let p = exampleProduction();
    for (const t of ['B', 'C']) p = addLine(p, s1, t, null)!.production;
    const lines = sceneLines(p, s1);
    const moved = moveLine(p, lines.at(-1)!.id, 0);
    expect(texts(moved)[0]).toBe('C');
    expect(texts(moved, s2)).toEqual(texts(p, s2));
    expect(moveLine(p, lines[0]!.id, 99)).toBe(p);
  });

  it('deletes a line', () => {
    const p = exampleProduction();
    const id = sceneLines(p, s1)[0]!.id;
    expect(deleteLine(p, id).script.some((l) => l.id === id)).toBe(false);
  });

  it('pins a line only to a frame of its own scene, and unpins it', () => {
    const p = exampleProduction();
    const line = sceneLines(p, s1)[0]!;
    const own = p.frames.find((f) => f.scene === s1)!.id;
    const other = p.frames.find((f) => f.scene === s2)!.id;
    const pinned = pinLine(p, line.id, own);
    expect(pinnedLines(pinned, own).map((l) => l.id)).toContain(line.id);
    expect(pinLine(p, line.id, other)).toBe(p);
    expect(pinLine(p, line.id, frameId('nope'))).toBe(p);
    expect(pinLine(pinned, line.id, null).script.find((l) => l.id === line.id)!.pinnedFrame).toBe(
      null,
    );
  });

  it('offers the scene’s cast, then everyone already speaking, each once', () => {
    let p = exampleProduction();
    p = addLine(p, s1, 'Hello.', 'FOX')!.production;
    p = addLine(p, s1, 'Hi.', 'Moon')!.production;
    const names = speakers(p, s2);
    expect(names.slice(0, 2)).toEqual(['penguin', 'fox']);
    expect(names).toContain('Moon');
    expect(names.filter((n) => n.toLowerCase() === 'fox')).toHaveLength(1);
  });
});
