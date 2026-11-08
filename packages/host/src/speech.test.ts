import { describe, expect, it } from 'vitest';
import {
  SPEECH_COMMANDS,
  SPEECH_MODEL_NAMES,
  SpeechModelError,
  tauriSpeech,
  type ChannelClass,
} from './speech.ts';

/** Records what was sent, and lets a test play the native side's channel messages. */
function fakeTauri(answer: (command: string, args?: Record<string, unknown>) => unknown) {
  const calls: { command: string; args?: Record<string, unknown> }[] = [];
  const channels: { onmessage: (message: unknown) => void }[] = [];
  const Channel = class {
    onmessage: (message: unknown) => void = () => {};
    constructor() {
      channels.push(this);
    }
  } as ChannelClass;
  const invoke = async (command: string, args?: Record<string, unknown>) => {
    calls.push({ command, args });
    return answer(command, args);
  };
  return { calls, channels, speech: tauriSpeech(invoke, Channel) };
}

const failWith = (code: string) => () => Promise.reject(code);

describe('speech models over the native commands', () => {
  it('names the two pinned models, and the commands in spec 05 section 5.5', () => {
    expect(SPEECH_MODEL_NAMES).toEqual(['tiny.en-q5_1', 'tiny.en']);
    expect(Object.values(SPEECH_COMMANDS)).toEqual([
      'speech_models',
      'speech_model_load',
      'speech_model_download',
      'speech_model_cancel',
      'speech_model_remove',
    ]);
  });

  it('lists the models', async () => {
    const models = [
      { name: 'tiny.en-q5_1', bytes: 32166155, bundled: true, ready: true },
      { name: 'tiny.en', bytes: 77704715, bundled: false, ready: false },
    ];
    const { speech } = fakeTauri(() => models);
    expect(await speech.list()).toEqual(models);
  });

  it('refuses a list it can’t read', async () => {
    const { speech } = fakeTauri(() => [{ name: 'large', bytes: 1, bundled: true, ready: true }]);
    await expect(speech.list()).rejects.toMatchObject({ code: 'internal' });
  });

  it('loads a model by name, as raw bytes', async () => {
    const bytes = new ArrayBuffer(8);
    const { speech, calls } = fakeTauri(() => bytes);
    expect(await speech.load('tiny.en-q5_1')).toBe(bytes);
    expect(calls).toEqual([{ command: 'speech_model_load', args: { name: 'tiny.en-q5_1' } }]);
  });

  it('refuses a load that isn’t bytes', async () => {
    const { speech } = fakeTauri(() => 'not bytes');
    await expect(speech.load('tiny.en')).rejects.toBeInstanceOf(SpeechModelError);
  });

  it.each([['not_downloaded'], ['check_failed'], ['refused_by_policy']])(
    'passes on the native layer’s %s',
    async (code) => {
      const invoke = failWith(code);
      const speech = tauriSpeech(
        invoke,
        class {
          onmessage = () => {};
        },
      );
      await expect(speech.load('tiny.en')).rejects.toMatchObject({ code });
    },
  );

  it('turns anything else into internal', async () => {
    const speech = tauriSpeech(
      failWith('something odd'),
      class {
        onmessage = () => {};
      },
    );
    await expect(speech.load('tiny.en')).rejects.toMatchObject({ code: 'internal' });
  });

  it('downloads with progress, then ends', async () => {
    const { speech, channels, calls } = fakeTauri(() => null);
    const progress: number[][] = [];
    const done = speech.download('tiny.en', (received, total) => progress.push([received, total]));
    await Promise.resolve();
    expect(calls[0]).toMatchObject({ command: 'speech_model_download', args: { name: 'tiny.en' } });
    const [channel] = channels;
    channel!.onmessage({ type: 'progress', received: 10, total: 77704715 });
    channel!.onmessage({ type: 'end' });
    await done;
    expect(progress).toEqual([[10, 77704715]]);
  });

  it('rejects with the download’s error', async () => {
    const { speech, channels } = fakeTauri(() => null);
    const done = speech.download('tiny.en');
    await Promise.resolve();
    channels[0]!.onmessage({ type: 'error', code: 'check_failed' });
    await expect(done).rejects.toMatchObject({ code: 'check_failed' });
  });

  it('cancels at once when aborted, through the native layer, whatever comes next', async () => {
    const { speech, channels, calls } = fakeTauri(() => null);
    const stop = new AbortController();
    const progress: number[] = [];
    const done = speech.download('tiny.en', (received) => progress.push(received), stop.signal);
    await Promise.resolve();
    stop.abort();
    await expect(done).rejects.toMatchObject({ code: 'cancelled' });
    expect(calls.map((call) => call.command)).toContain('speech_model_cancel');
    channels[0]!.onmessage({ type: 'progress', received: 5, total: 10 });
    channels[0]!.onmessage({ type: 'end' });
    expect(progress).toEqual([]);
  });

  it('doesn’t leave a failed cancel unhandled', async () => {
    const speech = tauriSpeech(
      (command) =>
        command === 'speech_model_cancel' ? Promise.reject('gone') : new Promise(() => {}),
      class {
        onmessage = () => {};
      },
    );
    const stop = new AbortController();
    const done = speech.download('tiny.en', undefined, stop.signal);
    stop.abort();
    await expect(done).rejects.toMatchObject({ code: 'cancelled' });
  });

  it('settles as internal on a message it doesn’t understand', async () => {
    const { speech, channels } = fakeTauri(() => null);
    const done = speech.download('tiny.en');
    await Promise.resolve();
    channels[0]!.onmessage({ type: 'unexpected' });
    await expect(done).rejects.toMatchObject({ code: 'internal' });
  });

  it('settles if the command itself fails', async () => {
    const speech = tauriSpeech(
      () => Promise.reject('offline'),
      class {
        onmessage = () => {};
      },
    );
    await expect(speech.download('tiny.en')).rejects.toMatchObject({ code: 'offline' });
  });

  it('sends no cancel for a download that has already finished', async () => {
    const { speech, channels, calls } = fakeTauri(() => null);
    const stop = new AbortController();
    const done = speech.download('tiny.en', undefined, stop.signal);
    await Promise.resolve();
    channels[0]!.onmessage({ type: 'end' });
    await done;
    stop.abort();
    expect(calls.map((call) => call.command)).not.toContain('speech_model_cancel');
  });

  it('starts nothing if already aborted', async () => {
    const { speech, calls } = fakeTauri(() => null);
    const stop = new AbortController();
    stop.abort();
    await expect(speech.download('tiny.en', undefined, stop.signal)).rejects.toMatchObject({
      code: 'cancelled',
    });
    expect(calls).toEqual([]);
  });

  it('removes a model by name', async () => {
    const { speech, calls } = fakeTauri(() => null);
    await speech.remove('tiny.en');
    expect(calls).toEqual([{ command: 'speech_model_remove', args: { name: 'tiny.en' } }]);
  });
});
