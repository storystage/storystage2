import { nodeId, type Expression, type NodeId, type Statement } from '@storystage/ast';
import { exampleProduction, type Production } from '@storystage/production';
import { inMemoryPorts, serve, type Timers } from '@storystage/runtime';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY } from '@storystage/story-api';
import { describe, expect, it, vi } from 'vitest';
import { Rehearsal, type RehearsalSounds, type Speaker } from './rehearsal.ts';

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

function rehearse(
  production: Production,
  speaker?: Speaker,
  sounds?: () => RehearsalSounds | null,
  wake?: () => void,
) {
  const stage = new FakeStage();
  let ms = 0;
  let ended = 0;
  const rehearsal = new Rehearsal({
    production,
    scene: production.scenes[0]!.id,
    stage,
    wall: () => ms,
    ...(speaker ? { speaker } : {}),
    ...(sounds ? { sounds } : {}),
    ...(wake ? { wake } : {}),
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

  it('times the run as it goes: its speak lines, its sounds, and its length once whole', async () => {
    const line = say(words('Hello there'), 'speakLine');
    const sound: Statement = {
      id: id(),
      kind: 'call',
      target: the(PENGUIN),
      callee: { kind: 'story', name: 'playAudio' },
      args: { audioSource: words('sn9') },
      details: {},
    };
    const { rehearsal, frames } = rehearse(withSceneOne([line, sound, say(words('Bye'))]));
    expect(rehearsal.state.timing).toBeNull();
    await rehearsal.start();
    await frames(30);
    expect(rehearsal.state.status).toBe('ended');
    const timing = rehearsal.state.timing!;
    expect(timing.whole).toBe(true);
    const [spoken, played] = timing.sounds;
    expect(spoken).toMatchObject({ node: line.id, kind: 'speech', start: 0, text: 'Hello there' });
    // The film has no sound called sn9: it's missing, and takes no time.
    expect(played).toMatchObject({ node: sound.id, kind: 'sound', ref: 'sn9', missing: true });
    expect(played!.start).toBe(spoken!.length);
    expect(timing.length).toBeGreaterThan(spoken!.length);
  });

  it('times a scene that waits for the viewer when it’s stopped after doing everything', async () => {
    const line = say(words('Hi'));
    const p = withSceneOne([line]);
    const [first, ...rest] = p.program.types;
    const waiting = {
      ...p,
      program: {
        ...p.program,
        types: [
          {
            ...first!,
            listeners: [
              {
                id: id(),
                kind: 'listener' as const,
                event: 'keyPress',
                args: {},
                details: {},
                params: [],
                body: [say(words('Pressed'))],
              },
            ],
          },
          ...rest,
        ],
      },
    } as Production;
    const { rehearsal, frames } = rehearse(waiting);
    const seen: boolean[] = [];
    rehearsal.subscribe(() => seen.push(rehearsal.state.timing?.whole ?? false));
    await rehearsal.start();
    await frames(30);
    // It never ends by itself: it waits for a key.
    expect(rehearsal.state.status).toBe('playing');
    await rehearsal.stop();
    expect(seen).toContain(true);
    // Still there once Stop has put the set-up back (S3's review of #714).
    expect(rehearsal.state.status).toBe('idle');
    expect(rehearsal.state.timing?.whole).toBe(true);
  });

  it('isn’t whole when it’s stopped', async () => {
    const p = withSceneOne([say(words('A long line for the penguin to say slowly.'))]);
    const { rehearsal, frames } = rehearse(p);
    const seen: boolean[] = [];
    rehearsal.subscribe(() => seen.push(rehearsal.state.timing?.whole ?? false));
    await rehearsal.start();
    await frames(0.5);
    await rehearsal.stop();
    expect(seen).not.toContain(true);
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

// Two loads at once on one stage: the second disposes the first's scene before it's ready, and
// Babylon never says a disposed scene is ready, so the run stayed at `starting` (S2, 18 Nov).
describe('Rehearsal and the set-up shown when the scene view opens', () => {
  /** Holds the stage's next load until `open` is called. */
  function holdNextLoad(stage: FakeStage) {
    const load = stage.load.bind(stage);
    let open: () => void = () => {};
    const gate = new Promise<void>((resolve) => (open = resolve));
    vi.spyOn(stage, 'load').mockImplementationOnce(async (setup) => {
      await gate;
      return load(setup);
    });
    return () => open();
  }

  it('waits for the set-up still loading before it loads its own', async () => {
    const p = withSceneOne([say(words('Hi'))]);
    const { rehearsal, stage } = rehearse(p);
    const open = holdNextLoad(stage);
    const shown = rehearsal.showSetup();
    const started = rehearsal.start();
    await new Promise((r) => setTimeout(r, 10));
    // Only the set-up's load has begun; the run hasn't loaded over it.
    expect(stage.load).toHaveBeenCalledTimes(1);
    expect(rehearsal.state.status).toBe('starting');
    open();
    await shown;
    await started;
    expect(stage.load).toHaveBeenCalledTimes(2);
    expect(rehearsal.state.status).toBe('playing');
  });

  it('leaves the stage to a run that has already begun', async () => {
    const p = withSceneOne([say(words('Hi'))]);
    const { rehearsal, stage } = rehearse(p);
    const started = rehearsal.start();
    // The scene view's set-up arrives once the models are ready, after Rehearse was pressed.
    await rehearsal.showSetup();
    await started;
    expect(loads(stage)).toHaveLength(1);
    expect(rehearsal.state.status).toBe('playing');
  });

  it('can be stopped while it waits, and never starts', async () => {
    const p = withSceneOne([say(words('Hi'))]);
    const { rehearsal, stage, ended } = rehearse(p);
    const open = holdNextLoad(stage);
    const shown = rehearsal.showSetup();
    const started = rehearsal.start();
    await rehearsal.stop();
    open();
    await shown;
    await started;
    expect(rehearsal.state.status).toBe('idle');
    expect(stage.load).toHaveBeenCalledTimes(1);
    expect(ended()).toBe(0);
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

describe('Rehearsal’s music and sounds (decision 0076, S3’s LiveSounds)', () => {
  /** A player that keeps what it was told, in order. */
  const player = () => {
    const calls: (readonly unknown[])[] = [];
    const sounds: RehearsalSounds = {
      prepare: async (scenes) => void calls.push(['prepare', scenes]),
      scene: (scene, at) => void calls.push(['scene', scene, at]),
      play: (time, speed) => void calls.push(['play', time, speed]),
      commands: (scene, commands) => void calls.push(['commands', scene, commands.length]),
      pause: () => void calls.push(['pause']),
      end: () => void calls.push(['end']),
      dispose: () => void calls.push(['dispose']),
    };
    const made = vi.fn(() => sounds);
    const told = (what: string) => calls.filter((c) => c[0] === what);
    return { calls, made, told };
  };

  it('is made on the first Rehearse, not before, and once for every run after', async () => {
    const s = player();
    const { rehearsal, frames } = rehearse(withSceneOne([say(words('Hi'))]), undefined, s.made);
    await rehearsal.showSetup();
    expect(s.made).not.toHaveBeenCalled();
    await rehearsal.start();
    await frames(30);
    await rehearsal.start();
    expect(s.made).toHaveBeenCalledTimes(1);
  });

  it('reads the scene’s sounds, starts with the scene, and plays from the clock', async () => {
    const p = withSceneOne([say(words('Hello'))]);
    const s = player();
    const { rehearsal, frames } = rehearse(p, undefined, s.made);
    await rehearsal.start();
    const scene = p.scenes[0]!.id;
    expect(s.told('prepare')).toEqual([['prepare', [scene]]]);
    expect(s.told('scene')).toEqual([['scene', scene, 0]]);
    expect(s.calls.at(-1)).toEqual(['play', 0, 1]);
    await frames(0.5);
    // The runtime's commands are passed on as they come: the player plays the sound ones.
    expect(s.told('commands').length).toBeGreaterThan(0);
    expect(s.told('commands')[0]![1]).toBe(scene);
  });

  it('goes quiet on pause, plays on from the picture, and keeps pace with the speed', async () => {
    const s = player();
    const p = withSceneOne([say(words('A long line for the penguin to say slowly.'))]);
    const { rehearsal, frames } = rehearse(p, undefined, s.made);
    await rehearsal.start();
    await frames(0.5);
    rehearsal.pause();
    expect(s.calls.at(-1)).toEqual(['pause']);
    // Paused, a new speed waits for Play.
    rehearsal.setSpeed(2);
    expect(s.calls.at(-1)).toEqual(['pause']);
    rehearsal.play();
    const [, time, speed] = s.calls.at(-1)!;
    expect(time).toBeCloseTo(0.5, 1);
    expect(speed).toBe(2);
    rehearsal.setSpeed(0.5);
    expect(s.calls.at(-1)).toEqual(['play', time, 0.5]);
  });

  it('ends with the run, on Stop and on Restart, and lets go when the view closes', async () => {
    const s = player();
    const { rehearsal, frames } = rehearse(withSceneOne([say(words('Hi'))]), undefined, s.made);
    await rehearsal.start();
    await frames(30);
    expect(rehearsal.state.status).toBe('ended');
    expect(s.calls.at(-1)).toEqual(['end']);
    await rehearsal.start();
    const restarted = s.calls.length;
    await rehearsal.start();
    expect(s.calls.slice(restarted)).toContainEqual(['end']);
    await rehearsal.stop();
    expect(s.calls.at(-1)).toEqual(['end']);
    rehearsal.dispose();
    expect(s.calls.at(-1)).toEqual(['dispose']);
  });

  it('plays nothing while it runs ahead to a block, and the music from there on Play', async () => {
    const third = say(words('Three'));
    const s = player();
    const p = withSceneOne([say(words('One')), say(words('Two')), third]);
    const { rehearsal } = rehearse(p, undefined, s.made);
    await rehearsal.toHere(third.id);
    expect(rehearsal.state.status).toBe('paused');
    expect(s.told('commands')).toEqual([]);
    expect(s.told('play')).toEqual([]);
    rehearsal.play();
    const [what, time] = s.calls.at(-1)!;
    expect(what).toBe('play');
    expect(time).toBeGreaterThan(0);
  });

  it('wakes the audio within the press, before it waits for anything (Safari, S3)', async () => {
    const wake = vi.fn();
    const p = withSceneOne([say(words('One')), say(words('Two')), say(words('Three'))]);
    const { rehearsal, frames } = rehearse(p, undefined, undefined, wake);
    const started = rehearsal.start();
    expect(wake).toHaveBeenCalledTimes(1);
    await started;
    await frames(0.2);
    rehearsal.pause();
    rehearsal.play();
    // Play is a press too, after which Safari may have suspended the audio (a call, Siri).
    expect(wake).toHaveBeenCalledTimes(2);
    const ahead = rehearsal.toHere(p.program.types[0]!.methods[0]!.body[2]!.id);
    expect(wake).toHaveBeenCalledTimes(3);
    await ahead;
  });

  it('rehearses anyway when the sounds can’t be read, or there’s no audio', async () => {
    const s = player();
    const failing: RehearsalSounds = {
      ...s.made(),
      prepare: () => Promise.reject(new Error('no file')),
    };
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const one = rehearse(withSceneOne([say(words('Hi'))]), undefined, () => failing);
    await one.rehearsal.start();
    expect(one.rehearsal.state.status).toBe('playing');
    const none = rehearse(withSceneOne([say(words('Hi'))]), undefined, () => null);
    await none.rehearsal.start();
    await none.frames(30);
    expect(none.rehearsal.state.status).toBe('ended');
    quiet.mockRestore();
  });
});
