import { applyAll, validateProgram, type NodeId } from '@storystage/ast';
import { exampleProduction } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import {
  NEW_EVENTS,
  eventWords,
  inputProblems,
  nameProblem,
  newListener,
  newMethod,
  newMethodWithInputs,
  suggestedName,
} from './newMethodEdits.ts';

const p = exampleProduction();
const scene = p.program.types.find((t) => t.methods.some((m) => m.id === p.scenes[0]!.method))!;
const type = scene.id;

describe('New in the Code editor (7.2)', () => {
  it('suggests a name the scene has not got, and says why a name will not do', () => {
    expect(suggestedName(p.program, type, 'newProcedure')).toBe('newProcedure');
    const taken = scene.methods[0]!.name;
    expect(suggestedName(p.program, type, taken)).toBe(`${taken}2`);
    expect(nameProblem(p.program, type, '')).toBe('empty');
    expect(nameProblem(p.program, type, 'walk to door')).toBe('shape');
    expect(nameProblem(p.program, type, '2walk')).toBe('shape');
    expect(nameProblem(p.program, type, 'a'.repeat(61))).toBe('long');
    expect(nameProblem(p.program, type, taken)).toBe('taken');
    expect(nameProblem(p.program, type, scene.fields[0]!.name)).toBe('taken');
    expect(nameProblem(p.program, type, 'walkToTheDoor')).toBeNull();
    // A character's class can't take its Story API class's names either (S6's review of #623).
    expect(nameProblem(p.program, type, 'say', 'Flyer')).toBe('builtIn');
    expect(nameProblem(p.program, type, 'waddle', 'Flyer')).toBeNull();
    expect(nameProblem(p.program, type, 'say')).toBeNull();
  });

  it('adds a procedure after the scene’s methods, valid and empty', () => {
    const made = newMethod(p.program, type, 'walkToTheDoor', null, 'Add procedure walkToTheDoor')!;
    const after = applyAll(p.program, [made.edit]).program;
    expect(validateProgram(after)).toEqual([]);
    const methods = after.types.find((t) => t.id === type)!.methods;
    expect(methods.at(-1)).toMatchObject({
      id: made.id,
      name: 'walkToTheDoor',
      returns: null,
      body: [],
    });
  });

  it('adds a function that gives back a value of its type from the start', () => {
    for (const [gives, value] of [
      ['Number', { kind: 'number', value: 0 }],
      ['WholeNumber', { kind: 'wholeNumber', value: 0 }],
      ['Text', { kind: 'text', value: '' }],
      ['Boolean', { kind: 'boolean', value: true }],
    ] as const) {
      const made = newMethod(p.program, type, 'howFar', gives, 'Add function howFar')!;
      const after = applyAll(p.program, [made.edit]).program;
      expect(validateProgram(after)).toEqual([]);
      const fn = after.types.find((t) => t.id === type)!.methods.find((m) => m.id === made.id)!;
      expect(fn.returns).toEqual({ kind: 'story', name: gives });
      expect(fn.body).toMatchObject([{ kind: 'return', value }]);
    }
  });

  it('adds a listener for each event offered, valid, and never another scene start', () => {
    expect(NEW_EVENTS).not.toContain('sceneStart');
    expect(NEW_EVENTS.length).toBeGreaterThan(3);
    for (const event of NEW_EVENTS) {
      expect(eventWords(event)).not.toBe(`event.${event}`);
      const made = newListener(p.program, type, event, `Add ${event}`)!;
      const after = applyAll(p.program, [made.edit]).program;
      expect(validateProgram(after)).toEqual([]);
      expect(after.types.find((t) => t.id === type)!.listeners.at(-1)).toMatchObject({
        id: made.id,
        event,
        body: [],
      });
    }
  });

  it('adds nothing to a class that is not there', () => {
    expect(newMethod(p.program, 'gone' as NodeId, 'x', null, '')).toBeNull();
    expect(newListener(p.program, type, 'noSuchEvent', '')).toBeNull();
  });
});

describe('New with inputs (7.14, decision 0074)', () => {
  it('declares the method and its inputs as one step, and the program stays whole', () => {
    const made = newMethodWithInputs(
      p.program,
      type,
      'waddle',
      null,
      [
        { name: 'steps', type: 'WholeNumber' },
        { name: 'height', type: 'Number' },
      ],
      'Add procedure waddle with steps and height',
    )!;
    const after = applyAll(p.program, made.edits).program;
    expect(validateProgram(after)).toEqual([]);
    const method = after.types.find((t) => t.id === type)!.methods.find((m) => m.id === made.id)!;
    expect(method.name).toBe('waddle');
    expect(method.params.map((q) => [q.name, q.type])).toEqual([
      ['steps', { kind: 'story', name: 'WholeNumber' }],
      ['height', { kind: 'story', name: 'Number' }],
    ]);
    // A learner's input has no default; the ids are all new.
    expect(method.params.every((q) => q.default === null)).toBe(true);
    expect(new Set([method.id, ...method.params.map((q) => q.id)]).size).toBe(3);
  });

  it('says why an input’s name won’t do, and that two inputs can’t share one', () => {
    expect(
      inputProblems([
        { name: 'steps', type: 'Number' },
        { name: '', type: 'Number' },
        { name: 'two words', type: 'Number' },
        { name: 'steps', type: 'Text' },
        { name: 'x'.repeat(61), type: 'Number' },
      ]),
    ).toEqual([null, 'empty', 'shape', 'taken', 'long']);
  });
});
