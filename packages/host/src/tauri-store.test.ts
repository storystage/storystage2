import { describe, expect, it } from 'vitest';
import parts from '../../../apps/desktop/src-tauri/classes/fixtures/parts.json';
import { storedClassFolders } from './class-folders.ts';
import { FileError } from './files.ts';
import type { Invoke } from './speech.ts';
import { isSafePart, type StorePath } from './store.ts';
import { CLASSES_COMMANDS, PATH_HEADER, tauriStore } from './tauri-store.ts';
import { describeClassFoldersContract } from './testing/conformance.ts';
import { memoryStore } from './testing/memory-files.ts';

interface Call {
  readonly command: string;
  readonly args: unknown;
  readonly headers?: Record<string, string>;
}

/**
 * The native commands, as the Tauri side answers them, over a memory store: raw bytes for a read,
 * `not_found` for nothing there, and codes as text for every failure.
 */
function nativeCommands(calls: Call[] = []): Invoke {
  const store = memoryStore();
  const answer = async (promise: Promise<unknown>) =>
    promise.catch((error: unknown) => {
      throw error instanceof FileError ? error.code : 'internal';
    });
  return async (command, args, options) => {
    calls.push({ command, args, headers: options?.headers });
    const named = (args ?? {}) as Record<string, StorePath>;
    switch (command) {
      case CLASSES_COMMANDS.read:
        return answer(
          store.read(named.path ?? []).then((bytes) => {
            if (bytes === null) throw new FileError('not_found');
            return bytes.slice().buffer;
          }),
        );
      case CLASSES_COMMANDS.write: {
        const path = (options?.headers?.[PATH_HEADER] ?? '').split('/');
        if (!(args instanceof Uint8Array)) throw 'internal';
        return answer(store.write(path, args));
      }
      case CLASSES_COMMANDS.remove:
        return answer(store.remove(named.path ?? []));
      case CLASSES_COMMANDS.list:
        return answer(store.list(named.path ?? []));
      case CLASSES_COMMANDS.move:
        return answer(store.move(named.from ?? [], named.to ?? []));
      default:
        throw `unknown command ${command}`;
    }
  };
}

describeClassFoldersContract('the native store', () =>
  storedClassFolders(tauriStore(nativeCommands())),
);

describe('the native store', () => {
  const bytes = new TextEncoder().encode('a film');

  it('sends a write as a raw body, with its path in a header', async () => {
    const calls: Call[] = [];
    await tauriStore(nativeCommands(calls)).write(['pupils', 'pupil-a', 'v-1.storystage'], bytes);
    expect(calls).toEqual([
      {
        command: 'classes_write',
        args: bytes,
        headers: { [PATH_HEADER]: 'pupils/pupil-a/v-1.storystage' },
      },
    ]);
  });

  it('reads nothing there as null, and a failure as its code', async () => {
    const store = tauriStore(nativeCommands());
    expect(await store.read(['class.json'])).toBeNull();
    const failing: Invoke = () => Promise.reject('full');
    await expect(tauriStore(failing).write(['class.json'], bytes)).rejects.toMatchObject({
      code: 'full',
    });
    const odd: Invoke = () => Promise.reject(new Error('the IPC broke'));
    await expect(tauriStore(odd).read(['class.json'])).rejects.toMatchObject({
      code: 'unreadable',
    });
  });

  it('refuses an unsafe path before calling the native layer', async () => {
    const calls: Call[] = [];
    const store = tauriStore(nativeCommands(calls));
    for (const path of [['..'], ['con'], ['a', 'x.'], []]) {
      await expect(store.write(path, bytes)).rejects.toMatchObject({ code: 'internal' });
      await expect(store.read(path)).rejects.toMatchObject({ code: 'internal' });
    }
    expect(calls).toEqual([]);
  });

  it('refuses a reply that isn’t what the command gives', async () => {
    const wrong: Invoke = async () => 'not bytes';
    await expect(tauriStore(wrong).read(['class.json'])).rejects.toMatchObject({
      code: 'internal',
    });
    await expect(tauriStore(wrong).list(['pupils'])).rejects.toMatchObject({ code: 'internal' });
  });
});

describe('safe parts are the same on both sides (fixtures/parts.json)', () => {
  it.each(parts.safe)('allows %j', (part) => {
    expect(isSafePart(part)).toBe(true);
  });

  it.each(parts.unsafe)('refuses %j', (part) => {
    expect(isSafePart(part)).toBe(false);
  });
});
