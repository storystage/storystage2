import { describe, expect, it } from 'vitest';
import {
  browserStore,
  type DirectoryHandleLike,
  type FileHandleLike,
  type WritableLike,
} from './browser-store.ts';
import { storedClassFolders } from './class-folders.ts';
import { describeClassFoldersContract } from './testing/conformance.ts';

const domError = (name: string) => Object.assign(new Error(name), { name });

/**
 * A stand-in for the Origin Private File System's handles. A writable keeps its bytes aside until
 * it's closed, as the real one does with its swap file.
 */
function fakeDirectory(): DirectoryHandleLike {
  const files = new Map<string, Uint8Array>();
  const folders = new Map<string, DirectoryHandleLike>();
  const fileHandle = (name: string): FileHandleLike => ({
    kind: 'file',
    async getFile() {
      const bytes = files.get(name) ?? new Uint8Array();
      return { arrayBuffer: async () => bytes.slice().buffer };
    },
    async createWritable(): Promise<WritableLike> {
      let pending = new Uint8Array();
      return {
        async write(data) {
          pending = new Uint8Array(data);
        },
        async close() {
          files.set(name, pending);
        },
        async abort() {},
      };
    },
  });
  const self: DirectoryHandleLike = {
    kind: 'directory',
    async getDirectoryHandle(name, options = {}) {
      if (files.has(name)) throw domError('TypeMismatchError');
      let folder = folders.get(name);
      if (!folder) {
        if (!options.create) throw domError('NotFoundError');
        folder = fakeDirectory();
        folders.set(name, folder);
      }
      return folder;
    },
    async getFileHandle(name, options = {}) {
      if (folders.has(name)) throw domError('TypeMismatchError');
      if (!files.has(name)) {
        if (!options.create) throw domError('NotFoundError');
        files.set(name, new Uint8Array());
      }
      return fileHandle(name);
    },
    async removeEntry(name) {
      if (!files.delete(name) && !folders.delete(name)) throw domError('NotFoundError');
    },
    async *entries() {
      for (const name of files.keys()) yield [name, fileHandle(name)] as [string, FileHandleLike];
      for (const [name, folder] of folders) yield [name, folder] as [string, DirectoryHandleLike];
    },
  };
  return self;
}

describeClassFoldersContract('the browser store', () => {
  const root = fakeDirectory();
  return storedClassFolders(browserStore(async () => root));
});

describe('the browser store', () => {
  const bytes = new TextEncoder().encode('a film');

  it('keeps everything in a classes folder of its own', async () => {
    const root = fakeDirectory();
    await browserStore(async () => root).write(['class.json'], bytes);
    expect((await root.getDirectoryHandle('classes')).kind).toBe('directory');
  });

  it('touches nothing until it is first used', () => {
    let asked = false;
    browserStore(async () => {
      asked = true;
      return fakeDirectory();
    });
    expect(asked).toBe(false);
  });

  it('says a full disk is full, and a held file is locked', async () => {
    const failing = (name: string): DirectoryHandleLike => ({
      ...fakeDirectory(),
      async getFileHandle() {
        throw domError(name);
      },
      async getDirectoryHandle() {
        return failing(name);
      },
    });
    await expect(
      browserStore(async () => failing('QuotaExceededError')).write(['x'], bytes),
    ).rejects.toMatchObject({
      code: 'full',
    });
    await expect(
      browserStore(async () => failing('NoModificationAllowedError')).write(['x'], bytes),
    ).rejects.toMatchObject({ code: 'locked' });
  });

  it('says unreadable when the browser has no storage to give, and asks again next time', async () => {
    let tries = 0;
    const root = fakeDirectory();
    const store = browserStore(async () => {
      tries += 1;
      if (tries === 1) throw domError('SecurityError');
      return root;
    });
    await expect(store.read(['class.json'])).rejects.toMatchObject({ code: 'unreadable' });
    expect(await store.read(['class.json'])).toBeNull();
  });

  it('refuses a path that isn’t safe, before touching anything', async () => {
    const store = browserStore(async () => fakeDirectory());
    for (const path of [['..'], ['a', '..', 'b'], ['A'], ['a/b'], []]) {
      await expect(store.write(path, bytes)).rejects.toMatchObject({ code: 'internal' });
    }
  });
});
