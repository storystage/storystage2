import { exampleProduction, type Production } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { newProduction, setLogline, setSynopsis, setTitle } from './edits.ts';
import { importScript, scriptFile, scriptFileName } from './scriptFile.ts';

const utf8 = (text: string) => new TextEncoder().encode(text);

/** A new film, ready for scenes. */
const ready = (): Production =>
  setSynopsis(setLogline(newProduction(), 'A penguin finds home.'), 'Pip is lost, then found.');

/** What a scene's lines say, as the script pane shows them. */
const said = (p: Production) =>
  p.manifest.runningOrder.map(({ scene }) => ({
    heading: p.storyboard.cards.find((c) => c.id === scene)!.heading,
    lines: p.script
      .filter((l) => l.scene === scene)
      .map((l) => (l.character ? `${l.character}: ${l.text}` : l.text)),
  }));

const OTHER_TOOL = `Title: The Lost Penguin
Author: Class 5

EXT. ICE FIELD - DAY

Pip waddles across the ice. [[line:x9 frame:f4]]

PIP
Where is everyone?

INT. CAVE - NIGHT

The wind howls.

MUM (O.S.)
Pip! Over here!
`;

describe('Import a script (10.4)', () => {
  it('makes a scene for each heading, with its lines, as one step', () => {
    const result = importScript(ready(), utf8(OTHER_TOOL), 'Import the script');
    if (!result.ok) throw new Error(result.refusal.code);
    const p = result.step.production;
    expect(said(p)).toEqual([
      {
        heading: 'EXT. ICE FIELD - DAY',
        lines: ['Pip waddles across the ice.', 'PIP: Where is everyone?'],
      },
      { heading: 'INT. CAVE - NIGHT', lines: ['The wind howls.', 'MUM (O.S.): Pip! Over here!'] },
    ]);
    expect([result.scenes, result.lines]).toEqual([2, 4]);
    // A type in the program for each scene, as Add a scene makes, and one undo step for all.
    expect(p.scenes).toHaveLength(2);
    expect(p.program.types).toHaveLength(2);
    expect(result.step.label).toBe('Import the script');
    expect(result.step.edits).toHaveLength(2);
    expect(result.step.inverses).toHaveLength(2);
    // Numbered as the script pane numbers lines; no pins, as there are no frames yet.
    expect(p.script.map((l) => l.id)).toEqual(['l1', 'l2', 'l3', 'l4']);
    expect(p.script.every((l) => l.pinnedFrame === null)).toBe(true);
    // The title page is the other tool's: the film keeps its own logline.
    expect(p.storyboard.logline).toBe('A penguin finds home.');
  });

  it('reads back what Export the script wrote', () => {
    const example = exampleProduction();
    const result = importScript(ready(), scriptFile(example), 'Import the script');
    if (!result.ok) throw new Error(result.refusal.code);
    expect(said(result.step.production)).toEqual(said(example));
  });

  it('puts lines before the first heading in a scene of their own', () => {
    const result = importScript(ready(), utf8('Snow falls.\n\nINT. CAVE\n\nDrip.\n'), 'Import');
    if (!result.ok) throw new Error(result.refusal.code);
    expect(said(result.step.production)).toEqual([
      { heading: '', lines: ['Snow falls.'] },
      { heading: 'INT. CAVE', lines: ['Drip.'] },
    ]);
  });

  it('says why it imports nothing', () => {
    const code = (p: Production, bytes: Uint8Array) => {
      const result = importScript(p, bytes, 'Import');
      return result.ok ? 'imported' : result.refusal.code;
    };
    expect(code(exampleProduction(), utf8(OTHER_TOOL))).toBe('hasScenes');
    expect(code(newProduction(), utf8(OTHER_TOOL))).toBe('needsLoglineAndSynopsis');
    expect(code(ready(), new Uint8Array([0x49, 0x4e, 0xff, 0xfe]))).toBe('notText');
    expect(code(ready(), utf8('Title: Nothing yet\n\n'))).toBe('empty');
    expect(code(ready(), new Uint8Array(512 * 1024 + 1).fill(0x41))).toBe('tooBig');
    const many = Array.from({ length: 51 }, (_, i) => `INT. ROOM ${i + 1}`).join('\n\n');
    expect(code(ready(), utf8(many))).toBe('tooManyScenes');
    expect(code(ready(), utf8(`INT. ${'A'.repeat(90)}`))).toBe('headingTooLong');
  });
});

describe('Export the script (10.4)', () => {
  it('is named for the film, as a name any system can keep', () => {
    expect(scriptFileName(setTitle(ready(), 'Pip: the lost penguin?'))).toBe(
      'Pip the lost penguin.fountain',
    );
    expect(scriptFileName(ready())).toBe('My film.fountain');
    expect(scriptFileName(setTitle(ready(), 'x'.repeat(80)))).toHaveLength(80);
  });
});
