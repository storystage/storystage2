import { nodeId, type Expression, type NodeId, type Statement } from '@storystage/ast';
import type { EditorHost, HighlightKind, HighlightMark } from '@storystage/editor-contract';
import { exampleProduction, type Production } from '@storystage/production';
import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import type { ModelSource } from '@storystage/stage/babylon';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY } from '@storystage/story-api';
import { ThemeRoot } from '@storystage/ui';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StageMaker } from '../stage/makeStage.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import type { Place } from '../storyboard/place.ts';
import { NONE_REHEARSED, type Rehearsed } from './frameProgress.ts';
import { ProductionStage } from './ProductionStage.tsx';
import type { Voices } from '../speech/voices.ts';

// The scene view and Rehearse (07-ux 7.2, 7.4) on a fake stage and a real runtime. Blockly can't
// draw here, so a stand-in Blocks editor records the highlights it's given.
const marks: { kind: HighlightKind; marks: readonly HighlightMark[] }[] = [];
let selected: NodeId[] = [];
vi.mock('@storystage/blocks', () => ({
  createBlocksEditor: () => ({
    id: 'blocks',
    displayName: 'Blocks',
    mount: (element: HTMLElement) => void (element.textContent = 'blocks'),
    unmount: () => ({ method: null, selection: [], focus: null }),
    openMethod: () => {},
    setPalette: () => {},
    highlight: (m: readonly HighlightMark[], kind: HighlightKind) => marks.push({ kind, marks: m }),
    focus: () => {},
    selection: () => selected,
    command: () => false,
  }),
}));

beforeEach(() => {
  marks.length = 0;
  selected = [];
});

let counter = 0;
const id = (): NodeId => nodeId(`v${(counter++).toString(36).padStart(5, '0')}`);
const self = (): Expression => ({ id: id(), kind: 'this' });
const say = (text: Expression): Statement => ({
  id: id(),
  kind: 'call',
  target: { id: id(), kind: 'fieldRef', target: self(), field: nodeId('scene1p') },
  callee: { kind: 'story', name: 'say' },
  args: { text },
  details: {},
});
const words = (value: string): Expression => ({ id: id(), kind: 'text', value });

function withSceneOne(body: readonly Statement[], p = exampleProduction()): Production {
  const [first, ...rest] = p.program.types;
  const method = { ...first!.methods[0]!, body };
  return {
    ...p,
    program: { ...p.program, types: [{ ...first!, methods: [method], listeners: [] }, ...rest] },
  };
}

const models: ModelSourceHandle = {
  source: {} as ModelSource,
  prepare: async () => undefined,
  item: () => undefined,
  refused: [],
};
const host = { program: () => exampleProduction().program } as unknown as EditorHost;

function harness(production: Production) {
  const stages: FakeStage[] = [];
  let workers = 0;
  let ended = 0;
  const makeStage: StageMaker = async () => {
    const stage = new FakeStage();
    stages.push(stage);
    return stage as Stage;
  };
  const startWorker = () => {
    workers++;
    const { main, worker } = inMemoryPorts();
    const timers: Timers = { now: () => 0, every: () => () => undefined };
    serve(worker, STORY_LIBRARY, timers);
    return { port: main, terminate: () => ended++ };
  };
  const onAnnounce = vi.fn<(text: string) => void>();
  const view = (p: Production) => (
    <ThemeRoot>
      <ProductionStage
        production={p}
        scene={p.scenes[0]!.id}
        host={host}
        onGoToStoryboard={() => {}}
        announcement=""
        models={models}
        onAnnounce={onAnnounce}
        makeStage={makeStage}
        startWorker={startWorker}
      />
    </ThemeRoot>
  );
  const result = render(view(production));
  return {
    stages,
    onAnnounce,
    workers: () => workers,
    ended: () => ended,
    rerender: (p: Production) => result.rerender(view(p)),
  };
}

const said = (onAnnounce: ReturnType<typeof vi.fn>) => onAnnounce.mock.calls.map((c) => c[0]);

describe('the scene view (07-ux 7.2)', () => {
  it('shows the scene’s set-up on a stage of its own, titled with the scene', async () => {
    const p = exampleProduction();
    const { stages } = harness(p);
    expect(await screen.findByRole('region', { name: 'Scene view' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /^Scene 1: / })).toBeTruthy();
    await waitFor(() =>
      expect(stages[0]?.calls.find((c) => c.method === 'load')?.args[0]).toEqual(
        p.scenes[0]!.setup,
      ),
    );
  });
});

describe('Rehearse (07-ux 7.4)', () => {
  it('plays the scene, highlights the blocks running, and Stop puts the set-up back', async () => {
    const user = userEvent.setup();
    const first = say(words('Hello there, fox.'));
    const p = withSceneOne([first]);
    const { stages, onAnnounce, ended } = harness(p);
    const rehearse = await screen.findByRole('button', { name: 'Rehearse' });
    await waitFor(() => expect(rehearse.hasAttribute('disabled')).toBe(false));
    await user.click(rehearse);
    await waitFor(() =>
      expect(marks.some((m) => m.kind === 'rehearse' && m.marks[0]?.node === first.id)).toBe(true),
    );
    expect(screen.getByRole('radiogroup', { name: 'Speed' })).toBeTruthy();
    const loadsBefore = stages[0]!.calls.filter((c) => c.method === 'load').length;
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    await screen.findByRole('button', { name: 'Rehearse' });
    expect(stages[0]!.calls.filter((c) => c.method === 'load').length).toBe(loadsBefore + 1);
    expect(said(onAnnounce)).toContain('Stopped. The scene is back as it was set up.');
    expect(ended()).toBe(1);
    // Nothing running now: the editor's rehearse marks are cleared.
    expect(marks.filter((m) => m.kind === 'rehearse').at(-1)?.marks).toEqual([]);
  });

  it('stops at an error, marks its block with the words, and says it', async () => {
    const user = userEvent.setup();
    const bad = say({ id: id(), kind: 'number', value: 3 });
    const { onAnnounce } = harness(withSceneOne([bad]));
    const rehearse = await screen.findByRole('button', { name: 'Rehearse' });
    await waitFor(() => expect(rehearse.hasAttribute('disabled')).toBe(false));
    await user.click(rehearse);
    expect(await screen.findByText(/^Rehearse stopped: /)).toBeTruthy();
    const error = marks.filter((m) => m.kind === 'error').at(-1)!;
    expect(error.marks[0]?.node).toBe(bad.id);
    expect(error.marks[0]?.message).toMatch(/\w/);
    expect(said(onAnnounce).some((s) => s.startsWith('Rehearse stopped: '))).toBe(true);
  });

  it('is unavailable while the stage is empty, and says why', async () => {
    const p = exampleProduction();
    const empty: Production = {
      ...p,
      scenes: p.scenes.map((s, i) => (i === 0 ? { ...s, setup: { ...s.setup, objects: [] } } : s)),
    };
    harness(empty);
    const rehearse = await screen.findByRole('button', { name: 'Rehearse' });
    expect(rehearse.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/^Nothing on the stage yet/)).toBeTruthy();
  });

  it('asks for a block before Rehearse to here, then pauses at the one chosen', async () => {
    const user = userEvent.setup();
    const last = say(words('Three'));
    const { onAnnounce } = harness(withSceneOne([say(words('One')), say(words('Two')), last]));
    const toHere = await screen.findByRole('button', { name: 'Rehearse to here' });
    await waitFor(() => expect(toHere.hasAttribute('disabled')).toBe(false));
    await user.click(toHere);
    expect(
      screen.getByText('Choose a block in the code first, then Rehearse to here.'),
    ).toBeTruthy();
    selected = [last.id];
    await user.click(toHere);
    await screen.findByRole('button', { name: 'Play' });
    expect(said(onAnnounce)).toContain('Paused at the block you chose.');
    expect(marks.filter((m) => m.kind === 'rehearse').at(-1)?.marks).toContainEqual({
      node: last.id,
    });
  });

  it('stops when the code changes while it runs, and says so', async () => {
    const user = userEvent.setup();
    const p = withSceneOne([say(words('A long line, said slowly, for the fox to hear.'))]);
    const { onAnnounce, rerender, ended } = harness(p);
    const rehearse = await screen.findByRole('button', { name: 'Rehearse' });
    await waitFor(() => expect(rehearse.hasAttribute('disabled')).toBe(false));
    await user.click(rehearse);
    await screen.findByRole('button', { name: 'Stop' });
    rerender(withSceneOne([say(words('Changed.'))], p));
    await screen.findByRole('button', { name: 'Rehearse' });
    expect(said(onAnnounce)).toContain('Rehearse stopped because the code changed.');
    expect(ended()).toBe(1);
  });
});

describe('the frame strip (07-ux 7.1)', () => {
  function strip(production: Production) {
    let rehearsed: Rehearsed = NONE_REHEARSED;
    const onPlaceChange = vi.fn<(place: Place) => void>();
    const makeStage: StageMaker = async () => new FakeStage() as Stage;
    const startWorker = () => {
      const { main, worker } = inMemoryPorts();
      const timers: Timers = { now: () => 0, every: () => () => undefined };
      serve(worker, STORY_LIBRARY, timers);
      return { port: main, terminate: () => {} };
    };
    function View() {
      const [r, setR] = useState<Rehearsed>(NONE_REHEARSED);
      rehearsed = r;
      return (
        <ThemeRoot>
          <ProductionStage
            production={production}
            scene={production.scenes[0]!.id}
            frame={production.frames[0]!.id}
            host={host}
            onGoToStoryboard={() => {}}
            announcement=""
            models={models}
            makeStage={makeStage}
            startWorker={startWorker}
            onPlaceChange={onPlaceChange}
            rehearsed={r}
            onRehearsed={setR}
          />
        </ThemeRoot>
      );
    }
    render(<View />);
    return { onPlaceChange, rehearsed: () => rehearsed };
  }

  it('shows every frame by scene with its status, and choosing one moves the place', async () => {
    const user = userEvent.setup();
    const p = exampleProduction();
    const { onPlaceChange } = strip(p);
    const list = screen.getByRole('listbox', { name: 'Frames' });
    const cards = within(list).getAllByRole('option');
    expect(cards).toHaveLength(p.frames.length);
    expect(cards[0]!.textContent).toMatch(/1\.1\s*Coded/);
    await user.click(cards.at(-1)!);
    const last = p.frames.find((f) => f.id === cards.at(-1)!.getAttribute('data-key'))!;
    expect(onPlaceChange).toHaveBeenLastCalledWith({ scene: last.scene, frame: last.id });
  });

  it('marks the frames a rehearsal reaches as Rehearsed', async () => {
    const user = userEvent.setup();
    const p = exampleProduction();
    strip(p);
    const rehearse = await screen.findByRole('button', { name: 'Rehearse' });
    await waitFor(() => expect(rehearse.hasAttribute('disabled')).toBe(false));
    await user.click(rehearse);
    const list = screen.getByRole('listbox', { name: 'Frames' });
    await waitFor(
      () => expect(within(list).getAllByRole('option')[0]!.textContent).toMatch(/Rehearsed/),
      { timeout: 4000 },
    );
  });
});

describe('speak lines on the scene view (spec 06 section 4)', () => {
  it('says when the lines are silent on this device, with their captions still showing', async () => {
    const voices = {
      state: { status: 'unavailable', silent: 2 },
      subscribe: () => () => {},
      start: () => {},
      stop: () => {},
    } as unknown as Voices;
    render(
      <ThemeRoot>
        <ProductionStage
          production={exampleProduction()}
          scene={exampleProduction().scenes[0]!.id}
          host={host}
          onGoToStoryboard={() => {}}
          announcement=""
          models={models}
          makeStage={async () => new FakeStage() as Stage}
          voices={voices}
        />
      </ThemeRoot>,
    );
    expect(
      await screen.findByText(
        'Speak lines are silent on this device for now. Their captions still show.',
      ),
    ).toBeTruthy();
  });
});
