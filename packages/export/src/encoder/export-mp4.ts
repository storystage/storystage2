/**
 * Export for distribution, the encoder module (WP11.3, 11.5; S1). A film is rendered frame by
 * frame at a fixed rate, never in real time, and encoded to MP4: H.264 video, and AAC audio
 * where the device can make it. Progress is reported per frame and it can be cancelled.
 *
 * The audio fallback is a setting, `audioCodecs`, because the owner decides it after the
 * Chromebook check (decision record spike-1.8-mp4): today it is AAC only, and a device that can't
 * encode AAC gets the `no_audio_encoder` error rather than a file some players can't play.
 */
import type {
  AudioChunk,
  AudioCodecChoice,
  EncoderBackend,
  EncoderSession,
  Frame,
} from './backend.ts';
import { mediabunnyBackend } from './mediabunny-backend.ts';

export interface ExportOptions {
  /** Default 1280 × 720 (WP11.3). */
  readonly width?: number;
  readonly height?: number;
  /** Default 30. */
  readonly fps?: number;
  /** How long the film is, in seconds. */
  readonly seconds: number;
  /** Draws frame `index`, at `time` seconds, and returns it. Called once per frame, in order. */
  readonly renderFrame: (index: number, time: number) => Frame | Promise<Frame>;
  /** The whole soundtrack, one Float32Array per channel (narration, recorded lines). */
  readonly audio?: { readonly channels: readonly Float32Array[]; readonly sampleRate: number };
  /** Audio codecs to try, in order. Default AAC only; see the header. */
  readonly audioCodecs?: readonly AudioCodecChoice[];
  readonly onProgress?: (progress: {
    readonly frame: number;
    readonly frames: number;
    readonly fraction: number;
  }) => void;
  readonly signal?: AbortSignal;
  /** For tests and other platforms (an FFmpeg sidecar, WP11.5). Default: WebCodecs and Mediabunny. */
  readonly backend?: EncoderBackend;
}

export interface ExportResult {
  readonly bytes: ArrayBuffer;
  readonly videoCodec: 'avc';
  readonly audioCodec: AudioCodecChoice | null;
  readonly frames: number;
  readonly seconds: number;
  /** How long the export took. */
  readonly ms: number;
}

export const EXPORT_ERROR_CODES = [
  'no_video_encoder',
  'no_audio_encoder',
  'bad_frame',
  'cancelled',
  'encode_failed',
] as const;
export type ExportErrorCode = (typeof EXPORT_ERROR_CODES)[number];

/** What the learner or teacher is told, in plain words. */
const MESSAGES: Record<ExportErrorCode, string> = {
  no_video_encoder:
    "This device can't make video files. Try exporting the film on another computer or tablet.",
  no_audio_encoder:
    "This device can't make the film's sound. Try exporting on another computer or tablet.",
  bad_frame: 'Something went wrong drawing the film, so it was not saved. Try again.',
  cancelled: 'Export stopped. Nothing was saved.',
  encode_failed: 'Something went wrong making the video file, so it was not saved. Try again.',
};

export class ExportError extends Error {
  readonly code: ExportErrorCode;
  /** For developers and logs, never shown to learners. */
  readonly detail: string | null;
  constructor(code: ExportErrorCode, detail: string | null = null) {
    super(MESSAGES[code]);
    this.name = 'ExportError';
    this.code = code;
    this.detail = detail;
  }
}

/** What this device can export: checked before anything is drawn. */
export async function probeExport(
  options: Pick<ExportOptions, 'width' | 'height' | 'audioCodecs' | 'backend'> & {
    readonly audio?: { readonly channels: number; readonly sampleRate: number };
  },
): Promise<{ readonly video: boolean; readonly audioCodec: AudioCodecChoice | null }> {
  const backend = options.backend ?? mediabunnyBackend;
  const video = await backend.canEncodeVideo('avc', options.width ?? 1280, options.height ?? 720);
  let audioCodec: AudioCodecChoice | null = null;
  if (options.audio)
    for (const codec of options.audioCodecs ?? ['aac']) {
      if (await backend.canEncodeAudio(codec, options.audio.channels, options.audio.sampleRate)) {
        audioCodec = codec;
        break;
      }
    }
  return { video, audioCodec };
}

const AUDIO_CHUNK_SECONDS = 1;

export async function exportMp4(options: ExportOptions): Promise<ExportResult> {
  const started = performance.now();
  const width = options.width ?? 1280;
  const height = options.height ?? 720;
  const fps = options.fps ?? 30;
  const frames = Math.round(options.seconds * fps);
  const backend = options.backend ?? mediabunnyBackend;
  const audio = options.audio ?? null;
  const cancelled = () => options.signal?.aborted === true;
  if (cancelled()) throw new ExportError('cancelled');

  const probe = await probeExport({
    width,
    height,
    backend,
    ...(options.audioCodecs ? { audioCodecs: options.audioCodecs } : {}),
    ...(audio ? { audio: { channels: audio.channels.length, sampleRate: audio.sampleRate } } : {}),
  });
  if (!probe.video)
    throw new ExportError('no_video_encoder', `H.264 at ${width}×${height} is not available`);
  if (audio && !probe.audioCodec)
    throw new ExportError(
      'no_audio_encoder',
      `none of ${(options.audioCodecs ?? ['aac']).join(', ')} is available`,
    );

  let session: EncoderSession;
  try {
    session = await backend.open({
      width,
      height,
      fps,
      keyFrameSeconds: 2,
      audio:
        audio && probe.audioCodec
          ? {
              codec: probe.audioCodec,
              channels: audio.channels.length,
              sampleRate: audio.sampleRate,
            }
          : null,
    });
  } catch (e) {
    throw new ExportError('encode_failed', String(e));
  }

  const stop = async (error: ExportError): Promise<never> => {
    await session.cancel().catch(() => undefined);
    throw error;
  };

  try {
    if (audio) {
      const step = AUDIO_CHUNK_SECONDS * audio.sampleRate;
      const length = audio.channels[0]?.length ?? 0;
      for (let at = 0; at < length; at += step) {
        if (cancelled()) return await stop(new ExportError('cancelled'));
        const chunk: AudioChunk = {
          channels: audio.channels.map((c) => c.subarray(at, Math.min(length, at + step))),
          sampleRate: audio.sampleRate,
          start: at / audio.sampleRate,
        };
        await session.addAudio(chunk);
      }
    }
    for (let i = 0; i < frames; i++) {
      if (cancelled()) return await stop(new ExportError('cancelled'));
      const frame = await options.renderFrame(i, i / fps);
      if (
        frame.kind === 'rgba' &&
        (frame.width !== width ||
          frame.height !== height ||
          frame.data.length !== width * height * 4)
      )
        return await stop(
          new ExportError(
            'bad_frame',
            `frame ${i} is ${frame.width}×${frame.height}, not ${width}×${height}`,
          ),
        );
      await session.addFrame(frame, i);
      options.onProgress?.({ frame: i + 1, frames, fraction: (i + 1) / frames });
    }
    if (cancelled()) return await stop(new ExportError('cancelled'));
    const bytes = await session.finish();
    return {
      bytes,
      videoCodec: 'avc',
      audioCodec: audio ? probe.audioCodec : null,
      frames,
      seconds: frames / fps,
      ms: Math.round(performance.now() - started),
    };
  } catch (e) {
    if (e instanceof ExportError) throw e;
    return await stop(new ExportError('encode_failed', e instanceof Error ? e.message : String(e)));
  }
}
