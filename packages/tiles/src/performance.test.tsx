import { applyEdits, nodeId, type Program } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TileEditor } from './editor.tsx';
import { IDS, large } from './fixture.ts';

// Spec 14, 3h: an edit redraws only what changed. The timings themselves are in
// `e2e/performance.e2e.ts`, in a real browser.

let editor: TileEditor | null = null;
/** How many rows have been drawn since the last reset. */
const drawn = { rows: 0 };

function setup(program: Program) {
  const host = new TestHost(program, { apply: (p, edits) => applyEdits(p, edits) });
  const element = document.createElement('div');
  document.body.append(element);
  editor = new TileEditor({ onRowDrawn: () => void drawn.rows++ });
  act(() => editor!.mount(element, host, { method: IDS.main, selection: [], focus: null }));
  return { host, user: userEvent.setup() };
}

afterEach(() => {
  if (editor) act(() => void editor!.unmount());
  editor = null;
  document.body.innerHTML = '';
});

describe('a method of 500 statements (spec 14, 3h)', () => {
  it('draws every row once to start with', () => {
    drawn.rows = 0;
    setup(large(500));
    expect(screen.getAllByRole('treeitem').filter((e) => 'statement' in e.dataset)).toHaveLength(
      500,
    );
    expect(drawn.rows).toBe(500);
  });

  it('redraws only the row a value changes in, and the box around it', () => {
    const { host } = setup(large(500));
    drawn.rows = 0;
    act(() => {
      host.apply(
        [
          {
            kind: 'setArgument',
            node: IDS.move,
            slot: 'args',
            param: 'amount',
            value: { id: nodeId('newamt'), kind: 'number', value: 3 },
            label: 'Change 1 to 3',
          },
        ],
        'Change 1 to 3',
        'tiles',
      );
    });
    expect(screen.getByRole('treeitem', { name: 'cat move forward 3 how long 2 add detail' }));
    // The move row and the do together it's in: the other 498 are skipped.
    expect(drawn.rows).toBe(2);
  });

  /** The top-level rows, in order, each with the place it says it's at. */
  const places = () =>
    [
      ...document.querySelectorAll('.tl-tree > [data-statement], .tl-tree > li > [data-statement]'),
    ].map((row) => [
      row.getAttribute('aria-posinset'),
      row.getAttribute('aria-setsize'),
      row.getAttribute('data-index'),
    ]);

  it('puts a statement in at the top and redraws only it, every place said again', () => {
    const { host } = setup(large(500));
    const top = host.program().types[0]!.methods[0]!.body.length;
    drawn.rows = 0;
    act(() => {
      host.apply(
        [
          {
            kind: 'insert',
            parent: IDS.main,
            slot: 'body',
            index: 0,
            node: {
              id: nodeId('newsay'),
              kind: 'call',
              target: {
                id: nodeId('newref'),
                kind: 'fieldRef',
                target: { id: nodeId('newthi'), kind: 'this' },
                field: IDS.cat,
              },
              callee: { kind: 'story', name: 'say' },
              args: { text: { id: nodeId('newtxt'), kind: 'text', value: 'First' } },
              details: {},
            },
            label: 'Add cat say First',
          },
        ],
        'Add cat say First',
        'tiles',
      );
    });
    // The new row, and the old first row, which hands it the tab stop (with nothing focused, the
    // first row has it). The 500 rows after it moved down one, which isn't drawing them again.
    expect(drawn.rows).toBe(2);
    const after = places();
    expect(after).toHaveLength(top + 1);
    after.forEach(([posinset, setsize, index], i) => {
      expect(posinset).toBe(String(i + 1));
      expect(setsize).toBe(String(top + 1));
      expect(index).toBe(String(i));
    });
    const first = screen.getByRole('treeitem', { name: 'cat say First add detail' });
    expect(first.getAttribute('aria-posinset')).toBe('1');
  });

  it('moves a statement to the end and redraws none of the rows it passes', () => {
    const { host } = setup(large(500));
    const top = host.program().types[0]!.methods[0]!.body.length;
    drawn.rows = 0;
    act(() => {
      host.apply(
        [
          {
            kind: 'move',
            node: IDS.say,
            parent: IDS.main,
            slot: 'body',
            index: top - 1,
            label: 'Move cat say Hello',
          },
        ],
        'Move cat say Hello',
        'tiles',
      );
    });
    // The moved row, and the do together that's first now and takes the tab stop from it.
    expect(drawn.rows).toBe(2);
    const say = screen.getByRole('treeitem', { name: 'cat say Hello add detail' });
    expect(say.getAttribute('aria-posinset')).toBe(String(top));
    expect(say.getAttribute('data-index')).toBe(String(top - 1));
    places().forEach(([posinset], i) => expect(posinset).toBe(String(i + 1)));
  });

  it('redraws only the two rows focus moves between', async () => {
    const { user } = setup(large(500));
    const first = screen.getByRole('treeitem', { name: 'cat say Hello add detail' });
    act(() => first.focus());
    drawn.rows = 0;
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement?.textContent).toContain('do together');
    expect(drawn.rows).toBe(2);
  });

  it('still redraws rows whose node is the same when a name they show changes', () => {
    const { host } = setup(large(500));
    const program = host.program();
    const scene = program.types[0]!;
    const renamed: Program = {
      ...program,
      types: [
        {
          ...scene,
          fields: scene.fields.map((f) => (f.id === IDS.cat ? { ...f, name: 'kitty' } : f)),
        },
      ],
    };
    act(() => host.external(renamed, 'Rename cat to kitty', 'load'));
    expect(screen.getByRole('treeitem', { name: 'kitty say Hello add detail' })).toBeTruthy();
    expect(screen.queryByRole('treeitem', { name: 'cat say Hello add detail' })).toBeNull();
  });
});
