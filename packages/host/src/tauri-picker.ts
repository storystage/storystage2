/**
 * The Tauri desktop apps' file picker (spec 05 section 6.5): the system's dialog, opened by the
 * native layer, so the webview never holds a path. Bytes cross as raw bodies, and names as
 * headers, encoded with `encodeURIComponent` as a header carries only plain ASCII.
 */
import {
  FILE_ERROR_CODES,
  FILE_LIMIT,
  FileError,
  collectedPath,
  safeFileName,
  type CollectedFile,
  type FileErrorCode,
  type FilePicker,
} from './files.ts';
import type { Invoke } from './speech.ts';

export const PICKER_COMMANDS = {
  kind: 'picker_kind',
  save: 'picker_save',
  open: 'picker_open',
  collectStart: 'picker_collect_start',
  collectWrite: 'picker_collect_write',
  handBackStart: 'picker_hand_back_start',
  handBackRead: 'picker_hand_back_read',
  end: 'picker_end',
} as const;

/** A name: a copy's suggested name, or Collect's `folder/file`. */
export const NAME_HEADER = 'x-storystage-name';
/** The Collect a write belongs to. */
export const SESSION_HEADER = 'x-storystage-session';

const EXTENSION = '.storystage';

function asFileError(reason: unknown): FileError {
  if (reason instanceof FileError) return reason;
  const known = FILE_ERROR_CODES.includes(reason as FileErrorCode);
  return new FileError(known ? (reason as FileErrorCode) : 'unreadable');
}

const isCollectName = (file: CollectedFile) =>
  file.folder === safeFileName(file.folder) &&
  file.file === safeFileName(file.file) &&
  file.file.endsWith(EXTENSION) &&
  file.file.length > EXTENSION.length;

/** Open's raw reply: the name's length in four bytes, big-endian, the name, then the file. */
function splitOpened(reply: unknown): { name: string; bytes: Uint8Array } {
  if (!(reply instanceof ArrayBuffer) || reply.byteLength < 4) throw new FileError('internal');
  const length = new DataView(reply).getUint32(0);
  if (4 + length > reply.byteLength) throw new FileError('internal');
  const name = new TextDecoder().decode(new Uint8Array(reply, 4, length));
  return { name, bytes: new Uint8Array(reply, 4 + length) };
}

function isHandBack(
  value: unknown,
): value is { session: string; files: { folder: string; file: string }[] } {
  if (typeof value !== 'object' || value === null) return false;
  const { session, files } = value as Record<string, unknown>;
  return (
    typeof session === 'string' &&
    Array.isArray(files) &&
    files.every(
      (file: unknown) =>
        typeof file === 'object' &&
        file !== null &&
        typeof (file as Record<string, unknown>).folder === 'string' &&
        typeof (file as Record<string, unknown>).file === 'string',
    )
  );
}

/** `limit` stands in for `FILE_LIMIT` in tests only. */
export function tauriPicker(invoke: Invoke, limit = FILE_LIMIT): FilePicker {
  const call = (...args: Parameters<Invoke>) =>
    invoke(...args).catch((reason: unknown) => {
      throw asFileError(reason);
    });
  const end = (session: string) => call(PICKER_COMMANDS.end, { session }).catch(() => undefined);

  return {
    async saveCopy(suggestedName, bytes) {
      if (bytes.length > limit) throw new FileError('too_big');
      const headers = { [NAME_HEADER]: encodeURIComponent(suggestedName) };
      await call(PICKER_COMMANDS.save, bytes, { headers });
    },

    async open() {
      return splitOpened(await call(PICKER_COMMANDS.open));
    },

    async collect(files) {
      // Everything is checked before the teacher is asked for a folder, so nothing is written.
      const names = new Set(files.map(collectedPath));
      if (names.size !== files.length || !files.every(isCollectName)) {
        throw new FileError('invalid');
      }
      if (files.some((file) => file.bytes.length > limit)) throw new FileError('too_big');
      const session = await call(PICKER_COMMANDS.collectStart);
      if (typeof session !== 'string') throw new FileError('internal');
      try {
        for (const file of files) {
          const headers = {
            [SESSION_HEADER]: encodeURIComponent(session),
            [NAME_HEADER]: encodeURIComponent(`${file.folder}/${file.file}`),
          };
          await call(PICKER_COMMANDS.collectWrite, file.bytes, { headers });
        }
        return files.length;
      } finally {
        await end(session);
      }
    },

    async handBack() {
      const listed = await call(PICKER_COMMANDS.handBackStart);
      if (!isHandBack(listed)) throw new FileError('internal');
      try {
        const files: CollectedFile[] = [];
        for (const [index, { folder, file }] of listed.files.entries()) {
          const reply = await call(PICKER_COMMANDS.handBackRead, {
            session: listed.session,
            index,
          });
          if (!(reply instanceof ArrayBuffer)) throw new FileError('internal');
          if (reply.byteLength > limit) throw new FileError('too_big');
          files.push({ folder, file, bytes: new Uint8Array(reply) });
        }
        return files;
      } finally {
        await end(listed.session);
      }
    },
  };
}

/** The native picker on desktop; the webview's own pickers where the native layer says so. */
export async function readPickerKind(invoke: Invoke): Promise<'native' | 'browser'> {
  try {
    return (await invoke(PICKER_COMMANDS.kind)) === 'native' ? 'native' : 'browser';
  } catch {
    return 'browser';
  }
}
