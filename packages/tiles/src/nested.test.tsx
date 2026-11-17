import { applyAll, applyEdits, nodeId } from '@storystage/ast';
import type { Expression, Program, Statement } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { setValue } from './actions.ts';
import { TileEditor } from './editor.tsx';
import { fixture, IDS } from './fixture.ts';

// A value made of others (spec 14, 3b.1): a pill holding its own words, which change the whole
// value, and a pill for each value in it, so each can be changed on its own, as in Blocks.

const LEFT = nodeId('leftnm');
const RIGHT = nodeId('rightn');
const number = (id: string, value: number): Expression => ({
  id: nodeId(id),
  kind: 'number',
  value,
});

/** The fixture with every statement passed through `change`, nested ones too. */
function changed(change: (s: Statement) => Statement): Program {
  const program = fixture();
  const walk = (list: readonly Statement[]): Statement[] =>
    list.map((s) => {
      const c = change(s);
      return 'body' in c ? ({ ...c, body: walk(c.body) } as Statement) : c;
    });
  const scene = program.types[0]!;
  const main = scene.methods[0]!;
  return {
    ...program,
    types: [{ ...scene, methods: [{ ...main, body: walk(main.body) }] }, ...program.types.slice(1)],
  };
}

/** The fixture with the cat moving forward "2 + 3". */
const withSum = () =>
  changed((s) =>
    s.id === IDS.move && s.kind === 'call'
      ? {
          ...s,
          args: {
            ...s.args,
            amount: {
              id: IDS.amount,
              kind: 'arithmetic',
              op: 'add',
              left: number('leftnm', 2),
              right: number('rightn', 3),
            },
          },
        }
      : s,
  );

let editor: TileEditor | null = null;

function setup(program: Program) {
  const host = new TestHost(program, { apply: (p, edits) => applyEdits(p, edits) });
  const element = document.createElement('div');
  document.body.append(element);
  editor = new TileEditor();
  act(() => editor!.mount(element, host, { method: IDS.main, selection: [], focus: null }));
  return { host, user: userEvent.setup() };
}

afterEach(() => {
  if (editor) act(() => void editor!.unmount());
  editor = null;
  document.body.innerHTML = '';
});

const row = (id: string) => document.querySelector<HTMLElement>(`[data-key="${id}"]`)!;
const words = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();
const amountOf = (host: TestHost) => {
  const together = host.program().types[0]!.methods[0]!.body[1]!;
  const move = (together as { body: Statement[] }).body[0]!;
  return (move as Statement & { kind: 'call' }).args['amount']!;
};
const describedBy = (el: Element) =>
  document.getElementById(el.getAttribute('aria-describedby')!)?.textContent;

describe('a value made of others (spec 14, 3b.1)', () => {
  it('is a pill holding its own words and a pill for each value in it', () => {
    setup(withSum());
    const move = row(IDS.move);
    const sum = move.querySelector('.tl-pill-compound')!;
    expect(words(sum)).toBe('2 + 3');
    // Its words are a button for the whole value; each value inside is a button of its own,
    // and no button holds another.
    const buttons = within(sum as HTMLElement).getAllByRole('button');
    expect(buttons.map(words)).toEqual(['2', '+', '3']);
    expect(buttons.map((b) => b.dataset['key'])).toEqual([LEFT, IDS.amount, RIGHT]);
    expect(sum.querySelector('[role="button"] [role="button"]')).toBeNull();
    expect(describedBy(buttons[1]!)).toBe('amount');
    expect(describedBy(buttons[0]!)).toBe('first value');
    expect(describedBy(buttons[2]!)).toBe('second value');
    // The row's name is still the words it shows (3f.2).
    expect(words(move)).toMatch(/^cat move forward 2 \+ 3 how long 2/);
  });

  it('is reached with the arrows in reading order, its own words where they are drawn', async () => {
    const { user } = setup(withSum());
    row(IDS.move).focus();
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) {
      await user.keyboard('{ArrowRight}');
      seen.push(words(document.activeElement!));
    }
    expect(seen).toEqual(['forward', '2', '+', '3', '2']);
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(words(document.activeElement!)).toBe('+');
  });

  it('changes one value inside it on its own, in one step', async () => {
    const { host, user } = setup(withSum());
    await user.click(within(row(IDS.move)).getByRole('button', { name: '3' }));
    await user.click(await screen.findByRole('menuitem', { name: '1' }));
    const amount = amountOf(host) as Expression & { kind: 'arithmetic' };
    expect(amount.id).toBe(IDS.amount);
    expect([amount.op, amount.left, amount.right.kind]).toEqual([
      'add',
      number('leftnm', 2),
      'number',
    ]);
    expect((amount.right as { value: number }).value).toBe(1);
    expect(host.announcements.at(-1)).toMatch(/^Change 3 to 1/);
  });

  it('changes as a whole from its own words', async () => {
    const { host, user } = setup(withSum());
    await user.click(within(row(IDS.move)).getByRole('button', { name: '+' }));
    await user.click(await screen.findByRole('menuitem', { name: '1' }));
    expect(amountOf(host)).toMatchObject({ kind: 'number', value: 1 });
  });

  it('draws a question with a value to fill as a question pill, its value a pill inside it', () => {
    setup(fixture());
    const branch = row(IDS.branch);
    const question = branch.querySelector('.tl-pill-question')!;
    expect(question.classList).toContain('tl-pill-compound');
    expect(
      within(question as HTMLElement)
        .getAllByRole('button')
        .map(words),
    ).toEqual(['cat is touching', 'chair']);
    expect(describedBy(within(branch).getByRole('button', { name: 'cat is touching' }))).toBe(
      'condition',
    );
  });
});

describe('an item of a list', () => {
  const LIST = nodeId('listof');
  /** The fixture with a for each through "a list of chair chair" first in its method. */
  const withList = (): Program => {
    const program = fixture();
    const chair = (id: string): Expression => ({
      id: nodeId(id),
      kind: 'fieldRef',
      target: { id: nodeId(`${id}s`), kind: 'this' },
      field: IDS.chair,
    });
    const loop: Statement = {
      id: nodeId('eachst'),
      kind: 'forEach',
      item: {
        id: nodeId('itemlp'),
        kind: 'loopItem',
        name: 'thing',
        type: { kind: 'story', name: 'Prop' },
      },
      items: {
        id: LIST,
        kind: 'arrayOf',
        of: { kind: 'story', name: 'Prop' },
        items: [chair('chaira'), chair('chairb')],
      },
      body: [],
    };
    const scene = program.types[0]!;
    const main = scene.methods[0]!;
    return {
      ...program,
      types: [{ ...scene, methods: [{ ...main, body: [loop, ...main.body] }] }],
    };
  };

  it('is drawn as a pill of its own inside the list', () => {
    setup(withList());
    const list = row('eachst').querySelector('.tl-pill-compound')!;
    expect(
      within(list as HTMLElement)
        .getAllByRole('button')
        .map((b) => b.dataset['key']),
    ).toEqual([LIST, 'chaira', 'chairb']);
  });

  it('is changed by making the list again with that item changed, in one step', () => {
    const program = withList();
    const other: Expression = {
      id: nodeId('chairc'),
      kind: 'fieldRef',
      target: { id: nodeId('chaircs'), kind: 'this' },
      field: IDS.chair,
    };
    const change = setValue(
      program,
      { kind: 'value', node: LIST, slot: 'items', param: '1' },
      other,
    );
    expect(change.ok).toBe(true);
    if (!change.ok) return;
    expect(change.edits).toHaveLength(1);
    const after = applyAll(program, change.edits).program;
    const loop = after.types[0]!.methods[0]!.body[0] as Statement & { kind: 'forEach' };
    expect(loop.items.id).toBe(LIST);
    expect((loop.items as { items: Expression[] }).items.map((x) => x.id)).toEqual([
      'chaira',
      'chairc',
    ]);
  });
});
