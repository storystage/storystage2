import { describe, expect, it } from 'vitest';
import { DictationError } from './dictation.ts';
import { WHISPER_RATE } from './resample.ts';
import { ownScript, WhisperCore, WhisperError, type WhisperModule } from './whisper-core.ts';
import type { FromWhisper, ToWhisper } from './whisper-protocol.ts';
import { whisperRecogniser, type WorkerLike } from './worker-recogniser.ts';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** whisper.cpp's example, as far as the core sees it: it prints what it heard, on its own time. */
function fakeWhisper(heard = ' Make the owl fly.', init = 1) {
  const calls: { audio: Float32Array; threads: number }[] = [];
  const files = new Map<string, Uint8Array>();
  let core: WhisperCore | null = null;
  const module: WhisperModule = {
    FS: {
      writeFile: (path, data) => files.set(path, data.slice()),
      unlink: (path) => {
        if (!files.delete(path)) throw new Error('no file');
      },
    },
    init: () => init,
    free: () => {},
    full_default: (_instance, audio, _lang, threads) => {
      calls.push({ audio: audio.slice(), threads });
      setTimeout(() => {
        core?.print('whisper_full: processing');
        core?.print(`[00:00:00.000 --> 00:00:02.000]${heard}`);
        core?.print('whisper_print_timings:    total time =  1234.56 ms');
      }, 0);
      return 0;
    },
  };
  return { module, calls, files, attach: (c: WhisperCore) => (core = c) };
}

describe('WhisperCore (spec 06, section 1.2)', () => {
  it('loads a model, zeroing the bytes it was given', () => {
    const { module, files, attach } = fakeWhisper();
    const core = new WhisperCore(module, 2);
    attach(core);
    const model = Uint8Array.of(1, 2, 3);
    core.load(model);
    expect(files.get('/model.bin')).toEqual(Uint8Array.of(1, 2, 3));
    expect([...model]).toEqual([0, 0, 0]);
  });

  it("says the model failed when whisper can't start with it", () => {
    const { module } = fakeWhisper('', 0);
    expect(() => new WhisperCore(module, 2).load(Uint8Array.of(1))).toThrow(WhisperError);
  });

  it('hears audio at 16 kHz, gives back the words, and zeroes the audio', async () => {
    const { module, calls, attach } = fakeWhisper();
    const core = new WhisperCore(module, 3);
    attach(core);
    core.load(Uint8Array.of(1));
    const audio = new Float32Array(48_000).fill(0.2);
    expect(await core.transcribe(audio, 48_000)).toBe('Make the owl fly.');
    expect(calls[0]!.audio).toHaveLength(WHISPER_RATE);
    expect(calls[0]!.threads).toBe(3);
    expect(audio.every((s) => s === 0)).toBe(true);
  });

  it('refuses to hear before a model is loaded', async () => {
    const { module } = fakeWhisper();
    await expect(
      new WhisperCore(module, 1).transcribe(new Float32Array(10), 16_000),
    ).rejects.toThrow(WhisperError);
  });
});

/** A worker in the same thread, speaking the protocol. */
function fakeWorker(answer: (message: ToWhisper, post: (m: FromWhisper) => void) => void) {
  const sent: { message: ToWhisper; transfer: Transferable[] }[] = [];
  let terminated = 0;
  const worker: WorkerLike = {
    onmessage: null,
    onerror: null,
    postMessage(message, transfer) {
      sent.push({ message, transfer });
      setTimeout(() => answer(message, (m) => worker.onmessage?.({ data: m })), 0);
    },
    terminate: () => {
      terminated += 1;
    },
  };
  return { worker, sent, terminated: () => terminated };
}

const happy = (message: ToWhisper, post: (m: FromWhisper) => void) =>
  post(
    message.type === 'load'
      ? { type: 'ready' }
      : { type: 'text', id: message.id, text: 'Hello there.' },
  );

describe('whisperRecogniser (spec 06, sections 1.2, 1.8)', () => {
  it('loads the model in the worker, then hears, moving the bytes rather than copying them', async () => {
    const { worker, sent } = fakeWorker(happy);
    const recogniser = await whisperRecogniser({
      script: '/whisper/main.js',
      makeWorker: () => worker,
      threads: 2,
    })(new ArrayBuffer(4));
    expect(sent[0]!.message).toMatchObject({
      type: 'load',
      script: '/whisper/main.js',
      threads: 2,
    });
    expect(sent[0]!.transfer).toHaveLength(1);
    const audio = new Float32Array(8);
    expect(await recogniser.transcribe(audio, 48_000)).toBe('Hello there.');
    expect(sent[1]!.transfer).toEqual([audio.buffer]);
  });

  it('says the model failed when the worker could not load it', async () => {
    const { worker, terminated } = fakeWorker((_message, post) =>
      post({ type: 'error', id: null, code: 'model_failed' }),
    );
    await expect(
      whisperRecogniser({ script: 's', makeWorker: () => worker })(new ArrayBuffer(1)),
    ).rejects.toMatchObject({ code: 'model_failed' });
    expect(terminated()).toBe(1);
  });

  it('passes on an error hearing, and carries on', async () => {
    let n = 0;
    const { worker } = fakeWorker((m, post) => {
      if (m.type === 'load') post({ type: 'ready' });
      else if (n++ === 0) post({ type: 'error', id: m.id, code: 'internal' });
      else post({ type: 'text', id: m.id, text: 'Second time.' });
    });
    const recogniser = await whisperRecogniser({ script: 's', makeWorker: () => worker })(
      new ArrayBuffer(1),
    );
    await expect(recogniser.transcribe(new Float32Array(1), 16_000)).rejects.toMatchObject({
      code: 'internal',
    });
    expect(await recogniser.transcribe(new Float32Array(1), 16_000)).toBe('Second time.');
  });

  it('treats a worker the system ended for lack of memory as gone', async () => {
    const { worker, terminated } = fakeWorker((m, post) => {
      if (m.type === 'load') post({ type: 'ready' });
    });
    const recogniser = await whisperRecogniser({ script: 's', makeWorker: () => worker })(
      new ArrayBuffer(1),
    );
    const hearing = recogniser.transcribe(new Float32Array(1), 16_000);
    worker.onerror?.({ message: 'RangeError: Out of memory' });
    await expect(hearing).rejects.toMatchObject({ code: 'out_of_memory' });
    await expect(recogniser.transcribe(new Float32Array(1), 16_000)).rejects.toBeInstanceOf(
      DictationError,
    );
    expect(terminated()).toBe(1);
  });

  it('ends the worker when dictation is done with it', async () => {
    const { worker, terminated } = fakeWorker(happy);
    const recogniser = await whisperRecogniser({ script: 's', makeWorker: () => worker })(
      new ArrayBuffer(1),
    );
    recogniser.end();
    await flush();
    expect(terminated()).toBe(1);
  });
});

describe('ownScript (spec 06, section 7)', () => {
  const location = { href: 'https://app.local/studio/index.html', origin: 'https://app.local' };
  it("loads whisper's script from the app's own origin", () => {
    expect(ownScript('/whisper/whisper.js', location)).toBe('https://app.local/whisper/whisper.js');
    expect(ownScript('whisper.js', location)).toBe('https://app.local/studio/whisper.js');
  });
  it('refuses a script from anywhere else, or not a script', () => {
    expect(ownScript('https://elsewhere.example/whisper.js', location)).toBeNull();
    expect(ownScript('data:text/javascript,1', location)).toBeNull();
    expect(ownScript('/whisper/model.bin', location)).toBeNull();
  });
});
