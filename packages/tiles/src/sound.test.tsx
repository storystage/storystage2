import { applyEdits, nodeId, type Expression, type Program } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ValueMenu } from './cascade.ts';
import { TileEditor, type TileEditorOptions } from './editor.tsx';
import { fixture, IDS } from './fixture.ts';

// Choosing a block's sound (decision 0076, workplan 7.17): the studio gives the film's sounds
// and their labels; a sound is written as its id and shown by its label.

const PLAY = nodeId('playsd');

/** The fixture with the cat playing `sound`, or an empty sound, first in its script. */
function withPlay(sound?: string): Program {
  const value: Expression = sound
    ? { id: nodeId('soundv'), kind: 'text', value: sound }
    : { id: nodeId('soundv'), kind: 'none' };
  return applyEdits(fixture(), [
    {
      kind: 'insert',
      parent: IDS.main,
      slot: 'body',
      index: 0,
      label: '',
      node: {
        id: PLAY,
        kind: 'call',
        target: {
          id: nodeId('catply'),
          kind: 'fieldRef',
          target: { id: nodeId('thisply'), kind: 'this' },
          field: IDS.cat,
        },
        callee: { kind: 'story', name: 'playAudio' },
        args: { audioSource: value },
        details: {},
      },
    },
  ]);
}

const SOUNDS = [
  { value: 'sn1', words: 'Splash' },
  { value: 'kenney-audio/Sound/door-creak', words: 'Door' },
];
const studio: TileEditorOptions = {
  references: (type) => (type === 'Audio' ? SOUNDS : []),
  referenceWord: (type, value) =>
    type === 'Audio' ? SOUNDS.find((s) => s.value === value)?.words : undefined,
};

function anchor() {
  const button = document.createElement('button');
  document.body.append(button);
  return button;
}

let editor: TileEditor | null = null;
let mounted: HTMLElement | null = null;
// Only what this file mounts itself: Testing Library cleans up what it renders.
afterEach(() => {
  if (editor) act(() => void editor!.unmount());
  editor = null;
  mounted?.remove();
  mounted = null;
});

describe('a block’s sound in Tiles (7.17)', () => {
  it('offers the film’s sounds by label, and chooses one by its id', async () => {
    const onChoose = vi.fn<(value: Expression) => void>();
    render(
      <ValueMenu
        program={withPlay()}
        place={{ kind: 'value', node: PLAY, slot: 'args', param: 'audioSource' }}
        label="sound"
        anchor={anchor()}
        options={studio}
        onChoose={onChoose}
        onAsk={() => undefined}
        onClose={() => undefined}
      />,
    );
    await screen.findByRole('menu', { name: 'sound' });
    expect(screen.getByRole('menuitem', { name: 'Door' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('menuitem', { name: 'Splash' }));
    expect(onChoose).toHaveBeenCalledWith(expect.objectContaining({ kind: 'text', value: 'sn1' }));
  });

  it('says where sounds come from when the film has none', async () => {
    render(
      <ValueMenu
        program={withPlay()}
        place={{ kind: 'value', node: PLAY, slot: 'args', param: 'audioSource' }}
        label="sound"
        anchor={anchor()}
        onChoose={() => undefined}
        onAsk={() => undefined}
        onClose={() => undefined}
      />,
    );
    await screen.findByRole('menu', { name: 'sound' });
    const note = screen.getByRole('menuitem', { name: /No sounds in this film yet/ });
    expect(note.getAttribute('aria-disabled')).toBe('true');
  });

  it('shows a chosen sound by its label on the block', () => {
    const host = new TestHost(withPlay('sn1'), { apply: (p, edits) => applyEdits(p, edits) });
    const element = document.createElement('div');
    document.body.append(element);
    mounted = element;
    editor = new TileEditor(studio);
    act(() => editor!.mount(element, host, { method: IDS.main, selection: [], focus: null }));
    const row = document.querySelector<HTMLElement>(`[data-key="${PLAY}"]`)!;
    expect((row.textContent ?? '').replace(/\s+/g, ' ')).toContain('play Splash');
    expect(row.textContent).not.toContain('sn1');
  });
});
