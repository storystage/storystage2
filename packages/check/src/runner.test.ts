/**
 * WP11's done-when for the check (spec 08 section 9.8): through the real runtime on the fake
 * stage, a frame that matches its storyboard gives no flags, and each of five planted differences
 * is flagged: a missing character, a mirrored position, an unsaid line, a frame twice its planned
 * length, and a character off camera.
 */
import { applyEdit, nodeId, type Statement } from '@storystage/ast';
import {
  exampleProduction,
  frameId,
  lineId,
  sceneId,
  type Frame,
  type Production,
} from '@storystage/production';
import {
  inMemoryPorts,
  serve,
  type FromRuntime,
  type Port,
  type Timers,
  type ToRuntime,
} from '@storystage/runtime';
import { FakeStage } from '@storystage/stage/testing';
import { IDENTITY, STORY_LIBRARY, objectId, type Quat, type StandIn } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { checkFilm, checkFrame, checkScene, sameOrNew } from './runner.ts';
import { scriptWords } from './script-words.ts';
import { checkState } from './status.ts';

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

const S1 = sceneId('s1');
const F1 = frameId('f1');
const PENGUIN: StandIn = { standIn: 'penguin' };
const FOX: StandIn = { standIn: 'fox' };
/** Half a turn about the vertical: facing the camera, which looks along +Z. */
const FACING_CAMERA: Quat = { x: 0, y: 1, z: 0, w: 0 };
const say = (words: string, seconds: number): Statement => ({
  id: nodeId('scene1b'),
  kind: 'call',
  target: {
    id: nodeId('scene1r'),
    kind: 'fieldRef',
    target: { id: nodeId('scene1s'), kind: 'this' },
    field: nodeId('scene1p'),
  },
  callee: { kind: 'story', name: 'say' },
  args: { text: { id: nodeId('scene1x'), kind: 'text', value: words } },
  details: { duration: { id: nodeId('scene1d'), kind: 'number', value: seconds } },
});
/** The penguin's speak line (spec 06 section 4.1), from script line `line` if given. */
const speak = (n: string, words: string, line?: string): Statement => ({
  id: nodeId(`speak${n}b`),
  kind: 'call',
  target: {
    id: nodeId(`speak${n}r`),
    kind: 'fieldRef',
    target: { id: nodeId(`speak${n}s`), kind: 'this' },
    field: nodeId('scene1p'),
  },
  callee: { kind: 'story', name: 'speakLine' },
  args: { text: { id: nodeId(`speak${n}x`), kind: 'text', value: words } },
  details: {
    duration: { id: nodeId(`speak${n}d`), kind: 'number', value: 1 },
    ...(line ? { line: { id: nodeId(`speak${n}l`), kind: 'text', value: line } } : {}),
  },
});
/** The fox moving sideways, a long way, quickly. */
const foxLeaves: Statement = {
  id: nodeId('scene1g'),
  kind: 'call',
  target: {
    id: nodeId('scene1q'),
    kind: 'fieldRef',
    target: { id: nodeId('scene1u'), kind: 'this' },
    field: nodeId('scene1f'),
  },
  callee: { kind: 'story', name: 'move' },
  args: {
    direction: { id: nodeId('scene1k'), kind: 'enum', type: 'MoveDirection', value: 'left' },
    amount: { id: nodeId('scene1m2'), kind: 'number', value: 20 },
  },
  details: { duration: { id: nodeId('scene1n'), kind: 'number', value: 0.5 } },
};

interface Plant {
  /** The penguin's and the fox's places across the world: +X is the picture's left. */
  readonly penguinX?: number;
  readonly foxX?: number;
  readonly noFox?: boolean;
  readonly line?: string;
  readonly planned?: number;
  readonly body?: readonly Statement[];
  /** A second dialogue line, not pinned, for speak lines to come from. */
  readonly line2?: string;
}

/**
 * The example with scene 1 made to match its one frame: the penguin on the picture's left and the
 * fox on its right, both facing the camera; the penguin says the pinned line for 6 seconds.
 */
function film(plant: Plant = {}): Production {
  const p = exampleProduction();
  const [scene1, ...scenes] = p.scenes;
  const objects = [
    {
      id: objectId('penguin'),
      model: PENGUIN,
      class: 'Flyer' as const,
      transform: {
        ...IDENTITY,
        position: { x: plant.penguinX ?? 1, y: 0, z: 0 },
        rotation: FACING_CAMERA,
      },
    },
    {
      id: objectId('fox'),
      model: FOX,
      class: 'Quadruped' as const,
      transform: {
        ...IDENTITY,
        position: { x: plant.foxX ?? -1, y: 0, z: 0 },
        rotation: FACING_CAMERA,
      },
    },
  ].filter((o) => !(plant.noFox && o.id === 'fox'));
  const [type1, ...types] = p.program.types;
  const method = { ...type1!.methods[0]!, body: plant.body ?? [say('Here is the key.', 6)] };
  const frame: Frame = {
    id: F1,
    scene: S1,
    order: 0,
    caption: 'Pip finds the key',
    shot: 'twoShot',
    lengthSeconds: plant.planned ?? 6,
    sketches: [
      {
        id: 'k1',
        item: PENGUIN,
        facing: 'front',
        pose: null,
        x: 0.3,
        y: 0.6,
        scale: 1,
        flipped: false,
        layer: 0,
      },
      {
        id: 'k2',
        item: FOX,
        facing: 'front',
        pose: null,
        x: 0.7,
        y: 0.6,
        scale: 1,
        flipped: false,
        layer: 1,
      },
    ],
    links: [nodeId('scene1b')],
  };
  return {
    ...p,
    program: { ...p.program, types: [{ ...type1!, methods: [method] }, ...types] },
    scenes: [{ ...scene1!, setup: { ...scene1!.setup, objects } }, ...scenes],
    storyboard: {
      ...p.storyboard,
      cards: p.storyboard.cards.map((c) => (c.id === S1 ? { ...c, cast: [PENGUIN, FOX] } : c)),
    },
    frames: [frame, ...p.frames.filter((f) => f.scene !== S1)],
    script: [
      {
        id: lineId('l1'),
        scene: S1,
        kind: 'dialogue',
        character: 'PIP',
        text: plant.line ?? 'Here is the key.',
        pinnedFrame: F1,
      },
      ...(plant.line2 === undefined
        ? []
        : [
            {
              id: lineId('l2'),
              scene: S1,
              kind: 'dialogue' as const,
              character: 'PIP',
              text: plant.line2,
              pinnedFrame: null,
            },
          ]),
      ...p.script.filter((l) => l.scene !== S1),
    ],
  };
}

function workers() {
  let started = 0;
  let ended = 0;
  return {
    start: () => {
      started++;
      const { main, worker } = inMemoryPorts();
      const timers: Timers = { now: () => 0, every: () => () => undefined };
      serve(worker, STORY_LIBRARY, timers);
      const port: Port<ToRuntime, FromRuntime> = main;
      return { port, terminate: () => ended++ };
    },
    counts: () => ({ started, ended }),
  };
}

async function flagsFor(production: Production) {
  await settle();
  const result = await checkFrame({
    production,
    stage: new FakeStage(),
    startWorker: workers().start,
    frame: F1,
  });
  return result.items.filter((i) => i.outcome === 'flag');
}

describe('the automatic check (WP11 done-when)', () => {
  it('gives no flags on a frame that matches its storyboard, and says what passed', async () => {
    await settle();
    const result = await checkFrame({
      production: film(),
      stage: new FakeStage(),
      startWorker: workers().start,
      frame: F1,
    });
    expect(result.items.filter((i) => i.outcome === 'flag')).toEqual([]);
    const passed = result.items.filter((i) => i.outcome === 'passed').map((i) => i.words);
    expect(passed).toEqual(
      expect.arrayContaining([
        'Penguin is on screen',
        'Fox is on screen',
        'Penguin is on the left, as in your sketch',
        'Fox is on the right, as in your sketch',
        'Penguin faces as in your sketch',
        'Line 1.1 is said',
        'This frame lasts about 6 seconds, as planned',
      ]),
    );
  });

  it('flags a missing character', async () => {
    expect(await flagsFor(film({ noFox: true }))).toMatchObject([
      { kind: 'onScreen', words: "Fox isn't on screen at the end of this frame", sketch: 'k2' },
    ]);
  });

  it('flags a mirrored position', async () => {
    const flags = await flagsFor(film({ penguinX: -1, foxX: 1 }));
    expect(flags.map((f) => f.kind)).toEqual(['position', 'position', 'order']);
    expect(flags[0]!.words).toBe('Penguin ends on the right; your sketch has it on the left');
  });

  it('flags an unsaid line', async () => {
    expect(await flagsFor(film({ line: 'Where is the door?' }))).toMatchObject([
      { kind: 'line', words: 'Line 1.1 is never said', line: 'l1' },
    ]);
  });

  it('flags a frame twice its planned length', async () => {
    expect(await flagsFor(film({ planned: 3 }))).toMatchObject([
      { kind: 'length', words: 'This frame lasts 6 seconds; you planned 3' },
    ]);
  });

  it('flags a character that goes off camera', async () => {
    expect(await flagsFor(film({ body: [say('Here is the key.', 6), foxLeaves] }))).toMatchObject([
      { kind: 'offCamera', words: 'Fox walks off camera during this frame' },
    ]);
  });
});

describe('running the check', () => {
  it("gives every frame of a scene a result whose basis is the frame's, and ends its workers", async () => {
    await settle();
    const w = workers();
    const results = await checkScene({
      production: film(),
      stage: new FakeStage(),
      startWorker: w.start,
      scene: S1,
    });
    expect([...results.keys()]).toEqual([F1]);
    expect(results.get(F1)!.basis).toMatch(/^[0-9a-f]+$/);
    expect(w.counts().ended).toBe(w.counts().started);
  });

  it('checks the whole film, scene after scene, counting frames as it goes', async () => {
    await settle();
    const progress: string[] = [];
    const p = film();
    const results = await checkFilm({
      production: p,
      stage: new FakeStage(),
      startWorker: workers().start,
      onProgress: (done, total) => progress.push(`${done}/${total}`),
    });
    expect(results.size).toBe(p.frames.length);
    expect(progress[0]).toBe(`0/${p.frames.length}`);
    expect(progress.at(-1)).toBe(`${p.frames.length}/${p.frames.length}`);
  });

  it('stops when the learner leaves', async () => {
    await settle();
    const stop = new AbortController();
    stop.abort();
    await expect(
      checkScene({
        production: film(),
        stage: new FakeStage(),
        startWorker: workers().start,
        scene: S1,
        signal: stop.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('hands back the previous result unchanged when nothing in it changed', () => {
    const items = [
      { id: 'length', kind: 'length' as const, outcome: 'passed' as const, words: 'x' },
    ];
    const previous = { basis: 'b', items, kept: [] };
    expect(sameOrNew(previous, { basis: 'b', items: [...items] }).items).toBe(items);
    expect(sameOrNew(previous, { basis: 'c', items: [...items] }).items).not.toBe(items);
  });
});

describe('speak lines against the script (spec 06 section 4.1)', () => {
  /** The frame's items about speak lines: those that name a block other than the say. */
  async function speakItems(production: Production) {
    await settle();
    const result = await checkFrame({
      production,
      stage: new FakeStage(),
      startWorker: workers().start,
      frame: F1,
    });
    return { result, items: result.items.filter((i) => i.id.startsWith('speak:')) };
  }
  const body = (...more: Statement[]) => [say('Here is the key.', 6), ...more];

  it('passes a speak line whose words are its script line’s, naming the block and the line', async () => {
    const { items } = await speakItems(
      film({ line2: 'Come with me!', body: body(speak('a', 'Come with me!', 'l2')) }),
    );
    expect(items).toEqual([
      {
        id: 'speak:speakab',
        kind: 'line',
        outcome: 'passed',
        words: 'Penguin says line 1.2 as written',
        node: 'speakab',
        line: 'l2',
      },
    ]);
  });

  it('flags a speak line whose words differ from its script line, whichever changed', async () => {
    const { items } = await speakItems(
      film({ line2: 'Come with me, Fox!', body: body(speak('a', 'Come with me!', 'l2')) }),
    );
    expect(items).toMatchObject([
      {
        outcome: 'flag',
        words: "Penguin's words aren't the same as line 1.2 in the script",
        node: 'speakab',
        line: 'l2',
      },
    ]);
  });

  it('notes a speak line whose line has been taken out of the script', async () => {
    const { items } = await speakItems(film({ body: body(speak('a', 'Come with me!', 'l9')) }));
    expect(items).toMatchObject([
      {
        outcome: 'note',
        words: "Penguin says a line that's no longer in the script",
        node: 'speakab',
      },
    ]);
    expect(items[0]).not.toHaveProperty('line');
  });

  it('notes words the script hasn’t got, and passes ones it has, as advice', async () => {
    const { items } = await speakItems(
      film({
        line2: 'Come with me!',
        body: body(speak('a', 'Look out!'), speak('b', 'Come with me!')),
      }),
    );
    expect(items).toMatchObject([
      {
        id: 'speak:speakab',
        outcome: 'note',
        words: "Penguin says words that aren't in the script",
      },
      {
        id: 'speak:speakbb',
        outcome: 'passed',
        words: 'Penguin says line 1.2 as written',
        line: 'l2',
      },
    ]);
  });

  it('gives no second item for a line pinned to the frame, which has its own', async () => {
    const { result, items } = await speakItems(
      // The frame starts at its linked block, the `say`, so the speak line comes after it.
      film({ body: [say('Hello.', 1), speak('a', 'Here is the key.', 'l1')] }),
    );
    expect(items).toEqual([]);
    expect(result.items.find((i) => i.id === 'line:l1')?.words).toBe('Line 1.1 is said');
  });

  it('goes stale when the script line its item names changes', async () => {
    const p = film({ line2: 'Come with me!', body: body(speak('a', 'Come with me!', 'l2')) });
    const { result } = await speakItems(p);
    const saved: Production = {
      ...p,
      frames: p.frames.map((f) => (f.id === F1 ? { ...f, check: { ...result, kept: [] } } : f)),
    };
    expect(checkState(saved.frames[0]!, saved)?.stale).toBe(false);
    const changed: Production = {
      ...saved,
      script: saved.script.map((l) => (l.id === 'l2' ? { ...l, text: 'Come on!' } : l)),
    };
    expect(checkState(changed.frames[0]!, changed)?.stale).toBe(true);
  });

  it('gives the edit that puts the script’s words in the block, for Use the new words', async () => {
    const p = film({ line2: 'Come with me, Fox!', body: body(speak('a', 'Come with me!', 'l2')) });
    const { items } = await speakItems(p);
    const edit = scriptWords(p, items[0]!);
    expect(edit).toMatchObject({
      kind: 'setArgument',
      node: 'speakab',
      slot: 'args',
      param: 'text',
      value: { kind: 'text', value: 'Come with me, Fox!' },
      label: 'Use the script’s words for line 1.2',
    });
    const next = applyEdit(p.program, edit!);
    expect(JSON.stringify(next.program)).toContain('Come with me, Fox!');
    expect(scriptWords(p, { id: 'length', kind: 'length', outcome: 'passed', words: 'x' })).toBe(
      null,
    );
  });
});
