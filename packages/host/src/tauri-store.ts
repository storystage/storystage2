/**
 * The Tauri apps' file store (spec 05 section 6.4): the native layer, through five commands
 * confined to `<local app data>/classes/`. Bytes cross as raw bodies, never JSON. Every path is
 * checked here as well as natively.
 */
import { FILE_ERROR_CODES, FileError, type FileErrorCode } from './files.ts';
import type { Invoke } from './speech.ts';
import { checkPath, type FileStore } from './store.ts';

export const CLASSES_COMMANDS = {
  read: 'classes_read',
  write: 'classes_write',
  remove: 'classes_remove',
  list: 'classes_list',
  move: 'classes_move',
} as const;

/** The header that carries a write's path: safe parts joined by `/`, which no safe part has. */
export const PATH_HEADER = 'x-storystage-path';

/** A command that failed answers with its code as text. Anything else is `unreadable`. */
function asFileError(reason: unknown): FileError {
  if (reason instanceof FileError) return reason;
  const known = FILE_ERROR_CODES.includes(reason as FileErrorCode);
  return new FileError(known ? (reason as FileErrorCode) : 'unreadable');
}

export function tauriStore(invoke: Invoke): FileStore {
  const call = (...args: Parameters<Invoke>) =>
    invoke(...args).catch((reason: unknown) => {
      throw asFileError(reason);
    });

  return {
    async read(path) {
      try {
        const reply = await call(CLASSES_COMMANDS.read, { path: checkPath(path) });
        if (!(reply instanceof ArrayBuffer)) throw new FileError('internal');
        return new Uint8Array(reply);
      } catch (error) {
        if (error instanceof FileError && error.code === 'not_found') return null;
        throw error;
      }
    },
    async write(path, bytes) {
      const headers = { [PATH_HEADER]: checkPath(path).join('/') };
      await call(CLASSES_COMMANDS.write, bytes, { headers });
    },
    async remove(path) {
      await call(CLASSES_COMMANDS.remove, { path: checkPath(path) });
    },
    async list(path) {
      const reply = await call(CLASSES_COMMANDS.list, { path: checkPath(path) });
      if (!Array.isArray(reply) || !reply.every((name) => typeof name === 'string')) {
        throw new FileError('internal');
      }
      return reply as string[];
    },
    async move(from, to) {
      await call(CLASSES_COMMANDS.move, { from: checkPath(from), to: checkPath(to) });
    },
  };
}
