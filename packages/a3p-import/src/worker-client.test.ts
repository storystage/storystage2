import { readFileSync } from 'node:fs';
import { writeArchive } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { importAliceInWorker, type ImportWorker } from './worker-client.ts';
import { serveAliceImports, type WorkerPort } from './worker.ts';

// The studio's side, against a worker in the same thread: messages cross with a structured clone.

type Listener = (event: { data: unknown }) => void;

/** A fake worker: `serve` runs the real worker side; otherwise it never answers, or it fails. */
function fakeWorker(mode: 'serve' | 'silent' | 'fail') {
  const toWorker: Listener[] = [];
  const toStudio: Listener[] = [];
  const errors: ((e: unknown) => void)[] = [];
  const posted: unknown[] = [];
  let terminated = 0;
  const workerSide: WorkerPort = {
    postMessage: (m) =>
      queueMicrotask(() => toStudio.forEach((l) => l({ data: structuredClone(m) }))),
    addEventListener: (_t, l) => void toWorker.push(l),
  };
  if (mode === 'serve') serveAliceImports(workerSide);
  const worker: ImportWorker = {
    postMessage: (m) => {
      posted.push(m);
      if (mode === 'fail') queueMicrotask(() => errors.forEach((l) => l(new Error('worker died'))));
      else queueMicrotask(() => toWorker.forEach((l) => l({ data: structuredClone(m) })));
    },
    addEventListener: ((type: string, l: Listener) =>
      type === 'message'
        ? void toStudio.push(l)
        : void errors.push(l as (e: unknown) => void)) as ImportWorker['addEventListener'],
    terminate: () => void terminated++,
  };
  return { worker, posted, terminated: () => terminated };
}

const A = 'org.lgna.project.ast.';
const scene = `<node key="4" type="${A}NamedUserType"><property name="name"><value type="java.lang.String">Scene</value></property><property name="superType"><node key="5" type="${A}JavaType"><type name="org.lgna.story.SScene"/></node></property><property name="fields"><collection type="java.util.ArrayList"/></property><property name="methods"><collection type="java.util.ArrayList"/></property></node>`;
const PROGRAM = `<node key="1" type="${A}NamedUserType"><property name="name"><value type="java.lang.String">Program</value></property><property name="superType"><node key="2" type="${A}JavaType"><type name="org.lgna.story.SProgram"/></node></property><property name="fields"><collection type="java.util.ArrayList"><node key="3" type="${A}UserField"><property name="name"><value type="java.lang.String">myScene</value></property><property name="valueType">${scene}</property></node></collection></property></node>`;
const world = () =>
  writeArchive(
    Object.entries({ 'version.txt': '3.3.0.0.0', 'programType.xml': PROGRAM }).map(
      ([name, text]) => ({
        name,
        bytes: new TextEncoder().encode(text),
      }),
    ),
  );

describe('importAliceInWorker', () => {
  it('imports in the worker, gives back the production, and ends the worker', async () => {
    const fake = fakeWorker('serve');
    const bytes = world();
    const result = await importAliceInWorker(() => fake.worker, bytes, 'tiny.a3p', new Map());
    expect(result).toMatchObject({
      ok: true,
      production: { manifest: { title: 'tiny', origin: 'alice' } },
    });
    expect(fake.terminated()).toBe(1);
    // The caller keeps its own bytes: the worker was sent a copy.
    expect((fake.posted[0] as { request: { bytes: Uint8Array } }).request.bytes).not.toBe(bytes);
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('refuses in plain words when the worker fails', async () => {
    const fake = fakeWorker('fail');
    const result = await importAliceInWorker(() => fake.worker, world(), 'x.a3p', new Map());
    expect(result).toMatchObject({ ok: false, problem: { code: 'broke' } });
    expect(fake.terminated()).toBe(1);
  });

  it('stops after the time limit, and says so', async () => {
    const fake = fakeWorker('silent');
    const result = await importAliceInWorker(() => fake.worker, world(), 'x.a3p', new Map(), {
      timeLimitMs: 20,
    });
    expect(result).toMatchObject({ ok: false, problem: { code: 'timedOut' } });
    if (!result.ok) expect(result.problem.message).toMatch(/took too long/);
    expect(fake.terminated()).toBe(1);
  });

  it('loads nothing heavy: only the message shapes and S4’s runInWorker', () => {
    const source = readFileSync(new URL('./worker-client.ts', import.meta.url), 'utf8');
    const loaded = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+'([^']+)'/gms)].map(
      (m) => m[1],
    );
    expect(loaded.sort()).toEqual(['./messages.ts', '@storystage/backstage-import/worker-client']);
  });
});
