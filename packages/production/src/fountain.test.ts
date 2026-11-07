import { describe, expect, it } from 'vitest';
import { exampleProduction } from './example.ts';
import {
  FOUNTAIN_LIMITS,
  readFountain,
  writeFountain,
  type FountainIds,
  type ReadFountainResult,
} from './fountain.ts';
import { lineId, sceneId, type Production, type ScriptLine } from './types.ts';

/** New ids for lines and headings that arrive without one: n1, n2, … */
function counterIds(): FountainIds {
  let n = 0;
  return {
    scene: () => sceneId(`n${++n}`),
    line: () => lineId(`n${++n}`),
  };
}

function read(text: string): Extract<ReadFountainResult, { ok: true }>['script'] {
  const result = readFountain(text, counterIds());
  if (!result.ok) throw new Error(`Expected to read, got ${result.problem.code}`);
  return result.script;
}

/** A production whose script is `lines` under one scene, for escaping tests. */
function withLines(lines: readonly Omit<ScriptLine, 'scene' | 'pinnedFrame'>[]): Production {
  const p = exampleProduction();
  const scene = p.scenes[0]!.id;
  return {
    ...p,
    script: lines.map((l) => ({ ...l, scene, pinnedFrame: null })),
  };
}

describe('writeFountain', () => {
  it('writes the example production as spec 03 section 5 shows', () => {
    expect(writeFountain(exampleProduction())).toBe(
      [
        'Title: The Lost Penguin',
        'Logline: A penguin lost in a forest finds an unlikely friend who helps her home.',
        'Synopsis:',
        '    Pip the penguin drifts away from the ice on a floe and lands in a dark forest. A fox she is afraid of turns out to be lost too. Together they find the river that leads back to the sea.',
        '',
        '.Ice shelf, morning [[scene:s1]]',
        '',
        'Pip slides to the edge of the ice. [[line:l1 frame:f1]]',
        '',
        'PIP',
        'Oh no, the ice is moving! [[line:l2]]',
        '',
        '.Forest, night [[scene:s2]]',
        '',
        'FOX',
        "Don't be scared. I'm lost too. [[line:l3 frame:f2]]",
        '',
        '.Ice shelf, evening [[scene:s3]]',
        '',
        'PIP',
        'Home! Thank you, Fox. [[line:l4 frame:f3]]',
        '',
      ].join('\n'),
    );
  });

  it('writes scenes in running order, whatever order the cards are in', () => {
    const p = exampleProduction();
    const reversed: Production = {
      ...p,
      storyboard: { ...p.storyboard, cards: [...p.storyboard.cards].reverse() },
    };
    expect(writeFountain(reversed)).toBe(writeFountain(p));
  });

  it('writes a scene with no lines as its heading alone', () => {
    const p = exampleProduction();
    const text = writeFountain({ ...p, script: p.script.filter((l) => l.scene !== 's2') });
    expect(text).toContain('.Forest, night [[scene:s2]]\n\n.Ice shelf, evening [[scene:s3]]');
  });

  it('gives the same text every time', () => {
    expect(writeFountain(exampleProduction())).toBe(writeFountain(exampleProduction()));
  });
});

describe('reading what writeFountain wrote', () => {
  it('gives back every scene and line, with their ids, kinds, speakers and pins', () => {
    const p = exampleProduction();
    const script = read(writeFountain(p));
    const order = p.manifest.runningOrder.map((r) => r.scene);
    expect(script.scenes).toEqual(
      order.map((id) => ({ id, heading: p.storyboard.cards.find((c) => c.id === id)!.heading })),
    );
    expect(script.lines).toEqual(p.script);
  });

  it('ignores the title page, which manifest.json and storyboard.json own', () => {
    const script = read('Title: Something else\nLogline: Not this one\n\n.Forest [[scene:s1]]\n');
    expect(script.scenes).toEqual([{ id: 's1', heading: 'Forest' }]);
    expect(script.lines).toEqual([]);
  });

  it.each([
    ['looks like a heading', 'INT. KITCHEN - DAY'],
    ['starts with a full stop', '.Not a heading'],
    ['is in capitals, like a speaker', 'THE END'],
    ['starts with an exclamation mark', '!Bang'],
    ['looks like a transition', 'CUT TO:'],
    ['starts with a hash', '# not a section'],
    ['starts with an equals sign', '= not a synopsis'],
    ['starts with a tilde', '~ not a lyric'],
    ['is centred', '>Middle<'],
    ['starts with an at sign', '@not a speaker'],
    ['is a page break', '==='],
    ['opens a boneyard', '/* not hidden */'],
  ])('keeps an action line that %s', (_, text) => {
    const p = withLines([{ id: lineId('a'), kind: 'action', character: null, text }]);
    expect(read(writeFountain(p)).lines[0]).toMatchObject({ kind: 'action', text });
  });

  it.each([
    ['a speaker with no letters', '42'],
    ['a speaker whose name looks like a heading', 'INT. GUARD'],
    ['a speaker whose name ends like a transition', 'SMASH TO:'],
  ])('keeps the dialogue of %s', (_, character) => {
    const p = withLines([{ id: lineId('d'), kind: 'dialogue', character, text: 'Hello.' }]);
    expect(read(writeFountain(p)).lines[0]).toMatchObject({
      kind: 'dialogue',
      character,
      text: 'Hello.',
    });
  });

  it('writes speakers in capitals and reads them back in capitals', () => {
    const p = withLines([{ id: lineId('d'), kind: 'dialogue', character: 'Pip', text: 'Hi.' }]);
    expect(writeFountain(p)).toContain('\nPIP\nHi. [[line:d]]');
    expect(read(writeFountain(p)).lines[0]!.character).toBe('PIP');
  });

  it('keeps dialogue that starts with a bracket', () => {
    const p = withLines([
      { id: lineId('d'), kind: 'dialogue', character: 'PIP', text: '(quietly)' },
    ]);
    expect(read(writeFountain(p)).lines[0]!.text).toBe('(quietly)');
  });

  it('keeps notes that are part of the learner’s text', () => {
    const text = 'Pip waves [[like this]] and [[line:fake]] here.';
    const p = withLines([{ id: lineId('a'), kind: 'action', character: null, text }]);
    expect(read(writeFountain(p)).lines[0]).toMatchObject({ id: 'a', text });
  });

  it('keeps a heading that starts with a full stop', () => {
    const p = exampleProduction();
    const cards = p.storyboard.cards.map((c, i) => (i === 0 ? { ...c, heading: '...later' } : c));
    const text = writeFountain({ ...p, storyboard: { ...p.storyboard, cards } });
    expect(read(text).scenes[0]).toEqual({ id: 's1', heading: '...later' });
  });

  it('joins a line written over several lines with single line breaks', () => {
    const p = withLines([
      { id: lineId('a'), kind: 'action', character: null, text: 'One.\n\n\nTwo.' },
    ]);
    expect(read(writeFountain(p)).lines[0]!.text).toBe('One.\nTwo.');
  });
});

describe('reading a script from another Fountain tool', () => {
  const script = read(
    [
      '\uFEFFTitle: The Fox',
      'Credit: written by',
      'Author: Somebody',
      '',
      'A cold wind blows.',
      '',
      'INT. DEN - NIGHT',
      '',
      '# Act one',
      '= The fox is hungry.',
      '',
      'The fox wakes. *Slowly.*',
      '',
      'FOX (V.O.)',
      '(sleepily)',
      'Is it morning?',
      '',
      'OWL ^',
      'Not yet.',
      '',
      'CUT TO:',
      '',
      'EXT. WOOD - DAY [[remember the sun]]',
      '',
      '/* a cut scene',
      'that nobody sees */',
      '',
      '> The end <',
      '',
      '===',
      '',
      '~ La la la',
    ].join('\r\n'),
  );

  it('makes a scene of each heading, in order, with new ids', () => {
    expect(script.scenes.map((s) => s.heading)).toEqual([
      '',
      'INT. DEN - NIGHT',
      'EXT. WOOD - DAY [[remember the sun]]',
    ]);
    expect(new Set(script.scenes.map((s) => s.id)).size).toBe(3);
  });

  it('puts lines before the first heading under a scene with no heading yet', () => {
    expect(script.lines[0]).toMatchObject({
      scene: script.scenes[0]!.id,
      kind: 'action',
      text: 'A cold wind blows.',
    });
  });

  it('reads action and dialogue, with speakers and brackets kept', () => {
    const den = script.scenes[1]!.id;
    expect(script.lines.filter((l) => l.scene === den)).toEqual([
      expect.objectContaining({ kind: 'action', text: 'The fox wakes. *Slowly.*' }),
      expect.objectContaining({
        kind: 'dialogue',
        character: 'FOX (V.O.)',
        text: '(sleepily)\nIs it morning?',
      }),
      expect.objectContaining({ kind: 'dialogue', character: 'OWL', text: 'Not yet.' }),
    ]);
  });

  it('leaves out sections, synopses, transitions, the boneyard and page breaks', () => {
    const texts = script.lines.map((l) => l.text).join('\n');
    for (const gone of ['Act one', 'hungry', 'CUT TO', 'nobody sees', '==='])
      expect(texts).not.toContain(gone);
  });

  it('keeps centred text and lyrics as action', () => {
    const wood = script.scenes[2]!.id;
    expect(script.lines.filter((l) => l.scene === wood).map((l) => l.text)).toEqual([
      'The end',
      'La la la',
    ]);
  });

  it('gives every line a new id, and pins nothing', () => {
    expect(new Set(script.lines.map((l) => l.id)).size).toBe(script.lines.length);
    expect(script.lines.every((l) => l.pinnedFrame === null)).toBe(true);
  });
});

describe('ids in notes', () => {
  it('gives a new id to a line whose id has been used already', () => {
    const script = read('.A [[scene:s1]]\n\nOne. [[line:x]]\n\nTwo. [[line:x]]\n');
    expect(script.lines.map((l) => l.id)).toEqual(['x', 'n1']);
  });

  it('gives a new id to a scene whose id isn’t safe as a file name, or is used already', () => {
    const script = read('.A [[scene:../up]]\n\n.B [[scene:ok]]\n\n.C [[scene:ok]]\n');
    expect(script.scenes.map((s) => s.id)).toEqual(['n1', 'ok', 'n2']);
  });

  it('ignores a frame id that isn’t safe as a file name', () => {
    const script = read('.A [[scene:s1]]\n\nOne. [[line:x frame:../f]]\n');
    expect(script.lines[0]!.pinnedFrame).toBeNull();
  });

  it('reads an id note only at the very end of a line', () => {
    const script = read('.A [[scene:s1]]\n\nOne [[line:x]] more.\n');
    expect(script.lines[0]).toMatchObject({ id: 'n1', text: 'One [[line:x]] more.' });
  });
});

describe('size limits', () => {
  const fail = (text: string) => {
    const result = readFountain(text, counterIds());
    if (result.ok) throw new Error('Expected a problem');
    return result.problem;
  };

  it('refuses a file over the size limit', () => {
    expect(fail('x'.repeat(FOUNTAIN_LIMITS.bytes + 1))).toEqual({
      code: 'tooBig',
      limit: FOUNTAIN_LIMITS.bytes,
    });
  });

  it('refuses too many scenes', () => {
    const text = Array.from({ length: FOUNTAIN_LIMITS.scenes + 1 }, (_, i) => `.S${i}`).join(
      '\n\n',
    );
    expect(fail(text)).toEqual({ code: 'tooManyScenes', limit: FOUNTAIN_LIMITS.scenes });
  });

  it('refuses too many lines', () => {
    const text =
      '.A\n\n' +
      Array.from({ length: FOUNTAIN_LIMITS.lines + 1 }, (_, i) => `Line ${i}.`).join('\n\n');
    expect(fail(text)).toEqual({ code: 'tooManyLines', limit: FOUNTAIN_LIMITS.lines });
  });

  it('refuses a line longer than the limit', () => {
    expect(fail(`.A\n\n${'a'.repeat(FOUNTAIN_LIMITS.lineLength + 1)}`)).toEqual({
      code: 'lineTooLong',
      limit: FOUNTAIN_LIMITS.lineLength,
    });
  });

  it('refuses a heading longer than the limit', () => {
    expect(fail(`.${'a'.repeat(FOUNTAIN_LIMITS.headingLength + 1)}`)).toEqual({
      code: 'headingTooLong',
      limit: FOUNTAIN_LIMITS.headingLength,
    });
  });

  it('refuses a speaker’s name longer than the limit', () => {
    expect(fail(`.A\n\n@${'A'.repeat(FOUNTAIN_LIMITS.nameLength + 1)}\nHi.`)).toEqual({
      code: 'nameTooLong',
      limit: FOUNTAIN_LIMITS.nameLength,
    });
  });

  it('reads the example production comfortably inside the limits', () => {
    expect(readFountain(writeFountain(exampleProduction()), counterIds()).ok).toBe(true);
  });
});
