/**
 * The browser's `AudioOut` for speak lines (spec 06, 4.5): plays a line's samples through Web
 * Audio, one at a time, now or after a delay. `stop` cuts the line that is playing or waiting.
 */
import type { AudioOut } from './lines.ts';

/** The parts of `AudioContext` this uses, so tests can give a fake. */
export interface AudioContextLike {
  readonly destination: unknown;
  readonly state: string;
  /** Seconds, on the clock `start` schedules by. */
  readonly currentTime: number;
  resume(): Promise<void>;
  createBuffer(
    channels: number,
    length: number,
    sampleRate: number,
  ): {
    copyToChannel(source: Float32Array, channel: number): void;
  };
  createBufferSource(): {
    buffer: unknown;
    connect(destination: unknown): void;
    start(when?: number): void;
    stop(): void;
  };
}

export function webAudioOut(context: AudioContextLike = new AudioContext()): AudioOut {
  let playing: ReturnType<AudioContextLike['createBufferSource']> | null = null;
  return {
    play(samples, sampleRate, delay = 0) {
      playing?.stop();
      // A browser starts a context suspended until the learner has interacted; Rehearse is a click.
      if (context.state === 'suspended') void context.resume();
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      // Scheduled on the audio clock, so a line given ahead of its picture starts with it.
      source.start(delay > 0 ? context.currentTime + delay : undefined);
      playing = source;
    },
    stop() {
      playing?.stop();
      playing = null;
    },
  };
}
