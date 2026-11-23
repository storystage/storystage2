import type { ListenerDecl } from '@storystage/ast';
import { applyEdits, nodeId } from '@storystage/ast';
import { describer } from '@storystage/story-api/editing';
import { describe, expect, it } from 'vitest';
import { fixture, IDS } from './fixture.ts';
import { partsOf } from './parts.ts';

// Which keys a key listener is for (spec 02, section 6a): each key is a pill of its own.

describe('a key listener’s row in Tiles', () => {
  it('names each key, as a pill of its own', () => {
    const listener: ListenerDecl = {
      id: nodeId('keysl1'),
      kind: 'listener',
      event: 'keyPress',
      args: {},
      details: {
        keys: {
          id: nodeId('keyset'),
          kind: 'arrayOf',
          of: { kind: 'story', name: 'Key' },
          items: [
            { id: nodeId('keyw01'), kind: 'enum', type: 'Key', value: 'w' },
            { id: nodeId('keyup1'), kind: 'enum', type: 'Key', value: 'up' },
          ],
        },
      },
      params: [],
      body: [],
    };
    const program = applyEdits(fixture(), [
      { kind: 'declare', parent: IDS.scene, index: 0, node: listener, label: '' },
    ]);
    const parts = partsOf(listener, describer(program));
    expect(parts.map((p) => p.text).join(' ')).toBe('when W or up arrow is pressed');
    expect(parts.filter((p) => p.kind === 'value').map((p) => p.node)).toEqual([
      nodeId('keyw01'),
      nodeId('keyup1'),
    ]);
  });
});
