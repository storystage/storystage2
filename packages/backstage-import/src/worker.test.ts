import { describe, expect, it } from 'vitest';
import { box, glbFromMesh } from '@storystage/sketches/testing';
import type { ImportChoices, ImportTools } from './import.ts';
import { importInWorker, serveImports, type ImportWorker, type WorkerPort } from './worker.ts';

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
