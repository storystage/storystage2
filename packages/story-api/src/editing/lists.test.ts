import { applyAll, type Expression, type ListenerDecl, type Program } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { checkProgram } from '../catalog/program-check.ts';
import { cascadeFor } from './cascade.ts';
import { addItemPlace, itemChange, listDetailOf } from './lists.ts';
import { choice, field, ID, mint, scene } from './testing.ts';
import { describer } from './words.ts';

// A listener's keys or objects, one at a time (the owner, 24 Nov 2026; spec 14, 2.3): its menu
// offers each, making a list of one, "or ▾" adds another, and taking the last out takes the
// detail out.

const list = (of: string, items: Expression[]): Expression => ({
  id: mint(),
  kind: 'arrayOf',
  of: { kind: 'story', name: of },
  items,
});
const keys = (...values: string[]) =>
  list(
    'Key',
    values.map((v) => choice('Key', v)),
  );
const listening = (event: string, details: Record<string, Expression> = {}): ListenerDecl => ({
  id: mint(),
  kind: 'listener',
  event,
  args: {},
  details,
  params: [],
  body: [],
});
function withListener(listener: ListenerDecl): Program {
  const p = scene();
  const [own, ...rest] = p.types;
  return { ...p, types: [{ ...own!, listeners: [...own!.listeners, listener] }, ...rest] };
}
const listenerIn = (p: Program) => p.types[0]!.listeners.at(-1)!;
const wordsOf = (p: Program) => describer(p).inside(listenerIn(p), ID.scene);
const after = (p: Program, change: ReturnType<typeof itemChange>) => {
  if (!change.ok) throw new Error(change.reason);
  return applyAll(p, change.edits).program;
};

describe('the menu for a listener’s keys or objects', () => {
  const menu = (event: string, detail: string) => {
    const l = listening(event);
    return cascadeFor(
      withListener(l),
      { kind: 'value', node: l.id, slot: 'details', param: detail },
      mint,
    );
  };

  it('offers each of the event’s own keys, making a list of one', () => {
    const choices = menu('arrowKeyPress', 'keys');
    expect(choices.map((c) => c.words)).toEqual([
      'up arrow',
      'down arrow',
      'left arrow',
      'right arrow',
    ]);
    expect(choices[2]!.value).toMatchObject({
      kind: 'arrayOf',
      of: { kind: 'story', name: 'Key' },
      items: [{ kind: 'enum', type: 'Key', value: 'left' }],
    });
  });

  it('offers no empty list', () => {
    expect(menu('keyPress', 'keys').map((c) => c.words)).not.toContain('A new, empty list');
    expect(menu('keyPress', 'keys').length).toBeGreaterThan(40);
  });

  it('offers each object for a click, making a list of one', () => {
    const choices = menu('clickOnObject', 'setOfVisuals');
    const cat = choices.find((c) => c.words === 'cat');
    expect(cat?.value).toMatchObject({
      kind: 'arrayOf',
      items: [{ kind: 'fieldRef', field: ID.cat }],
    });
    expect(choices.map((c) => c.words)).not.toContain('A new, empty list');
  });
});

describe('or ▾: another key or object', () => {
  it('is offered past the last, without those already chosen', () => {
    const chosen = keys('up', 'left');
    const l = listening('arrowKeyPress', { keys: chosen });
    const p = withListener(l);
    const place = addItemPlace(p, chosen.id)!;
    expect(place).toEqual({ kind: 'value', node: chosen.id, slot: 'items', param: '2' });
    expect(cascadeFor(p, place, mint).map((c) => c.words)).toEqual(['down arrow', 'right arrow']);
  });

  it('isn’t offered a key the list has already when changing one', () => {
    const chosen = keys('up', 'left');
    const p = withListener(listening('arrowKeyPress', { keys: chosen }));
    const place = { kind: 'value', node: chosen.id, slot: 'items', param: '0' } as const;
    expect(cascadeFor(p, place, mint).map((c) => c.words)).toEqual([
      'up arrow',
      'down arrow',
      'right arrow',
    ]);
  });

  it('adds it as one step, named by the key', () => {
    const chosen = keys('w');
    const p = withListener(listening('keyPress', { keys: chosen }));
    const change = itemChange(p, chosen.id, 1, choice('Key', 'up'));
    expect(change).toMatchObject({ ok: true, label: 'Add up arrow to when W is pressed' });
    const made = after(p, change);
    expect(wordsOf(made)).toBe('when W or up arrow is pressed');
    expect(checkProgram(made)).toEqual([]);
  });
});

describe('changing and taking out one', () => {
  it('changes one, named by both keys', () => {
    const chosen = keys('w', 'up');
    const p = withListener(listening('keyPress', { keys: chosen }));
    const change = itemChange(p, chosen.id, 0, choice('Key', 's'));
    expect(change).toMatchObject({
      ok: true,
      label: 'Change W to S in when W or up arrow is pressed',
    });
    expect(wordsOf(after(p, change))).toBe('when S or up arrow is pressed');
  });

  it('takes one out', () => {
    const chosen = keys('w', 'up');
    const p = withListener(listening('keyPress', { keys: chosen }));
    const change = itemChange(p, chosen.id, 0, null);
    expect(change).toMatchObject({
      ok: true,
      label: 'Take W out of when W or up arrow is pressed',
    });
    expect(wordsOf(after(p, change))).toBe('when up arrow is pressed');
  });

  it('takes the detail out with its last one, so no empty list is left', () => {
    const chosen = list('Thing', [field(ID.cat)]);
    const p = withListener(listening('clickOnObject', { setOfVisuals: chosen }));
    const change = itemChange(p, chosen.id, 0, null);
    expect(change).toMatchObject({ ok: true, label: 'Take cat out of when cat is clicked' });
    const made = after(p, change);
    expect(listenerIn(made).details).toEqual({});
    expect(wordsOf(made)).toBe('when an object is clicked');
  });

  it('refuses a key the event isn’t for, and a place that isn’t there', () => {
    const chosen = keys('up');
    const p = withListener(listening('arrowKeyPress', { keys: chosen }));
    expect(itemChange(p, chosen.id, 1, choice('Key', 'a'))).toEqual({
      ok: false,
      reason: 'That key isn’t one this event is for. Choose another one.',
    });
    expect(itemChange(p, chosen.id, 3, choice('Key', 'down')).ok).toBe(false);
    expect(itemChange(p, chosen.id, 1, null).ok).toBe(false);
  });

  it('knows a listener’s list from any other', () => {
    const chosen = keys('up');
    const l = listening('arrowKeyPress', { keys: chosen });
    const p = withListener(l);
    expect(listDetailOf(p, chosen.id)).toMatchObject({ detail: 'keys', listener: { id: l.id } });
    expect(listDetailOf(p, l.id)).toBeNull();
  });
});

describe('an empty list (the owner, 24 Nov 2026)', () => {
  it('reads as the event, and the check says why it never runs', () => {
    const p = withListener(listening('arrowKeyPress', { keys: keys() }));
    expect(wordsOf(p)).toBe('when an arrow key is pressed');
    expect(checkProgram(p).map((x) => x.reason)).toEqual([
      'No keys chosen, so this never runs. Choose one, or take the setting out.',
    ]);
    const objects = withListener(listening('clickOnObject', { setOfVisuals: list('Thing', []) }));
    expect(checkProgram(objects).map((x) => x.reason)).toEqual([
      'No objects chosen, so this never runs. Choose one, or take the setting out.',
    ]);
  });
});
