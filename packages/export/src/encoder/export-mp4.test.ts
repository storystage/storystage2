import { describe, expect, it } from 'vitest';
import type {
  AudioChunk,
  AudioCodecChoice,
  EncoderBackend,
  Frame,
  SessionConfig,
} from './backend.ts';
import { ExportError, exportMp4, probeExport } from './export-mp4.ts';

/** A backend that records what it's given, with switches for what the "device" can do. */
function fakeBackend(
  can: { video?: boolean; audio?: AudioCodecChoice[]; failOnFrame?: number } = {},
) {
  const log = {
    config: null as SessionConfig | null,
    frames: [] as number[],
    audio: [] as AudioChunk[],
    finished: false,
    cancelled: false,
  };
  const backend: EncoderBackend = {
    canEncodeVideo: async () => can.video ?? true,
    canEncodeAudio: async (codec) => (can.audio ?? ['aac']).includes(codec),
    open: async (config) => {
      log.config = config;
      return {
        addFrame: async (_frame: Frame, index: number) => {
          if (index === can.failOnFrame) throw new Error('encoder crashed');
          log.frames.push(index);
        },
        addAudio: async (chunk) => {
          log.audio.push(chunk);
        },
        finish: async () => {
          log.finished = true;
          return new ArrayBuffer(8);
        },
        cancel: async () => {
          log.cancelled = true;
        },
      };
    },
  };
  return { backend, log };
}

const rgba = (w = 1280, h = 720): Frame => ({
  kind: 'rgba',
  width: w,
  height: h,
  data: new Uint8ClampedArray(w * h * 4),
});
const error = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as ExportError;
  }
  throw new Error('expected an ExportError');
};

describe('exportMp4', () => {
  it('renders every frame in order at 1280×720, 30 fps by default, and reports progress', async () => {
    const { backend, log } = fakeBackend();
    const times: number[] = [];
    const progress: number[] = [];
    const result = await exportMp4({
      seconds: 2,
      backend,
      renderFrame: (_i, t) => {
        times.push(t);
        return rgba();
      },
      onProgress: (p) => progress.push(p.fraction),
    });
    expect(log.config).toMatchObject({ width: 1280, height: 720, fps: 30, audio: null });
    expect(log.frames).toEqual([...Array(60).keys()]);
    expect(times[1]).toBeCloseTo(1 / 30);
    expect(progress).toHaveLength(60);
    expect(progress.at(-1)).toBe(1);
    expect(progress.every((p, i) => i === 0 || p > progress[i - 1]!)).toBe(true);
    expect(result).toMatchObject({ videoCodec: 'avc', audioCodec: null, frames: 60, seconds: 2 });
    expect(log.finished).toBe(true);
  });

  it('adds the soundtrack in one-second chunks, all of it', async () => {
    const { backend, log } = fakeBackend();
    const sampleRate = 48_000;
    const left = new Float32Array(sampleRate * 2.5);
    const right = new Float32Array(sampleRate * 2.5);
    const result = await exportMp4({
      seconds: 2.5,
      backend,
      renderFrame: () => rgba(),
      audio: { channels: [left, right], sampleRate },
    });
    expect(result.audioCodec).toBe('aac');
    expect(log.config?.audio).toEqual({ codec: 'aac', channels: 2, sampleRate });
    expect(log.audio.map((c) => c.start)).toEqual([0, 1, 2]);
    expect(log.audio.reduce((n, c) => n + c.channels[0]!.length, 0)).toBe(left.length);
  });

  it('refuses before drawing anything when the device has no H.264 encoder', async () => {
    const { backend, log } = fakeBackend({ video: false });
    let drawn = 0;
    const e = await error(exportMp4({ seconds: 1, backend, renderFrame: () => (drawn++, rgba()) }));
    expect(e.code).toBe('no_video_encoder');
    expect(e.message).toMatch(/can't make video files/);
    expect(drawn).toBe(0);
    expect(log.config).toBeNull();
  });

  it('refuses when there is sound but no AAC, unless another codec is allowed', async () => {
    const audio = { channels: [new Float32Array(48_000)], sampleRate: 48_000 };
    const noAac = fakeBackend({ audio: ['opus'] });
    expect(
      (
        await error(
          exportMp4({ seconds: 1, backend: noAac.backend, renderFrame: () => rgba(), audio }),
        )
      ).code,
    ).toBe('no_audio_encoder');
    const allowed = await exportMp4({
      seconds: 1,
      backend: noAac.backend,
      renderFrame: () => rgba(),
      audio,
      audioCodecs: ['aac', 'opus'],
    });
    expect(allowed.audioCodec).toBe('opus');
  });

  it('stops when cancelled, throws away the file, and says nothing was saved', async () => {
    const { backend, log } = fakeBackend();
    const abort = new AbortController();
    const e = await error(
      exportMp4({
        seconds: 2,
        backend,
        signal: abort.signal,
        renderFrame: (i) => {
          if (i === 10) abort.abort();
          return rgba();
        },
      }),
    );
    expect(e.code).toBe('cancelled');
    expect(e.message).toBe('Export stopped. Nothing was saved.');
    expect(log.cancelled).toBe(true);
    expect(log.finished).toBe(false);
    expect(log.frames.length).toBe(11);
  });

  it('refuses a frame of the wrong size, and an encoder that fails', async () => {
    const wrong = fakeBackend();
    const e1 = await error(
      exportMp4({
        seconds: 1,
        backend: wrong.backend,
        renderFrame: (i) => (i === 3 ? rgba(640, 360) : rgba()),
      }),
    );
    expect(e1.code).toBe('bad_frame');
    expect(e1.detail).toMatch(/frame 3 is 640×360/);
    expect(wrong.log.cancelled).toBe(true);
    const crash = fakeBackend({ failOnFrame: 5 });
    const e2 = await error(
      exportMp4({ seconds: 1, backend: crash.backend, renderFrame: () => rgba() }),
    );
    expect(e2.code).toBe('encode_failed');
    expect(e2.detail).toBe('encoder crashed');
    expect(crash.log.cancelled).toBe(true);
  });

  it('uses plain words in every message', () => {
    for (const code of [
      'no_video_encoder',
      'no_audio_encoder',
      'bad_frame',
      'cancelled',
      'encode_failed',
    ] as const) {
      const m = new ExportError(code).message;
      for (const word of ['codec', 'H.264', 'WebCodecs', 'encoder', 'API'])
        expect(m).not.toContain(word);
    }
  });
});

describe('probeExport', () => {
  it('reports what the device can make', async () => {
    const { backend } = fakeBackend({ audio: [] });
    expect(await probeExport({ backend, audio: { channels: 2, sampleRate: 48_000 } })).toEqual({
      video: true,
      audioCodec: null,
    });
  });
});
