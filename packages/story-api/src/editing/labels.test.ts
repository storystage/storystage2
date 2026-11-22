import { describe, expect, it } from 'vitest';
import { newControl } from './build.ts';
import { labelFor } from './labels.ts';
import { call, choice, field, ID, mint, num, scene, text } from './testing.ts';

const program = scene();
const label = (edit: Parameters<typeof labelFor>[1]) => labelFor(program, edit);

describe('labelFor (spec 14, 2.4)', () => {
  it('names a new block by what it makes happen', () => {
    const say = call(field(ID.cat), 'say', { text: text('Bye') });
    expect(
      label({ kind: 'insert', parent: ID.main, slot: 'body', index: 2, node: say, label: '' }),
    ).toBe('Make cat say Bye');
    const together = newControl('doTogether', mint);
    expect(
      label({ kind: 'insert', parent: ID.main, slot: 'body', index: 2, node: together, label: '' }),
    ).toBe('Add do together');
  });

  it('names a deletion, a move and switching off', () => {
    expect(label({ kind: 'remove', node: ID.say, label: '' })).toBe('Delete cat say Hello');
    expect(
      label({ kind: 'move', node: ID.say, parent: ID.together, slot: 'body', index: 0, label: '' }),
    ).toBe('Move cat say Hello into do together');
    expect(
      label({ kind: 'move', node: ID.say, parent: ID.main, slot: 'body', index: 1, label: '' }),
    ).toBe('Move cat say Hello');
    expect(label({ kind: 'setEnabled', node: ID.move, enabled: false, label: '' })).toBe(
      'Switch off cat move forward 1',
    );
  });

  it('names a changed value by what it was and what it is', () => {
    const edit = {
      kind: 'setArgument',
      node: ID.move,
      slot: 'args',
      param: 'amount',
      value: num(2),
      label: '',
    } as const;
    expect(label(edit)).toBe('Change 1 to 2 in cat move');
    const direction = { ...edit, param: 'direction', value: choice('MoveDirection', 'backward') };
    expect(label(direction)).toBe('Change forward to backward in cat move');
  });

  it('names a detail added or taken out', () => {
    const add = {
      kind: 'setArgument',
      node: ID.move,
      slot: 'details',
      param: 'duration',
      value: num(2),
      label: '',
    } as const;
    expect(label(add)).toBe('Add how long to cat move');
    const withDuration = labelFor(
      scene([
        { ...call(field(ID.cat), 'turn'), id: 'turnst' as never, details: { duration: num(2) } },
      ]),
      {
        kind: 'setArgument',
        node: 'turnst' as never,
        slot: 'details',
        param: 'duration',
        value: null,
        label: '',
      },
    );
    expect(withDuration).toBe('Take how long out of cat turn');
  });

  it('names a first choice for an empty value', () => {
    const empty = scene([
      {
        ...call(field(ID.cat), 'say', { text: { id: 'nonetx' as never, kind: 'none' } }),
        id: 'emptys' as never,
      },
    ]);
    const edit = {
      kind: 'setArgument',
      node: 'emptys',
      slot: 'args',
      param: 'text',
      value: text('Hi'),
      label: '',
    } as const;
    expect(labelFor(empty, edit as never)).toBe('Choose Hi for cat say');
  });
});
