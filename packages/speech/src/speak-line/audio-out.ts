/**
 * The browser's `AudioOut` for speak lines (spec 06, 4.5): plays a line's samples through Web
 * Audio, one at a time. `stop` cuts the line that is playing.
 */
import type { AudioOut } from './lines.ts';

/** The parts of `AudioContext` this uses, so tests can give a fake. */
export interface AudioContextLike {
  readonly destination: unknown;
  readonly state: string;
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
    start(): void;
    stop(): void;
  };
}

export function webAudioOut(context: AudioContextLike = new AudioContext()): AudioOut {
  let playing: ReturnType<AudioContextLike['createBufferSource']> | null = null;
  return {
    play(samples, sampleRate) {
      // A browser starts a context suspended until the learner has interacted; Rehearse is a click.
      if (context.state === 'suspended') void context.resume();
      const buffer = context.createBuffer(1, samples.length, sampleRate);
      buffer.copyToChannel(samples, 0);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.start();
      playing = source;
    },
    stop() {
      playing?.stop();
      playing = null;
    },
  };
}
