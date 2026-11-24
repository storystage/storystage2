import type { Expression, ListenerDecl, Program } from '@storystage/ast';
import { applyEdits, nodeId } from '@storystage/ast';
import { describer } from '@storystage/story-api/editing';
import { describe, expect, it } from 'vitest';
import { fixture, IDS } from './fixture.ts';
import { partsOf } from './parts.ts';

// A click listener's row names what's clicked (the owner, 23 Nov 2026), a pill for each object.

const ref = (id: string, field: string): Expression => ({
  id: nodeId(id),
  kind: 'fieldRef',
  target: { id: nodeId(`${id.slice(0, 5)}t`), kind: 'this' },
  field: nodeId(field),
});

function withClick(items: Expression[] | null): { program: Program; listener: ListenerDecl } {
  const listener: ListenerDecl = {
    id: nodeId('clickl'),
    kind: 'listener',
    event: 'clickOnObject',
    args: {},
    details:
      items === null
        ? {}
        : {
            setOfVisuals: {
              id: nodeId('visset'),
              kind: 'arrayOf',
              of: { kind: 'story', name: 'Thing' },
              items,
            },
          },
    params: [],
    body: [],
  };
  const program = applyEdits(fixture(), [
    { kind: 'declare', parent: IDS.scene, index: 0, node: listener, label: '' },
  ]);
  return { program, listener };
}

const row = (program: Program, listener: ListenerDecl) => partsOf(listener, describer(program));

describe('a click listener’s row in Tiles', () => {
  it('names each object clicked, as a pill of its own', () => {
    const { program, listener } = withClick([ref('vcat01', IDS.cat), ref('vchr01', IDS.chair)]);
    const parts = row(program, listener);
    // "or ▾" after the last adds another (the owner, 24 Nov 2026).
    expect(parts.map((p) => p.text).join(' ')).toBe('when cat or chair or is clicked');
    const pills = parts.filter((p) => p.kind === 'value');
    expect(pills.map((p) => p.node)).toEqual([
      nodeId('vcat01'),
      nodeId('vchr01'),
      nodeId('visset'),
    ]);
    expect(pills[1]).toMatchObject({
      place: { kind: 'value', node: nodeId('visset'), slot: 'items', param: '1' },
    });
    expect(pills[2]).toMatchObject({
      arrow: '▾',
      label: 'add another to which objects',
      empty: true,
      place: { kind: 'value', node: nodeId('visset'), slot: 'items', param: '2' },
    });
    // Its name is the describer's words, as every row's is.
    expect(describer(program)(listener)).toBe('when cat or chair is clicked');
  });

  it('reads an empty list as the event, with a pill to choose one (24 Nov 2026)', () => {
    const { program, listener } = withClick([]);
    const parts = row(program, listener);
    expect(parts.map((p) => p.text).join(' ')).toBe(
      'when an object is clicked which objects an empty list',
    );
    expect(parts.at(-1)).toMatchObject({
      kind: 'value',
      empty: true,
      place: { kind: 'value', node: nodeId('clickl'), slot: 'details', param: 'setOfVisuals' },
    });
  });

  it('says an object, with none chosen', () => {
    const { program, listener } = withClick(null);
    expect(
      row(program, listener)
        .map((p) => p.text)
        .join(' '),
    ).toBe('when an object is clicked');
  });
});
