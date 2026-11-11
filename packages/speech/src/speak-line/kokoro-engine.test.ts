import { describe, expect, it } from 'vitest';
import { KokoroEngine, type KokoroWorker } from './kokoro-engine.ts';
import type { FromKokoro, ToKokoro } from './kokoro-protocol.ts';

/** A fake worker that answers like the real one, or fails when asked to. */
function fakeWorker(fail?: 'load' | 'speak') {
  const sent: ToKokoro[] = [];
  let started = 0;
  let terminated = 0;
  const start = (): KokoroWorker => {
    started++;
    const w: KokoroWorker = {
      onmessage: null,
      onerror: null,
      terminate: () => void terminated++,
      postMessage(m) {
        sent.push(m);
        const reply = (r: FromKokoro) => queueMicrotask(() => w.onmessage?.({ data: r }));
        if (m.type === 'load') {
          reply({ type: 'log', line: 'files fetched' });
          reply(
            fail === 'load'
              ? { type: 'failed', message: 'no model' }
              : { type: 'ready', loadMs: 5 },
          );
        } else if (fail === 'speak') reply({ type: 'failed', id: m.id, message: 'bad line' });
        else reply({ type: 'spoken', id: m.id, samples: new Float32Array(m.text.length) });
      },
    };
    return w;
  };
  return { start, sent, started: () => started, terminated: () => terminated };
}

const places = { assets: '/voices/', wasm: '/ort/' };
const emma = { base: 'bf_emma', accent: 'british' as const };

describe('KokoroEngine', () => {
  it('fails to load, not waits for ever, when the worker can’t start', async () => {
    const engine = new KokoroEngine(places, {
      start: () => {
        const w: KokoroWorker = {
          onmessage: null,
          onerror: null,
          terminate: () => {},
          postMessage: () => queueMicrotask(() => w.onerror?.({ message: 'bad script' })),
        };
        return w;
      },
    });
    await expect(engine.load()).rejects.toThrow('bad script');
  });

  it('passes on the thread count and Kokoro’s progress', async () => {
    const f = fakeWorker();
    const logs: string[] = [];
    const engine = new KokoroEngine(places, {
      start: f.start,
      threads: 1,
      onLog: (l) => logs.push(l),
    });
    await engine.load();
    expect(f.sent[0]).toEqual({ type: 'load', places, options: { threads: 1 } });
    expect(logs).toEqual(['files fetched']);
  });

  it('loads Kokoro once, on first use, and speaks lines through the worker', async () => {
    const f = fakeWorker();
    const engine = new KokoroEngine(places, { start: f.start });
    const [a, b] = await Promise.all([engine.speak('Hello.', emma), engine.speak('Hi.', emma)]);
    expect([a.length, b.length]).toEqual([6, 3]);
    expect(f.started()).toBe(1);
    expect(f.sent.map((m) => m.type)).toEqual(['load', 'speak', 'speak']);
    expect(f.sent[0]).toEqual({ type: 'load', places });
    expect(engine.sampleRate).toBe(24_000);
  });

  it('reports a line the worker couldn’t speak', async () => {
    const engine = new KokoroEngine(places, { start: fakeWorker('speak').start });
    await expect(engine.speak('Hello.', emma)).rejects.toThrow('bad line');
  });

  it('fails every line if Kokoro can’t load, and tries again next time', async () => {
    const f = fakeWorker('load');
    const engine = new KokoroEngine(places, { start: f.start });
    await expect(engine.speak('Hello.', emma)).rejects.toThrow('no model');
    expect(f.terminated()).toBe(1);
    await expect(engine.load()).rejects.toThrow('no model');
    expect(f.started()).toBe(2);
  });

  it('fails a line waiting for Kokoro to load, if Kokoro is let go first', async () => {
    let terminated = false;
    const silent: KokoroWorker = {
      onmessage: null,
      onerror: null,
      postMessage: () => {}, // never says ready, like a worker still loading
      terminate: () => void (terminated = true),
    };
    const engine = new KokoroEngine(places, { start: () => silent });
    const pending = engine.speak('Hello.', emma);
    engine.dispose();
    await expect(pending).rejects.toThrow('Speak line was closed.');
    expect(terminated).toBe(true);
  });

  it('lets Kokoro go on dispose, failing lines still waiting', async () => {
    const f = fakeWorker();
    const engine = new KokoroEngine(places, { start: f.start });
    await engine.load();
    const pending = engine.speak('Hello.', emma);
    engine.dispose();
    await expect(pending).rejects.toThrow('Speak line was closed.');
    expect(f.terminated()).toBe(1);
  });
});
