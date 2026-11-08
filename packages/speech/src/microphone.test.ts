import { describe, expect, it } from 'vitest';
import { DictationError } from './dictation.ts';
import { browserMicrophone, microphoneError, type MicrophoneBrowser } from './microphone.ts';

function fakeBrowser(getUserMedia: () => Promise<unknown> = async () => undefined) {
  const log: string[] = [];
  let post: ((event: { data: Float32Array[] }) => void) | null = null;
  const track = { stop: () => log.push('track stopped') };
  const stream = { getTracks: () => [track, track] };
  class FakeContext {
    readonly sampleRate = 48_000;
    readonly audioWorklet = {
      addModule: async (url: string) => {
        log.push(`worklet ${url}`);
      },
    };
    createMediaStreamSource() {
      return { connect: () => log.push('connected') };
    }
    close() {
      log.push('context closed');
      return Promise.resolve();
    }
  }
  class FakeNode {
    readonly port = {
      set onmessage(f: ((event: { data: Float32Array[] }) => void) | null) {
        post = f;
      },
    };
    disconnect() {
      log.push('disconnected');
    }
  }
  const browser = {
    mediaDevices: {
      getUserMedia: async (constraints: unknown) => {
        log.push(`asked ${JSON.stringify(constraints)}`);
        await getUserMedia();
        return stream;
      },
    },
    AudioContext: FakeContext,
    AudioWorkletNode: FakeNode,
    workletUrl: '/mic-worklet.js',
  } as unknown as MicrophoneBrowser;
  return { browser, log, send: (channels: Float32Array[]) => post?.({ data: channels }) };
}

describe('browserMicrophone (spec 06, sections 1.5, 1.6)', () => {
  it('opens the microphone, and passes on each block with the device rate', async () => {
    const { browser, send } = fakeBrowser();
    const mic = browserMicrophone(browser);
    const got: [number, number][] = [];
    await mic.open((channels, rate) => got.push([channels[0]!.length, rate]));
    send([new Float32Array(128)]);
    expect(got).toEqual([[128, 48_000]]);
  });

  it('asks for one channel, with echo and noise reduced', async () => {
    const { browser, log } = fakeBrowser();
    await browserMicrophone(browser).open(() => {});
    expect(log[0]).toBe(
      'asked {"audio":{"channelCount":1,"echoCancellation":true,"noiseSuppression":true}}',
    );
    expect(log).toContain('worklet /mic-worklet.js');
  });

  it('lets the microphone go on close: every track stopped, nothing more passed on', async () => {
    const { browser, log, send } = fakeBrowser();
    const mic = browserMicrophone(browser);
    const got: number[] = [];
    await mic.open((channels) => got.push(channels.length));
    mic.close();
    send([new Float32Array(1)]);
    expect(got).toEqual([]);
    expect(log.filter((l) => l === 'track stopped')).toHaveLength(2);
    expect(log).toContain('context closed');
    expect(log).toContain('disconnected');
  });

  it('closes what it opened if the worklet fails, and says so', async () => {
    const { browser, log } = fakeBrowser();
    const broken = {
      ...browser,
      AudioContext: class extends (browser.AudioContext as unknown as new () => object) {
        readonly audioWorklet = { addModule: () => Promise.reject(new Error('no')) };
      },
    } as unknown as MicrophoneBrowser;
    await expect(browserMicrophone(broken).open(() => {})).rejects.toMatchObject({
      code: 'internal',
    });
    expect(log).toContain('track stopped');
  });

  it("turns the browser's refusals into dictation's codes", async () => {
    for (const [name, code] of [
      ['NotAllowedError', 'permission_denied'],
      ['SecurityError', 'permission_denied'],
      ['NotFoundError', 'no_microphone'],
      ['OverconstrainedError', 'no_microphone'],
      ['AbortError', 'internal'],
    ] as const) {
      const { browser } = fakeBrowser(() => Promise.reject(Object.assign(new Error(), { name })));
      const failure = browserMicrophone(browser).open(() => {});
      await expect(failure).rejects.toBeInstanceOf(DictationError);
      await expect(failure).rejects.toMatchObject({ code });
    }
    expect(microphoneError(null).code).toBe('internal');
  });
});
