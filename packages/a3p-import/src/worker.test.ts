import { writeArchive } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import type { ImportResult } from './import.ts';
import type { AliceImportAnswer, AliceImportMessage } from './messages.ts';
import { serveAliceImports, type WorkerPort } from './worker.ts';

// The worker's side, through a port that clones every message as a real worker's would.

const A = 'org.lgna.project.ast.';
/** The smallest world Alice writes: Program, a scene with a camera, and myFirstMethod. */
const PROGRAM = `<node key="1" type="${A}NamedUserType"><property name="name"><value type="java.lang.String">Program</value></property><property name="superType"><node key="2" type="${A}JavaType"><type name="org.lgna.story.SProgram"/></node></property><property name="methods"><collection type="java.util.ArrayList"/></property><property name="fields"><collection type="java.util.ArrayList"><node key="3" type="${A}UserField"><property name="name"><value type="java.lang.String">myScene</value></property><property name="valueType"><node key="4" type="${A}NamedUserType"><property name="name"><value type="java.lang.String">Scene</value></property><property name="superType"><node key="5" type="${A}JavaType"><type name="org.lgna.story.SScene"/></node></property><property name="fields"><collection type="java.util.ArrayList"><node key="6" type="${A}UserField"><property name="name"><value type="java.lang.String">camera</value></property><property name="valueType"><node key="7" type="${A}JavaType"><type name="org.lgna.story.SCamera"/></node></property><property name="managementLevel"><value type="${A}ManagementLevel">MANAGED</value></property></node></collection></property><property name="methods"><collection type="java.util.ArrayList"><node key="8" type="${A}UserMethod"><property name="name"><value type="java.lang.String">myFirstMethod</value></property><property name="managementLevel"><value type="${A}ManagementLevel">NONE</value></property><property name="requiredParameters"><collection type="java.util.ArrayList"/></property><property name="body"><node type="${A}BlockStatement"><property name="statements"><collection type="java.util.ArrayList"/></property></node></property></node></collection></property></node></property><property name="managementLevel"><value type="${A}ManagementLevel">NONE</value></property></node></collection></property></node>`;

const world = () =>
  writeArchive(
    Object.entries({ 'version.txt': '3.3.0.0.0', 'programType.xml': PROGRAM }).map(
      ([name, text]) => ({
        name,
        bytes: new TextEncoder().encode(text),
      }),
    ),
  );

/** The worker's side behind a port; answers come back as a real worker's would. */
function serve() {
  const listeners: ((event: { data: unknown }) => void)[] = [];
  const answers: AliceImportAnswer[] = [];
  const port: WorkerPort = {
    postMessage: (m) => void answers.push(structuredClone(m) as AliceImportAnswer),
    addEventListener: (_type, l) => void listeners.push(l),
  };
  serveAliceImports(port);
  const send = (data: unknown) => listeners.forEach((l) => l({ data: structuredClone(data) }));
  return { send, answers };
}

const ask = (bytes: Uint8Array, models = new Map()): AliceImportMessage => ({
  type: 'importAlice',
  request: { bytes, fileName: 'tiny.a3p', models },
});

describe('serveAliceImports', () => {
  it('answers an import with the production, which survives the crossing intact', () => {
    const { send, answers } = serve();
    send(ask(world()));
    expect(answers).toHaveLength(1);
    const { result } = answers[0]!;
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.production.manifest).toMatchObject({ title: 'tiny', origin: 'alice' });
    expect(result.production.program.types[0]!.name).toBe('Scene');
    expect(result.sizes).toBeInstanceOf(Map);
  });

  it('passes on a refusal in plain words', () => {
    const { send, answers } = serve();
    send(ask(new TextEncoder().encode('not a zip')));
    const result: ImportResult = answers[0]!.result;
    expect(result).toMatchObject({ ok: false, problem: { code: 'notAnArchive' } });
  });

  it('ignores anything that isn’t an import', () => {
    const { send, answers } = serve();
    send({ type: 'hello' });
    send(null);
    expect(answers).toEqual([]);
  });

  it('refuses rather than throws when the import itself breaks', () => {
    const { send, answers } = serve();
    // Models that aren't a Map break the import, as a bug would.
    send({
      type: 'importAlice',
      request: { bytes: world(), fileName: 'x.a3p', models: { get: 1 } },
    });
    expect(answers[0]!.result).toMatchObject({ ok: false, problem: { code: 'broke' } });
  });
});
