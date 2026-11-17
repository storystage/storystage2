/** A file store in memory for this package's tests, with the host's rules about paths. */
import { checkPath, type FileStore, type StorePath } from '@storystage/host';

export function memoryFiles(): FileStore & { readonly files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  const key = (path: StorePath) => checkPath(path).join('/');
  return {
    files,
    async read(path) {
      return files.get(key(path)) ?? null;
    },
    async write(path, bytes) {
      files.set(key(path), bytes.slice());
    },
    async remove(path) {
      const k = key(path);
      for (const name of [...files.keys()])
        if (name === k || name.startsWith(`${k}/`)) files.delete(name);
    },
    async list(path) {
      const prefix = `${key(path)}/`;
      return [
        ...new Set(
          [...files.keys()]
            .filter((n) => n.startsWith(prefix))
            .map((n) => n.slice(prefix.length).split('/')[0]!),
        ),
      ];
    },
    async move() {
      throw new Error('not used');
    },
  };
}
