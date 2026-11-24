import { applyEdits, nodeId, type ListenerDecl, type Program } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { TileEditor } from './editor.tsx';
import { fixture, IDS } from './fixture.ts';

// A listener's keys, one at a time (the owner, 24 Nov 2026): "or ▾" after the last adds another,
// and each key's menu takes it out; taking the last out takes the setting out.

const LISTENER = nodeId('arrowl');

function withArrows(...keys: string[]): Program {
  const listener: ListenerDecl = {
    id: LISTENER,
    kind: 'listener',
    event: 'arrowKeyPress',
    args: {},
    details: {
      keys: {
        id: nodeId('keyset'),
        kind: 'arrayOf',
        of: { kind: 'story', name: 'Key' },
        items: keys.map((k) => ({
          id: nodeId(`k${k.padEnd(5, '0').slice(0, 5)}`),
          kind: 'enum',
          type: 'Key',
          value: k,
        })),
      },
    },
    params: [],
    body: [],
  };
  return applyEdits(fixture(), [
    { kind: 'declare', parent: IDS.scene, index: 0, node: listener, label: '' },
  ]);
}

let editor: TileEditor | null = null;
let mounted: HTMLElement | null = null;
afterEach(() => {
  if (editor) act(() => void editor!.unmount());
  editor = null;
  mounted?.remove();
  mounted = null;
});

function open(program: Program) {
  const host = new TestHost(program, { apply: (p, edits) => applyEdits(p, edits) });
  const element = document.createElement('div');
  document.body.append(element);
  mounted = element;
  editor = new TileEditor();
  act(() => editor!.mount(element, host, { method: LISTENER, selection: [], focus: null }));
  return host;
}

const keysOf = (host: TestHost) => {
  const listener = host.program().types[0]!.listeners.find((l) => l.id === LISTENER)!;
  const keys = listener.details['keys'];
  return keys?.kind === 'arrayOf'
    ? keys.items.map((k) => (k.kind === 'enum' ? k.value : ''))
    : null;
};
const title = () => (document.querySelector('.tl-title')?.textContent ?? '').replace(/\s+/g, ' ');

describe('a listener’s keys in Tiles, one at a time', () => {
  it('adds which keys from the event’s own "add detail ▾", choosing a key at once', async () => {
    const user = userEvent.setup();
    const host = open(
      applyEdits(withArrows('up'), [
        {
          kind: 'setArgument',
          node: LISTENER,
          slot: 'details',
          param: 'keys',
          value: null,
          label: '',
        },
      ]),
    );
    expect(title()).toContain('when an arrow key is pressed');
    await user.click(screen.getByRole('button', { name: 'add detail' }));
    await user.click(await screen.findByRole('menuitem', { name: 'which keys' }));
    expect(screen.queryByText('A new, empty list')).toBeNull();
    await user.click(await screen.findByRole('menuitem', { name: /right arrow/ }));
    expect(keysOf(host)).toEqual(['right']);
    expect(title()).toContain('when right arrow');
  });

  it('adds another with or ▾, offering only those not chosen', async () => {
    const user = userEvent.setup();
    const host = open(withArrows('up'));
    await user.click(screen.getByRole('button', { name: 'or, add another to which keys' }));
    const menu = await screen.findByRole('menu');
    expect(screen.queryByRole('menuitem', { name: 'up arrow' })).toBeNull();
    await user.click(screen.getByRole('menuitem', { name: /left arrow/ }));
    expect(menu.isConnected).toBe(false);
    expect(keysOf(host)).toEqual(['up', 'left']);
    expect(title()).toContain('when up arrow or left arrow');
    expect(host.undoLabel()).toBe('Add left arrow to when up arrow is pressed');
  });

  it('takes one out, and the setting with the last one', async () => {
    const user = userEvent.setup();
    const host = open(withArrows('up', 'left'));
    await user.click(screen.getByRole('button', { name: /^up arrow/ }));
    await user.click(await screen.findByText('Take up arrow out'));
    expect(keysOf(host)).toEqual(['left']);
    await user.click(screen.getByRole('button', { name: /^left arrow/ }));
    await user.click(await screen.findByText('Take left arrow out'));
    expect(keysOf(host)).toBeNull();
    expect(title()).toContain('when an arrow key is pressed');
  });
});
