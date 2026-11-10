import { describe, expect, it } from 'vitest';
import { box, glbFromMesh } from '@storystage/sketches/testing';
import type { ImportChoices, ImportTools } from './import.ts';
import { importInWorker, runInWorker, type ImportWorker } from './worker-client.ts';
import { serveImports, type WorkerPort } from './worker.ts';

const tools: ImportTools = {
  encodeTexture: async (image) => image,
  encodeThumbnail: async () => ({ bytes: new Uint8Array([1]), mimeType: 'image/webp' }),
};
const choices: ImportChoices = {
  section: 'props',
  class: 'Prop',
  name: 'Crate',
  licence: { choice: 'own-work' },
};

type Listener = (event: { data: unknown }) => void;

/** A worker in the same thread: messages cross with a structured clone, as they would. */
function fakeWorker(serve: boolean) {
  const toWorker: Listener[] = [];
  const toStudio: Listener[] = [];
  const errors: ((e: unknown) => void)[] = [];
  let terminated = 0;
  const workerSide: WorkerPort = {
    postMessage: (m) =>
      queueMicrotask(() => toStudio.forEach((l) => l({ data: structuredClone(m) }))),
    addEventListener: (_t, l) => void toWorker.push(l),
  };
  if (serve) serveImports(workerSide, tools);
  const worker: ImportWorker = {
    postMessage: (m) =>
      queueMicrotask(() => toWorker.forEach((l) => l({ data: structuredClone(m) }))),
    addEventListener: ((type: string, l: Listener) =>
      type === 'message'
        ? void toStudio.push(l)
        : void errors.push(l as (e: unknown) => void)) as ImportWorker['addEventListener'],
    terminate: () => void terminated++,
  };
  return {
    worker,
    fail: () => errors.forEach((e) => e(new Error('crashed'))),
    terminated: () => terminated,
  };
}

describe('importInWorker (spec 17, section 5)', () => {
  it('runs an import in a worker, and ends the worker when it answers', async () => {
    const fake = fakeWorker(true);
    const model = await glbFromMesh(box([0, 0, 0], [1, 1, 1]));
    const result = await importInWorker(() => fake.worker, {
      files: [['crate.glb', model]],
      choices,
      taken: ['class/Prop/crate'],
    });
    expect(result).toMatchObject({ ok: true, item: { id: 'class/Prop/crate-2' } });
    expect(fake.terminated()).toBe(1);
    // The caller's bytes are its own: a copy went to the worker.
    expect(model.byteLength).toBeGreaterThan(0);
  });

  it('stops an import that runs past its time limit, in plain words', async () => {
    const fake = fakeWorker(false);
    const result = await importInWorker(
      () => fake.worker,
      { files: [], choices, taken: [] },
      { timeLimitMs: 20 },
    );
    expect(result).toMatchObject({ ok: false, problems: [{ code: 'tooSlow' }] });
    expect(fake.terminated()).toBe(1);
  });

  it('refuses when the worker fails, and ends it', async () => {
    const fake = fakeWorker(false);
    const pending = importInWorker(() => fake.worker, { files: [], choices, taken: [] });
    fake.fail();
    expect(await pending).toMatchObject({ ok: false, problems: [{ code: 'damaged' }] });
    expect(fake.terminated()).toBe(1);
  });
});

describe('runInWorker, for any untrusted reader (spec 15, section 3)', () => {
  /** A worker that the test answers by hand. */
  function manual() {
    const listeners: Record<string, ((e: { data: unknown }) => void)[]> = {
      message: [],
      error: [],
    };
    const posted: unknown[] = [];
    let terminated = 0;
    const worker: ImportWorker = {
      postMessage: (m) => void posted.push(m),
      addEventListener: ((type: string, l: (e: { data: unknown }) => void) =>
        void listeners[type]!.push(l)) as ImportWorker['addEventListener'],
      terminate: () => void terminated++,
    };
    const send = (data: unknown) => listeners.message!.forEach((l) => l({ data }));
    return { worker, posted, send, terminated: () => terminated };
  }
  const options = {
    answer: (d: unknown) => (d as { n?: number }).n ?? undefined,
    timedOut: () => -1,
    failed: () => -2,
  };

  it('waits past messages that aren’t its answer, settles once, and ends the worker', async () => {
    const m = manual();
    const job = runInWorker(() => m.worker, { job: 'x' }, [], options);
    expect(m.posted).toEqual([{ job: 'x' }]);
    m.send({ progress: 1 });
    m.send({ n: 7 });
    m.send({ n: 8 });
    expect(await job).toBe(7);
    expect(m.terminated()).toBe(1);
  });

  it('settles with its own refusal after the time limit', async () => {
    const m = manual();
    expect(await runInWorker(() => m.worker, {}, [], { ...options, timeLimitMs: 10 })).toBe(-1);
    expect(m.terminated()).toBe(1);
  });
});

describe('runInWorker, step by step (a model pack)', () => {
  it('gives each reported step a fresh time limit, so a long job finishes', async () => {
    const listeners: ((e: { data: unknown }) => void)[] = [];
    let terminated = 0;
    const worker: ImportWorker = {
      postMessage: () => {
        // Five steps 15 ms apart, then the answer: 90 ms in all, against a 40 ms limit per step.
        for (let i = 1; i <= 5; i++)
          setTimeout(() => listeners.forEach((l) => l({ data: { step: i } })), i * 15);
        setTimeout(() => listeners.forEach((l) => l({ data: { done: 'yes' } })), 90);
      },
      addEventListener: ((type: string, l: (e: { data: unknown }) => void) =>
        type === 'message'
          ? void listeners.push(l)
          : undefined) as ImportWorker['addEventListener'],
      terminate: () => void terminated++,
    };
    const result = await runInWorker(() => worker, {}, [], {
      answer: (d) => (d as { done?: string }).done,
      progress: (d) => (d as { step?: number }).step !== undefined,
      timedOut: () => 'too slow',
      failed: () => 'failed',
      timeLimitMs: 40,
    });
    expect(result).toBe('yes');
    expect(terminated).toBe(1);
  });
});

describe('openModelPackInWorker (spec 17, section 5)', () => {
  it('opens a pack in the worker, every model checked, and ends the worker', async () => {
    const { writeModelPack } = await import('./model-pack-file.ts');
    const { importModel } = await import('./import.ts');
    const { openModelPackInWorker } = await import('./worker-client.ts');
    const r = await importModel(
      new Map([['crate.glb', await glbFromMesh(box([0, 0, 0], [1, 1, 1]))]]),
      choices,
      tools,
    );
    if (!r.ok) throw new Error('import failed');
    const pack = writeModelPack([{ item: r.item, files: r.files }]);
    const fake = fakeWorker(true);
    const progress: [number, number][] = [];
    const opened = await openModelPackInWorker(() => fake.worker, pack, [], {
      onProgress: (n, total) => void progress.push([n, total]),
    });
    expect(progress).toEqual([[1, 1]]);
    expect(opened).toMatchObject({ ok: true, leftOut: [], models: [{ item: { id: r.item.id } }] });
    expect(fake.terminated()).toBe(1);
    const again = await openModelPackInWorker(() => fakeWorker(true).worker, pack, [r.item.id]);
    expect(again).toMatchObject({ ok: true, models: [], leftOut: [{ name: 'Crate' }] });
  });
});
