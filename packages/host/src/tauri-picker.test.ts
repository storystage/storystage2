import { describe, expect, it } from 'vitest';
import type { CollectedFile } from './files.ts';
import type { Invoke } from './speech.ts';
import {
  NAME_HEADER,
  PICKER_COMMANDS,
  SESSION_HEADER,
  readPickerKind,
  tauriPicker,
} from './tauri-picker.ts';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

interface Call {
  readonly command: string;
  readonly args: unknown;
  readonly headers?: Record<string, string>;
}

/**
 * The native commands as the Rust side answers them, with a dialog the test scripts: `null` is
 * the person closing it. Collect writes into `written`; Hand back reads from `chosen`.
 */
function native(
  dialog: { open?: { name: string; bytes: Uint8Array } | null; folder?: boolean } = {},
  chosen: CollectedFile[] = [],
) {
  const calls: Call[] = [];
  const written: Record<string, string> = {};
  const sessions = new Set<string>();
  const invoke: Invoke = async (command, args, options) => {
    calls.push({ command, args, headers: options?.headers });
    const header = (name: string) => decodeURIComponent(options?.headers?.[name] ?? '');
    const named = (args ?? {}) as Record<string, unknown>;
    switch (command) {
      case PICKER_COMMANDS.save:
        return dialog.folder === false ? Promise.reject('cancelled') : undefined;
      case PICKER_COMMANDS.open: {
        if (!dialog.open) throw 'cancelled';
        const name = bytes(dialog.open.name);
        const reply = new Uint8Array(4 + name.length + dialog.open.bytes.length);
        new DataView(reply.buffer).setUint32(0, name.length);
        reply.set(name, 4);
        reply.set(dialog.open.bytes, 4 + name.length);
        return reply.buffer;
      }
      case PICKER_COMMANDS.collectStart:
      case PICKER_COMMANDS.handBackStart: {
        if (dialog.folder === false) throw 'cancelled';
        const session = `picked-${sessions.size}`;
        sessions.add(session);
        if (command === PICKER_COMMANDS.collectStart) return session;
        return { session, files: chosen.map(({ folder, file }) => ({ folder, file })) };
      }
      case PICKER_COMMANDS.collectWrite:
        if (!sessions.has(header(SESSION_HEADER))) throw 'internal';
        written[header(NAME_HEADER)] = text(args as Uint8Array);
        return undefined;
      case PICKER_COMMANDS.handBackRead: {
        if (!sessions.has(named.session as string)) throw 'internal';
        const file = chosen[named.index as number];
        if (!file) throw 'not_found';
        return file.bytes.slice().buffer;
      }
      case PICKER_COMMANDS.end:
        sessions.delete(named.session as string);
        return undefined;
      default:
        throw 'internal';
    }
  };
  return { invoke, calls, written, sessions };
}

const film = (folder: string, file = 'Film.storystage', data = 'x'): CollectedFile => ({
  folder,
  file,
  bytes: bytes(data),
});

describe('the native picker (spec 05 section 6.5)', () => {
  it('saves a copy as a raw body, with its name encoded in a header', async () => {
    const { invoke, calls } = native();
    await tauriPicker(invoke).saveCopy('Zoë’s Owl.storystage', bytes('owl'));
    expect(calls).toEqual([
      {
        command: 'picker_save',
        args: bytes('owl'),
        headers: { [NAME_HEADER]: encodeURIComponent('Zoë’s Owl.storystage') },
      },
    ]);
  });

  it('opens a file, its name and bytes in one raw reply', async () => {
    const { invoke } = native({ open: { name: 'Zoë.storystage', bytes: bytes('a film') } });
    const opened = await tauriPicker(invoke).open();
    expect(opened.name).toBe('Zoë.storystage');
    expect(text(opened.bytes)).toBe('a film');
  });

  it('says cancelled when the person closes the dialog', async () => {
    const { invoke } = native({ open: null, folder: false });
    const picker = tauriPicker(invoke);
    await expect(picker.open()).rejects.toMatchObject({ code: 'cancelled' });
    await expect(picker.collect([film('Ava')])).rejects.toMatchObject({ code: 'cancelled' });
    await expect(picker.handBack()).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('collects every file into the picked folder, then forgets it', async () => {
    const { invoke, written, sessions } = native();
    expect(await tauriPicker(invoke).collect([film('Ava'), film('Zoë', 'Owl.storystage')])).toBe(2);
    expect(written).toEqual({ 'Ava/Film.storystage': 'x', 'Zoë/Owl.storystage': 'x' });
    expect(sessions.size).toBe(0);
  });

  it('refuses a clash, an unsafe name or a file over the limit before asking for a folder', async () => {
    const { invoke, calls } = native();
    const picker = tauriPicker(invoke, 3);
    for (const files of [
      [film('Sam', 'Pip.storystage'), film('sam', 'pip.storystage')],
      [film('../Ava')],
      [film('Ava', 'Film.exe')],
    ]) {
      await expect(picker.collect(files)).rejects.toMatchObject({ code: 'invalid' });
    }
    await expect(picker.collect([film('Ava', 'Film.storystage', 'long')])).rejects.toMatchObject({
      code: 'too_big',
    });
    await expect(picker.saveCopy('Film.storystage', bytes('long'))).rejects.toMatchObject({
      code: 'too_big',
    });
    expect(calls).toEqual([]);
  });

  it('hands back what the native layer found, then forgets the folder', async () => {
    const chosen = [film('Ava', 'Film.storystage', 'a'), film('Ben', 'Owl.storystage', 'b')];
    const { invoke, sessions } = native({}, chosen);
    const back = await tauriPicker(invoke).handBack();
    expect(back.map((file) => `${file.folder}/${file.file}=${text(file.bytes)}`)).toEqual([
      'Ava/Film.storystage=a',
      'Ben/Owl.storystage=b',
    ]);
    expect(sessions.size).toBe(0);
  });

  it('forgets the folder even when a write fails part-way', async () => {
    const { invoke, sessions } = native();
    const failing: Invoke = (command, args, options) =>
      command === PICKER_COMMANDS.collectWrite
        ? Promise.reject('full')
        : invoke(command, args, options);
    await expect(tauriPicker(failing).collect([film('Ava')])).rejects.toMatchObject({
      code: 'full',
    });
    expect(sessions.size).toBe(0);
  });

  it('refuses a reply that isn’t what the command gives', async () => {
    const wrong: Invoke = async () => 'nonsense';
    await expect(tauriPicker(wrong).open()).rejects.toMatchObject({ code: 'internal' });
    await expect(tauriPicker(wrong).handBack()).rejects.toMatchObject({ code: 'internal' });
  });
});

describe('which picker the apps use', () => {
  it('is native where the native layer says so, and the browser’s otherwise', async () => {
    expect(await readPickerKind(async () => 'native')).toBe('native');
    expect(await readPickerKind(async () => 'browser')).toBe('browser');
    expect(await readPickerKind(() => Promise.reject(new Error('no such command')))).toBe(
      'browser',
    );
  });
});
