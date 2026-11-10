import { walk, type NodeId } from '@storystage/ast';
import type { EditorHost, ViewState } from '@storystage/editor-contract';
import { exampleProduction, type Production } from '@storystage/production';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { methodHolding, sceneMethods } from './CodeEditor.tsx';
import { ProductionStage } from './ProductionStage.tsx';

// Screening's Fix opens the block in the Code editor (spec 08, 11.1): its method's tab, with
// keyboard focus on it. Blockly can't draw here: a stand-in records the view it's opened with.

const opened: ViewState[] = [];
vi.mock('@storystage/blocks', () => ({
  createBlocksEditor: () => ({
    id: 'blocks',
    displayName: 'Blocks',
    mount: (element: HTMLElement, _host: EditorHost, view?: ViewState) => {
      element.textContent = 'blocks';
      if (view) opened.push(view);
    },
    unmount: () => ({ method: null, selection: [], focus: null }),
    openMethod: () => {},
    setPalette: () => {},
    highlight: () => {},
    focus: () => {},
    selection: () => [],
    command: () => false,
  }),
}));

beforeEach(() => {
  opened.length = 0;
});

/**
 * The example, its first scene's type given a second method (a copy of the script method with
 * fresh ids), so a block can be in a tab other than the first.
 */
function withSecondMethod(): Production {
  const base = exampleProduction();
  const script = base.scenes[0]!.method;
  const types = base.program.types.map((t) => {
    const first = t.methods.find((m) => m.id === script);
    if (!first) return t;
    const copy = JSON.parse(
      JSON.stringify(first).replace(/"id":"([^"]+)"/g, '"id":"$1-again"'),
    ) as typeof first;
    return { ...t, methods: [...t.methods, { ...copy, name: 'again' }] };
  });
  return { ...base, program: { ...base.program, types } };
}

const p = withSecondMethod();
const scene = p.scenes[0]!.id;
const methods = sceneMethods(p, scene);

/** A node deep inside the scene's last method, and that method. */
function blockIn(index: number): { method: NodeId; node: NodeId } {
  const method = methods[index]!;
  let deepest: NodeId = method.id;
  walk(method, (n) => {
    deepest = n.id;
  });
  return { method: method.id, node: deepest };
}

describe('methodHolding', () => {
  it('finds the method a node is in, and nothing for a node outside them', () => {
    const { method, node } = blockIn(methods.length - 1);
    expect(methodHolding(p, methods, node)).toBe(method);
    expect(methodHolding(p, methods, method)).toBe(method);
    expect(methodHolding(p, methods, 'nowhere' as NodeId)).toBeNull();
  });
});

describe('the Code editor opened at a block', () => {
  it('opens the block’s method, with focus on the block', async () => {
    expect(methods.length).toBeGreaterThan(1);
    const { method, node } = blockIn(methods.length - 1);
    render(
      <ProductionStage
        production={p}
        scene={scene}
        host={{} as EditorHost}
        onGoToStoryboard={() => {}}
        announcement=""
        reveal={{ node, n: 1 }}
      />,
    );
    const tab = await screen.findByRole('tab', { selected: true });
    expect(tab.getAttribute('data-key') ?? tab.id).toContain(method);
    await waitFor(() => expect(opened.at(-1)).toEqual({ method, selection: [node], focus: node }));
  });

  it('opens on the scene’s first method otherwise', async () => {
    render(
      <ProductionStage
        production={p}
        scene={scene}
        host={{} as EditorHost}
        onGoToStoryboard={() => {}}
        announcement=""
      />,
    );
    await waitFor(() =>
      expect(opened.at(-1)).toEqual({ method: methods[0]!.id, selection: [], focus: null }),
    );
  });
});
