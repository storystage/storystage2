import { nodeId } from '@storystage/ast';
import { IDENTITY, micros, objectId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  RUNTIME_PROTOCOL,
  inMemoryPorts,
  isFromRuntime,
  isToRuntime,
  type FromRuntime,
  type ToRuntime,
} from './messages.ts';

const load: ToRuntime = {
  type: 'load',
  protocol: RUNTIME_PROTOCOL,
  program: { schemaVersion: '1.0.0' },
  scene: { backdrop: {}, objects: [], camera: { transform: IDENTITY }, markers: [] },
  entry: nodeId('m1'),
  seed: 42,
  disabled: [],
};

const commands: FromRuntime = {
  type: 'commands',
  commands: [
    {
      seq: 0,
      object: objectId('cat'),
      start: 0,
      duration: micros(1),
      style: 'beginAndEndGently',
      kind: 'translate',
      by: { x: 0, y: 0, z: 1 },
      space: 'self',
    },
  ],
  until: micros(0.1),
  sentAt: 1_700_000_000_000,
};

describe('runtime messages', () => {
  it('survive structured cloning unchanged (they cross a worker boundary)', () => {
    for (const m of [load, commands]) expect(structuredClone(m)).toEqual(m);
  });

  it('are recognised by direction', () => {
    expect(isToRuntime(load)).toBe(true);
    expect(isFromRuntime(load)).toBe(false);
    expect(isFromRuntime(commands)).toBe(true);
    expect(isFromRuntime({ type: 'ready', protocol: RUNTIME_PROTOCOL })).toBe(true);
  });

  it('refuse another protocol version, junk and unknown types', () => {
    expect(isToRuntime({ ...load, protocol: 2 })).toBe(false);
    expect(isFromRuntime({ type: 'ready', protocol: 0 })).toBe(false);
    for (const junk of [null, 'load', 42, {}, { type: 'explode' }]) {
      expect(isToRuntime(junk)).toBe(false);
      expect(isFromRuntime(junk)).toBe(false);
    }
  });
});

describe('inMemoryPorts', () => {
  it('delivers copies, asynchronously, both ways', async () => {
    const { main, worker } = inMemoryPorts();
    const atWorker: ToRuntime[] = [];
    worker.listen((m) => {
      atWorker.push(m);
      worker.post({ type: 'loaded' });
    });
    const reply = new Promise<FromRuntime>((resolve) => main.listen(resolve));
    main.post(load);
    expect(atWorker).toEqual([]); // not delivered synchronously
    expect(await reply).toEqual({ type: 'loaded' });
    expect(atWorker[0]).toEqual(load);
    expect(atWorker[0]).not.toBe(load);
  });

  it('stops delivering after the listener is removed', async () => {
    const { main, worker } = inMemoryPorts();
    const got: ToRuntime[] = [];
    const stop = worker.listen((m) => got.push(m));
    stop();
    main.post({ type: 'stop' });
    await Promise.resolve();
    expect(got).toEqual([]);
  });
});
