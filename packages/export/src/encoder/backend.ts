/**
 * The encoder's backend: the one part that touches WebCodecs and the MP4 muxer. Kept behind an
 * interface so `exportMp4` is tested without a browser (a fake backend) and so a different
 * backend (an FFmpeg sidecar on desktop, WP11.5) can be added without changing the callers.
 */

/** MP4 for distribution is H.264 (every player has it, spike 1.8). */
export type VideoCodecChoice = 'avc';
/** AAC plays everywhere; Opus is the possible fallback where AAC can't be encoded (spike 1.8). */
export type AudioCodecChoice = 'aac' | 'opus';

/** One frame of the film: drawn on a canvas, or raw RGBA (as from `Stage.renderFrame`). */
export type Frame =
  | { readonly kind: 'canvas'; readonly canvas: HTMLCanvasElement | OffscreenCanvas }
  | {
      readonly kind: 'rgba';
      readonly width: number;
      readonly height: number;
      readonly data: Uint8ClampedArray;
    };

/** A stretch of the soundtrack: one Float32Array per channel, samples from -1 to 1. */
export interface AudioChunk {
  readonly channels: readonly Float32Array[];
  readonly sampleRate: number;
  /** Where the chunk starts, in seconds from the start of the film. */
  readonly start: number;
}

export interface SessionConfig {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  /** Seconds between key frames. */
  readonly keyFrameSeconds: number;
  readonly audio: {
    readonly codec: AudioCodecChoice;
    readonly channels: number;
    readonly sampleRate: number;
  } | null;
}

export interface EncoderSession {
  /** Adds frame `index`; resolves when the encoder is ready for the next one (backpressure). */
  addFrame(frame: Frame, index: number): Promise<void>;
  addAudio(chunk: AudioChunk): Promise<void>;
  /** Finishes the file and returns its bytes. */
  finish(): Promise<ArrayBuffer>;
  /** Stops and throws away what was made so far. */
  cancel(): Promise<void>;
}

export interface EncoderBackend {
  canEncodeVideo(codec: VideoCodecChoice, width: number, height: number): Promise<boolean>;
  canEncodeAudio(codec: AudioCodecChoice, channels: number, sampleRate: number): Promise<boolean>;
  open(config: SessionConfig): Promise<EncoderSession>;
}
