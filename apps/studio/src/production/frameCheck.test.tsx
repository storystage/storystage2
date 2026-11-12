import { nodeId, type NodeId, type Statement } from '@storystage/ast';
import { basisFor } from '@storystage/check';
import type { EditorHost } from '@storystage/editor-contract';
import { exampleProduction, type Frame, type Production } from '@storystage/production';
import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import type { ModelSource } from '@storystage/stage/babylon';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY } from '@storystage/story-api';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import type { Place } from '../storyboard/place.ts';
import { useStudio, type Studio } from '../studio.ts';
import { NONE_REHEARSED, type Rehearsed } from './frameProgress.ts';
import { ProductionStage } from './ProductionStage.tsx';

// The frame's automatic check on the Production stage (spec 08 sections 9.1, 9.5, 9.6): Check this
// frame on S2's real runner, a fake stage and a real runtime; the checklist and Keep it.

vi.mock('@storystage/blocks', () => ({
  createBlocksEditor: () => ({
    id: 'blocks',
    displayName: 'Blocks',
    mount: (element: HTMLElement) => void (element.textContent = 'blocks'),
    unmount: () => ({ method: null, selection: [], focus: null }),
    openMethod: () => {},
    setPalette: () => {},
    highlight: () => {},
    focus: () => {},
    selection: () => [],
    command: () => false,
  }),
}));

const models: ModelSourceHandle = {
  source: {} as ModelSource,
  prepare: async () => undefined,
  item: () => undefined,
  refused: [],
};
const host = { program: () => exampleProduction().program } as unknown as EditorHost;

function stage(production: Production, editorHost: EditorHost = host) {
  const onReveal = vi.fn<(node: NodeId) => void>();
  const onPlaceChange = vi.fn<(place: Place) => void>();
  const onGoToStoryboard = vi.fn();
  let latest: Studio | null = null;
  const makeStage: StageMaker = async () => new FakeStage() as Stage;
  const startWorker = () => {
    const { main, worker } = inMemoryPorts();
    const timers: Timers = { now: () => 0, every: () => () => undefined };
    serve(worker, STORY_LIBRARY, timers);
    return { port: main, terminate: () => {} };
  };
  function View() {
    const studio = useStudio(production);
    latest = studio;
    const [r, setR] = useState<Rehearsed>(NONE_REHEARSED);
    const p = studio.production;
    return (
      <ThemeRoot>
        <ProductionStage
          production={p}
          scene={p.scenes[0]!.id}
          frame={p.frames.find((f) => f.scene === p.scenes[0]!.id)!.id}
          host={editorHost}
          onGoToStoryboard={onGoToStoryboard}
          announcement=""
          models={models}
          makeStage={makeStage}
          startWorker={startWorker}
          onPlaceChange={onPlaceChange}
          rehearsed={r}
          onRehearsed={setR}
          studio={studio}
          onReveal={onReveal}
        />
      </ThemeRoot>
    );
  }
  render(<View />);
  return { onReveal, onPlaceChange, onGoToStoryboard, studio: () => latest! };
}

const example = exampleProduction();
const first = example.frames.find((f) => f.scene === example.scenes[0]!.id)!;
const block = first.links[0]!;
const flag = {
  id: 'onScreen:fox',
  kind: 'onScreen',
  outcome: 'flag',
  words: 'Fox isn’t on screen at the end of this frame',
  node: block,
  sketch: first.sketches[0]?.id ?? 's1',
} as const;
const passed = {
  id: 'length',
  kind: 'length',
  outcome: 'passed',
  words: 'This frame lasts about 3 seconds, as planned',
} as const;

/** The example with frame 1.1 given a saved check. */
function withCheck(check: Frame['check']): Production {
  return {
    ...example,
    frames: example.frames.map((f) => (f.id === first.id ? { ...f, check } : f)),
  };
}

const card = () => screen.getByRole('region', { name: 'Automatic check: frame 1.1' });
const strip = () => screen.getByRole('listbox', { name: 'Frames' });

describe('the frame’s automatic check (spec 08 section 9)', () => {
  it('says the frame isn’t checked yet, then checks it on a hidden stage', async () => {
    const user = userEvent.setup();
    const { studio } = stage(example);
    expect(within(card()).getByText(/^Not checked yet/)).toBeTruthy();
    await user.click(within(card()).getByRole('button', { name: 'Check this frame' }));
    await waitFor(
      () => expect(studio().production.frames.find((f) => f.id === first.id)!.check).toBeTruthy(),
      {
        timeout: 4000,
      },
    );
    // Only this frame's result is saved, and it's no undo step.
    expect(studio().production.frames.filter((f) => f.check)).toHaveLength(1);
    expect(studio().undoLabel).toBeNull();
    expect(within(card()).queryByText(/^Not checked yet/)).toBeNull();
    expect(within(card()).getAllByRole('listitem').length).toBeGreaterThan(0);
  });

  it('lists flags first, goes to the block or the sketch, and keeps a flag as an undo step', async () => {
    const user = userEvent.setup();
    const p = withCheck({ basis: basisFor(example, first), items: [passed, flag], kept: [] });
    const { onReveal, onGoToStoryboard, onPlaceChange, studio } = stage(p);
    const items = within(card()).getAllByRole('listitem');
    expect(items[0]!.textContent).toContain(flag.words);
    expect(within(card()).getByText('One thing to look at.')).toBeTruthy();
    expect(within(strip()).getAllByRole('option')[0]!.textContent).toMatch(/Look at/);

    await user.click(
      within(card()).getByRole('button', { name: `Go to the block: ${flag.words}` }),
    );
    expect(onReveal).toHaveBeenCalledWith(block);
    await user.click(
      within(card()).getByRole('button', { name: `Go to the sketch: ${flag.words}` }),
    );
    expect(onPlaceChange).toHaveBeenLastCalledWith({ scene: first.scene, frame: first.id });
    expect(onGoToStoryboard).toHaveBeenCalled();

    await user.click(within(card()).getByRole('button', { name: `Keep it: ${flag.words}` }));
    expect(studio().undoLabel).toBe('Keep the flag on frame 1.1');
    expect(
      within(card()).getByRole('button', { name: `Kept: ${flag.words}. Let it go` }),
    ).toBeTruthy();
    expect(within(strip()).getAllByRole('option')[0]!.textContent).toMatch(/Checked/);
  });

  it('marks a result from before the last change, and the strip goes back to the studio’s status', () => {
    stage(withCheck({ basis: 'before', items: [flag], kept: [] }));
    expect(within(card()).getByText(/^From before your last change/)).toBeTruthy();
    expect(within(strip()).getAllByRole('option')[0]!.textContent).toMatch(/Coded/);
  });

  it('offers no Keep it, and no check, on a film that can’t be changed', async () => {
    const p = withCheck({ basis: basisFor(example, first), items: [flag], kept: [] });
    const { studio } = stage(p);
    await act(async () => studio().open(p, 'It’s handed in.'));
    expect(within(card()).queryByRole('button', { name: /^Keep it/ })).toBeNull();
    expect(
      within(card()).getByRole('button', { name: 'Check this frame' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('doesn’t link a block or sketch that has gone', () => {
    const gone = { ...flag, node: nodeId('gone'), sketch: 'gone' };
    stage(withCheck({ basis: basisFor(example, first), items: [gone], kept: [] }));
    expect(within(card()).queryByRole('button', { name: /^Go to the block/ })).toBeNull();
    expect(within(card()).queryByRole('button', { name: /^Go to the sketch/ })).toBeNull();
    expect(within(card()).getByRole('button', { name: `Keep it: ${flag.words}` })).toBeTruthy();
  });
});

describe('Use the script’s words (#357)', () => {
  it('puts the script line’s words in the speak line, as one program edit', async () => {
    const user = userEvent.setup();
    const line = example.script.find((l) => l.scene === first.scene)!;
    const speak: Statement = {
      id: nodeId('speakb'),
      kind: 'call',
      target: {
        id: nodeId('speakr'),
        kind: 'fieldRef',
        target: { id: nodeId('speaks'), kind: 'this' },
        field: nodeId('scene1p'),
      },
      callee: { kind: 'story', name: 'speakLine' },
      args: { text: { id: nodeId('speakx'), kind: 'text', value: 'Something else' } },
      details: { line: { id: nodeId('speakl'), kind: 'text', value: line.id } },
    };
    const [type, ...types] = example.program.types;
    const method = type!.methods[0]!;
    const withSpeak: Production = {
      ...example,
      program: {
        ...example.program,
        types: [
          {
            ...type!,
            methods: [{ ...method, body: [...method.body, speak] }, ...type!.methods.slice(1)],
          },
          ...types,
        ],
      },
    };
    const item = {
      id: `speak:${speak.id}`,
      kind: 'line',
      outcome: 'flag',
      words: 'Penguin’s words aren’t the same as line 1.1 in the script',
      node: speak.id,
      line: line.id,
    } as const;
    const frame = withSpeak.frames.find((f) => f.id === first.id)!;
    const p: Production = {
      ...withSpeak,
      frames: withSpeak.frames.map((f) =>
        f.id === first.id
          ? { ...f, check: { basis: basisFor(withSpeak, frame, [item]), items: [item], kept: [] } }
          : f,
      ),
    };
    const apply = vi.fn<EditorHost['apply']>(
      () => ({ ok: true }) as ReturnType<EditorHost['apply']>,
    );
    stage(p, { ...host, apply });
    await user.click(
      within(card()).getByRole('button', { name: `Use the script’s words: ${item.words}` }),
    );
    expect(apply).toHaveBeenCalledOnce();
    const [edits, label, source] = apply.mock.calls[0]!;
    expect(edits[0]).toMatchObject({
      kind: 'setArgument',
      node: speak.id,
      param: 'text',
      value: { kind: 'text', value: line.text },
    });
    expect(label).toBe('Use the script’s words for line 1.1');
    expect(source).toBe('blocks');
  });
});

describe('Objects in this scene (07-ux 7.2)', () => {
  const panel = () => screen.getByRole('region', { name: 'Objects in this scene' });

  it('lists the scene’s objects, and a typed place moves one as one undo step', async () => {
    const user = userEvent.setup();
    const { studio } = stage(example);
    const list = within(panel()).getByRole('listbox', { name: 'Objects in this scene' });
    const names = within(list)
      .getAllByRole('option')
      .map((o) => o.querySelector('.pr-object-name')?.textContent);
    expect(names).toEqual(['penguin', 'fox']);
    await user.click(within(list).getByRole('option', { name: /penguin/ }));
    const x = within(panel()).getByRole('textbox', { name: 'x (m)' });
    await user.clear(x);
    await user.type(x, '2.5');
    await user.tab();
    const penguin = () =>
      studio().production.scenes[0]!.setup.objects.find((o) => o.id === 'penguin')!;
    expect(penguin().transform.position.x).toBe(2.5);
    expect(studio().undoLabel).toBe('Move penguin');
    // The typing was one step: one Undo puts it back.
    await act(async () => studio().undo());
    expect(penguin().transform.position.x).toBe(
      example.scenes[0]!.setup.objects.find((o) => o.id === 'penguin')!.transform.position.x,
    );
  });

  it('turns and resizes, each named for what it did', async () => {
    const user = userEvent.setup();
    const { studio } = stage(example);
    await user.click(within(panel()).getByRole('option', { name: /fox/ }));
    const turn = within(panel()).getByRole('textbox', { name: 'Turn (turns)' });
    await user.clear(turn);
    await user.type(turn, '0.25');
    await user.tab();
    expect(studio().undoLabel).toBe('Turn fox');
    const size = within(panel()).getByRole('textbox', { name: 'Size' });
    await user.clear(size);
    await user.type(size, '2');
    await user.tab();
    expect(studio().undoLabel).toBe('Resize fox');
    const fox = studio().production.scenes[0]!.setup.objects.find((o) => o.id === 'fox')!;
    expect(fox.transform.scale).toEqual({ x: 2, y: 2, z: 2 });
  });
});
