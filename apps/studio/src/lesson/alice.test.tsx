import { importAliceWorld, type ImportResult } from '@storystage/a3p-import';
import type { ImportWorker } from '@storystage/a3p-import/worker-client';
import { browserHost, type HostInterface } from '@storystage/host';
import { memoryClassFolders, memoryFilePicker } from '@storystage/host/testing';
import { exampleProduction, openProduction } from '@storystage/production';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';

// "Open an Alice world…" (spec 19, sections 7 and 8): S6's import in its worker, opened as a new
// film in the pupil's folder, and the report of what came across.

/** A worker that answers like S6's: with `answer`, or by running the real import here. */
function aliceWorker(answer?: ImportResult): () => ImportWorker {
  return () => {
    const listeners: ((event: { data: unknown }) => void)[] = [];
    return {
      postMessage(message: unknown) {
        const { request } = message as {
          request: { bytes: Uint8Array; fileName: string; models: ReadonlyMap<string, never> };
        };
        const result =
          answer ??
          importAliceWorld(request.bytes, { fileName: request.fileName, models: request.models });
        queueMicrotask(() =>
          listeners.forEach((l) => l({ data: { type: 'aliceResult', result } })),
        );
      },
      addEventListener(type: string, listener: (event: { data: unknown }) => void) {
        if (type === 'message') listeners.push(listener);
      },
      terminate() {},
    };
  };
}

function moonWalk(gaps: boolean): ImportResult {
  const p = exampleProduction();
  const production = {
    ...p,
    manifest: { ...p.manifest, title: 'Moon walk', origin: 'alice' as const },
  };
  const list = gaps
    ? [
        {
          kind: 'model' as const,
          what: 'the mango tree’s model',
          where: 'Scene, set-up',
          why: 'Not in Backstage yet: a labelled stand-in holds its place.',
        },
        {
          kind: 'block' as const,
          what: 'cat move toward',
          where: 'Scene.myFirstMethod, statement 3',
          why: 'StoryStage has no block for this yet; a note holds its place.',
        },
      ]
    : [];
  const counts = { model: 0, setUp: 0, class: 0, block: 0, value: 0, event: 0, unknown: 0 };
  for (const g of list) counts[g.kind]++;
  return { ok: true, production, report: { gaps: list, counts }, sizes: new Map() };
}

async function inStudio(startAlice: () => ImportWorker) {
  const classes = memoryClassFolders();
  const sam = await classes.addPupil('Sam');
  const host: HostInterface = {
    ...browserHost,
    version: '1.0.0',
    classes,
    picker: memoryFilePicker(),
    storagePersistent: async () => true,
  };
  render(<App host={host} startAlice={startAlice} />);
  await userEvent.click(await screen.findByRole('row', { name: 'Sam' }));
  await screen.findByRole('textbox', { name: 'Title' });
  await userEvent.click(screen.getByRole('button', { name: /^Film:/ }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Open an Alice world…' }));
  return { folder: await classes.folder(sam.id) };
}

const pick = (name: string, bytes: Uint8Array | string) =>
  userEvent.upload(
    screen.getByLabelText('An Alice world to open'),
    new File([typeof bytes === 'string' ? bytes : bytes.slice()], name),
  );

describe('Open an Alice world (spec 19)', () => {
  it('opens the world as a new film, saved at once, and reports what didn’t come across', async () => {
    const { folder } = await inStudio(aliceWorker(moonWalk(true)));
    await pick('moon walk.a3p', 'a world');
    const report = await screen.findByRole('dialog', { name: 'From Alice: Moon walk' });
    expect(within(report).getByRole('heading', { name: 'Models (1)' })).toBeTruthy();
    expect(within(report).getByRole('heading', { name: 'Blocks (1)' })).toBeTruthy();
    expect(within(report).getByText('cat move toward')).toBeTruthy();
    expect(within(report).getByText('Scene.myFirstMethod, statement 3')).toBeTruthy();
    expect(within(report).queryByRole('heading', { name: /Set-up/ })).toBeNull();
    await userEvent.click(within(report).getByRole('button', { name: 'Start working' }));
    expect(await screen.findByRole('button', { name: 'Film: Moon walk · Sam' })).toBeTruthy();
    // In My films straight away, as an Alice world.
    await waitFor(async () =>
      expect((await folder.list()).map((f) => f.name)).toEqual(['Moon walk']),
    );
    const [film] = await folder.list();
    const opened = openProduction(await folder.read(film!.key));
    expect(opened.status === 'ok' && opened.production.manifest.origin).toBe('alice');
  });

  it('says so in one line when everything came across', async () => {
    await inStudio(aliceWorker(moonWalk(false)));
    await pick('moon walk.a3p', 'a world');
    const report = await screen.findByRole('dialog', { name: 'From Alice: Moon walk' });
    expect(within(report).getByText('Everything in this world came across.')).toBeTruthy();
  });

  it('says why a file isn’t an Alice world, in S6’s words, and stays on the film', async () => {
    await inStudio(aliceWorker());
    await pick('notes.a3p', 'not a zip');
    expect(await screen.findByText("This isn't a file StoryStage can open.")).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Film: Untitled film · Sam' })).toBeTruthy();
  });
});
