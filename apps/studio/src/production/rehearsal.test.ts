import { nodeId, type Expression, type NodeId, type Statement } from '@storystage/ast';
import { exampleProduction, type Production } from '@storystage/production';
import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY } from '@storystage/story-api';
import { describe, expect, it, vi } from 'vitest';
import { Rehearsal, type Speaker } from './rehearsal.ts';

// Rehearse (07-ux 7.4) on S2's driver, a fake stage and a real runtime over in-memory ports.

let counter = 0;
const id = (): NodeId => nodeId(`r${(counter++).toString(36).padStart(5, '0')}`);
const self = (): Expression => ({ id: id(), kind: 'this' });
const PENGUIN = nodeId('scene1p');
const the = (field: NodeId): Expression => ({ id: id(), kind: 'fieldRef', target: self(), field });
const say = (value: Expression, name = 'say'): Statement => ({
  id: id(),
  kind: 'call',
  target: the(PENGUIN),
  callee: { kind: 'story', name },
  args: { text: value },
  details: {},
});
const words = (value: string): Expression => ({ id: id(), kind: 'text', value });

/** The example production, with scene 1's script method replaced. */
function withSceneOne(body: readonly Statement[]): Production {
  const p = exampleProduction();
  const [first, ...rest] = p.program.types;
  const method = { ...first!.methods[0]!, body };
  return {
    ...p,
    program: { ...p.program, types: [{ ...first!, methods: [method], listeners: [] }, ...rest] },
  };
}

function rehearse(production: Production, speaker?: Speaker) {
  const stage = new FakeStage();
  let ms = 0;
  let ended = 0;
  const rehearsal = new Rehearsal({
    production,
    scene: production.scenes[0]!.id,
    stage,
    wall: () => ms,
    ...(speaker ? { speaker } : {}),
    startWorker: () => {
      const { main, worker } = inMemoryPorts();
      const timers: Timers = { now: () => 0, every: () => () => undefined };
      serve(worker, STORY_LIBRARY, timers);
      return { port: main, terminate: () => ended++ };
    },
  });
  const seen = new Set<NodeId>();
  rehearsal.subscribe(() => rehearsal.state.running.forEach((n) => seen.add(n)));
  /** Frames at 30 a second, for `seconds` of the wall clock or until the run ends. */
  const frames = async (seconds: number) => {
    for (let i = 0; i < seconds * 30 && rehearsal.state.status !== 'ended'; i++) {
      ms += 1000 / 30;
      await rehearsal.tick();
    }
  };
  return { stage, rehearsal, frames, seen, ended: () => ended };
}

const loads = (stage: FakeStage) => stage.calls.filter((c) => c.method === 'load');

describe('Rehearsal', () => {
  it('plays the scene from its set-up, highlighting the blocks as they run, and ends', async () => {
    const first = say(words('Hello'));
    const second = say(words('Goodbye'));
    const p = withSceneOne([first, second]);
    const { rehearsal, frames, seen, stage } = rehearse(p);
    const heard = new Set<string>();
    rehearsal.subscribe(() => rehearsal.state.speech.forEach((s) => heard.add(s.text)));
    await rehearsal.start();
    expect(rehearsal.state.status).toBe('playing');
    expect(loads(stage)[0]?.args[0]).toEqual(p.scenes[0]!.setup);
    await frames(30);
    expect(rehearsal.state.status).toBe('ended');
    expect(seen).toContain(first.id);
    expect(seen).toContain(second.id);
    expect(heard).toContain('Hello');
    expect(heard).toContain('Goodbye');
    expect(rehearsal.state.speech).toEqual([]);
    expect(rehearsal.state.running).toEqual([]);
    expect(rehearsal.state.error).toBeNull();
  });

  it('marks a thought as a thought, so it doesn’t read as speech', async () => {
    const think = say(words('Hmm, the ice…'), 'think');
    const { rehearsal, frames } = rehearse(withSceneOne([think]));
    const heard: { text: string; thought: boolean }[] = [];
    rehearsal.subscribe(() => heard.push(...rehearsal.state.speech));
    await rehearsal.start();
    await frames(30);
    expect(heard).toContainEqual({ text: 'Hmm, the ice…', thought: true });
  });

  it('stops at once, puts the set-up back and lets the worker go', async () => {
    const p = withSceneOne([say(words('A long line for the penguin to say slowly.'))]);
    const { rehearsal, frames, stage, ended } = rehearse(p);
    await rehearsal.start();
    await frames(0.5);
    expect(rehearsal.state.status).toBe('playing');
    await rehearsal.stop();
    expect(rehearsal.state.status).toBe('idle');
    expect(loads(stage).at(-1)?.args[0]).toEqual(p.scenes[0]!.setup);
    expect(stage.calls.at(-1)?.method).toBe('seek');
    expect(ended()).toBe(1);
  });

  it('after the run ends, Stop shows the set-up again', async () => {
    const p = withSceneOne([say(words('Hi'))]);
    const { rehearsal, frames, stage } = rehearse(p);
    await rehearsal.start();
    await frames(30);
    expect(rehearsal.state.status).toBe('ended');
    const before = loads(stage).length;
    await rehearsal.stop();
    expect(loads(stage)).toHaveLength(before + 1);
    expect(rehearsal.state.status).toBe('idle');
  });

  it('stops at an error, in plain words, at its block', async () => {
    const bad = say({ id: id(), kind: 'number', value: 3 });
    const { rehearsal, frames } = rehearse(withSceneOne([bad]));
    await rehearsal.start();
    await frames(5);
    expect(rehearsal.state.status).toBe('ended');
    expect(rehearsal.state.error?.node).toBe(bad.id);
    expect(rehearsal.state.error?.words).toMatch(/\w/);
  });

  it('pauses, plays on and changes speed without jumping', async () => {
    const p = withSceneOne([say(words('One')), say(words('Two')), say(words('Three'))]);
    const { rehearsal, frames } = rehearse(p);
    await rehearsal.start();
    await frames(0.2);
    rehearsal.pause();
    expect(rehearsal.state.status).toBe('paused');
    // Paused, a tick moves nothing on and the run doesn't end however long it waits.
    await frames(60);
    expect(rehearsal.state.status).toBe('paused');
    rehearsal.setSpeed(2);
    rehearsal.play();
    expect(rehearsal.state).toMatchObject({ status: 'playing', speed: 2 });
    await frames(30);
    expect(rehearsal.state.status).toBe('ended');
  });

  it('rehearses to a block: runs ahead without drawing, and pauses there', async () => {
    const first = say(words('One'));
    const third = say(words('Three'));
    const p = withSceneOne([first, say(words('Two')), third]);
    const { rehearsal } = rehearse(p);
    await rehearsal.toHere(third.id);
    expect(rehearsal.state).toMatchObject({ status: 'paused', notReached: false });
    expect(rehearsal.state.running).toContain(third.id);
  });

  it('says so when the block to rehearse to never runs', async () => {
    const p = withSceneOne([say(words('One'))]);
    const { rehearsal } = rehearse(p);
    await rehearsal.toHere(nodeId('nowhere'));
    // Play ended before it got there: the last picture stays, and no block is waiting.
    expect(rehearsal.state).toMatchObject({ status: 'ended', notReached: true });
  });

  it('starts again from the set-up on Restart', async () => {
    const p = withSceneOne([say(words('Hi'))]);
    const { rehearsal, frames, stage, ended } = rehearse(p);
    await rehearsal.start();
    await frames(30);
    await rehearsal.start();
    expect(rehearsal.state.status).toBe('playing');
    expect(loads(stage).at(-1)?.args[0]).toEqual(p.scenes[0]!.setup);
    expect(ended()).toBe(1);
  });
});

describe('Rehearsal’s speak lines (spec 06 section 4.5)', () => {
  const speaker = () => ({ start: vi.fn<(node: NodeId, delay: number) => void>(), stop: vi.fn() });

  it('tells the voices each block as it starts, and goes quiet on pause and Stop', async () => {
    const first = say(words('One'));
    const second = say(words('Two'));
    const s = speaker();
    const { rehearsal, frames } = rehearse(withSceneOne([first, second]), s);
    await rehearsal.start();
    await frames(0.2);
    // Told when the picture gets there: the driver runs a little ahead.
    expect(s.start).toHaveBeenCalledWith(first.id, expect.any(Number));
    const delay = s.start.mock.calls.find(([n]) => n === first.id)![1];
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(0.5);
    const quietBefore = s.stop.mock.calls.length;
    rehearsal.pause();
    expect(s.stop.mock.calls.length).toBeGreaterThan(quietBefore);
    rehearsal.play();
    await rehearsal.stop();
    expect(s.stop.mock.calls.length).toBeGreaterThan(quietBefore + 1);
  });

  it('says nothing while it runs ahead to a block', async () => {
    const third = say(words('Three'));
    const s = speaker();
    const { rehearsal } = rehearse(withSceneOne([say(words('One')), say(words('Two')), third]), s);
    await rehearsal.toHere(third.id);
    expect(rehearsal.state.status).toBe('paused');
    expect(s.start).not.toHaveBeenCalled();
  });
});
