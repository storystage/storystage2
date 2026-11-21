import { applyEdits, nodeId, type Program } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { addParameter } from '@storystage/story-api/editing';
import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TileEditor } from './editor.tsx';
import { fixture, IDS } from './fixture.ts';

// A learner's procedure with inputs (decision 0074, workplan 7.14): Tiles shows them after its
// name, in the learner's word, and a call to it has a pill for each.

const WADDLE = nodeId('waddle');

/** The fixture with a procedure `waddle` taking `steps`, called once from the scene's script. */
function withWaddle(): Program {
  const base = fixture();
  const scene = base.types[0]!;
  const declared = applyEdits(base, [
    {
      kind: 'declare',
      parent: scene.id,
      index: scene.methods.length,
      node: { id: WADDLE, kind: 'method', name: 'waddle', returns: null, params: [], body: [] },
      label: '',
    },
    {
      kind: 'insert',
      parent: IDS.main,
      slot: 'body',
      index: 0,
      node: {
        id: nodeId('callwd'),
        kind: 'call',
        target: { id: nodeId('thiswd'), kind: 'this' },
        callee: { kind: 'user', method: WADDLE },
        args: {},
        details: {},
      },
      label: '',
    },
  ]);
  const added = addParameter(declared, WADDLE, 'steps', { kind: 'story', name: 'WholeNumber' })!;
  return applyEdits(declared, added.edits);
}

let editor: TileEditor | null = null;

function open(program: Program, method: typeof IDS.main) {
  const host = new TestHost(program, { apply: (p, edits) => applyEdits(p, edits) });
  const element = document.createElement('div');
  document.body.append(element);
  editor = new TileEditor();
  act(() => editor!.mount(element, host, { method, selection: [], focus: null }));
}

afterEach(() => {
  if (editor) act(() => void editor!.unmount());
  editor = null;
  document.body.innerHTML = '';
});

const words = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('a procedure’s inputs in Tiles (0074)', () => {
  it('shows them after its name, and says them as inputs', () => {
    open(withWaddle(), WADDLE);
    const title = document.querySelector('.tl-title')!;
    expect(words(title)).toBe('Scene1.waddle, inputs: steps: whole number');
    expect(screen.getByText('steps: whole number').className).toBe('tl-input');
  });

  it('gives a call already in the code a pill for the new input, with its starting value', () => {
    open(withWaddle(), IDS.main);
    const row = document.querySelector<HTMLElement>('[data-key="callwd"]')!;
    expect(words(row)).toContain('waddle steps 1');
  });
});
