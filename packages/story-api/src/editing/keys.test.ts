import type { Expression, ListenerDecl, Program } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { checkProgram } from '../catalog/program-check.ts';
import { findEvent } from '../catalog/catalog.ts';
import { DETAILS } from '../catalog/details.ts';
import { cascadeFor } from './cascade.ts';
import { choice, ID, mint, scene } from './testing.ts';
import { describer } from './words.ts';

// Which keys a key listener is for (spec 02, section 6a; the owner approved it in #659).

const keys = (...values: string[]): Expression => ({
  id: mint(),
  kind: 'arrayOf',
  of: { kind: 'story', name: 'Key' },
  items: values.map((v) => choice('Key', v)),
});
const listening = (event: string, details: Record<string, Expression> = {}): ListenerDecl => ({
  id: mint(),
  kind: 'listener',
  event,
  args: {},
  details,
  params: [],
  body: [],
});
/** The test scene with `listener` in it. */
function withListener(listener: ListenerDecl): Program {
  const p = scene();
  const [own, ...rest] = p.types;
  return { ...p, types: [{ ...own!, listeners: [...own!.listeners, listener] }, ...rest] };
}
const problems = (listener: ListenerDecl) =>
  checkProgram(withListener(listener)).map((p) => p.reason);
const words = (l: ListenerDecl) => describer(scene()).inside(l, ID.scene);

describe('the keys detail (spec 02, 6a)', () => {
  it('is a list of keys, every key the event is for without it', () => {
    expect(DETAILS.keys).toMatchObject({ type: 'Key[]', default: null });
  });

  it('is on the three key events, and no other', () => {
    for (const name of ['keyPress', 'arrowKeyPress', 'numberKeyPress'])
      expect(findEvent(name)!.details).toContain('keys');
    for (const name of ['clickOnObject', 'timer', 'moveWithArrowKeys', 'sceneStart'])
      expect(findEvent(name)!.details).not.toContain('keys');
  });

  it('takes each event’s own keys: arrows, digits, or any key', () => {
    expect(findEvent('arrowKeyPress')!.keys).toEqual(['up', 'down', 'left', 'right']);
    expect(findEvent('numberKeyPress')!.keys).toEqual(
      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `digit${n}`),
    );
    expect(findEvent('keyPress')!.keys).toBeUndefined();
  });
});

describe('the check (6a, rule 2)', () => {
  it('passes each event’s own keys, and an empty list', () => {
    expect(problems(listening('keyPress', { keys: keys('space', 'w', 'up') }))).toEqual([]);
    expect(problems(listening('arrowKeyPress', { keys: keys('left') }))).toEqual([]);
    expect(problems(listening('numberKeyPress', { keys: keys('digit3') }))).toEqual([]);
    expect(problems(listening('keyPress', { keys: keys() }))).toEqual([]);
  });

  it('refuses a key that isn’t one the event is for', () => {
    expect(problems(listening('arrowKeyPress', { keys: keys('up', 'a') }))).toEqual([
      'That key isn’t one this event is for. Choose another one.',
    ]);
    expect(problems(listening('numberKeyPress', { keys: keys('space') }))).toHaveLength(1);
  });

  it('refuses keys on an event that isn’t a key’s', () => {
    expect(problems(listening('clickOnObject', { keys: keys('space') }))).toHaveLength(1);
  });
});

describe('the choices for a key (6a, rule 2)', () => {
  /** The words of the keys offered for the first key of `event`'s list. */
  const offered = (event: string) => {
    const list = keys('space');
    const program = withListener(listening(event, { keys: list }));
    return cascadeFor(program, { kind: 'value', node: list.id, slot: 'items', param: '0' }, mint)
      .filter((c) => c.value?.kind === 'enum')
      .map((c) => c.words);
  };

  it('are the event’s own keys', () => {
    expect(offered('arrowKeyPress')).toEqual([
      'up arrow',
      'down arrow',
      'left arrow',
      'right arrow',
    ]);
    expect(offered('numberKeyPress')).toHaveLength(10);
  });

  it('are every key for a key press', () => {
    expect(offered('keyPress')).toContain('space bar');
    expect(offered('keyPress').length).toBeGreaterThan(40);
  });
});

describe('the words (6a, rule 5)', () => {
  it('name the keys', () => {
    expect(words(listening('keyPress', { keys: keys('space') }))).toBe('when space bar is pressed');
    expect(words(listening('keyPress', { keys: keys('w', 'up') }))).toBe(
      'when W or up arrow is pressed',
    );
    expect(words(listening('arrowKeyPress', { keys: keys('left') }))).toBe(
      'when left arrow is pressed',
    );
    expect(words(listening('numberKeyPress', { keys: keys('digit3') }))).toBe(
      'when number key 3 is pressed',
    );
  });

  it('are as now without keys', () => {
    expect(words(listening('keyPress'))).toBe('when a key is pressed');
    expect(words(listening('arrowKeyPress'))).toBe('when an arrow key is pressed');
    expect(words(listening('numberKeyPress'))).toBe('when a number key is pressed');
  });
});
