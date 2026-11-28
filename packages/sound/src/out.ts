/**
 * The studio's one sound output (decision 0076, workplan 11.7): a Web Audio context with a gain for
 * each of the film's three tracks, Speech, Music and Sound FX, at the film's volumes (`mixOf`).
 * Rehearse's player (`LiveSounds`) plays music and sounds through it, and the speak lines' player
 * through `speechContext()`, so all three follow the mix.
 */
import type { SoundMix } from '@storystage/production';

/** One of the film's three tracks. */
export type Track = 'speech' | 'music' | 'effects';

/** The parts of an `AudioParam` this uses. */
export interface AudioParamLike {
  value: number;
  setValueAtTime(value: number, time: number): unknown;
  linearRampToValueAtTime(value: number, time: number): unknown;
  cancelScheduledValues(time: number): unknown;
}

export interface GainLike {
  readonly gain: AudioParamLike;
  connect(destination: unknown): unknown;
  disconnect(): void;
}

export interface BufferLike {
  readonly duration: number;
}

export interface SourceLike {
  buffer: unknown;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  readonly playbackRate: AudioParamLike;
  onended: (() => void) | null;
  connect(destination: unknown): unknown;
  disconnect(): void;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

/** The parts of `AudioContext` this uses, so tests can give a fake. */
export interface AudioContextLike {
  readonly destination: unknown;
  readonly state: string;
  /** Seconds, on the clock everything is scheduled by. */
  readonly currentTime: number;
  resume(): Promise<void>;
  close(): Promise<void>;
  createGain(): GainLike;
  createBuffer(
    channels: number,
    length: number,
    sampleRate: number,
  ): { copyToChannel(source: Float32Array, channel: number): void };
  createBufferSource(): SourceLike;
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike>;
}

/** The speak lines' context (`webAudioOut` in `@storystage/speech`), its destination Speech. */
export type SpeechContext = Pick<
  AudioContextLike,
  'destination' | 'state' | 'currentTime' | 'resume' | 'createBuffer' | 'createBufferSource'
>;

export interface SoundOut {
  readonly context: AudioContextLike;
  /** The gain a track's sounds connect to. */
  track(track: Track): GainLike;
  /** A browser starts a context suspended until the learner has interacted: Rehearse is a click. */
  wake(): void;
  /** The film's volumes: changed over 10 ms, so a slider doesn't click. */
  setMix(mix: SoundMix): void;
  /** For `webAudioOut`: the same context, with Speech as its destination. */
  speechContext(): SpeechContext;
  /** A sound file's audio, or `null` if it can't be read. */
  decode(bytes: Uint8Array): Promise<BufferLike | null>;
  /** Lets the context go, for leaving the Production stage. */
  close(): void;
}

/** How long a change of volume takes, so nothing clicks. */
const MIX_RAMP_SECONDS = 0.01;

export function createSoundOut(mix: SoundMix, context?: AudioContextLike): SoundOut {
  const ctx = context ?? (new AudioContext() as unknown as AudioContextLike);
  const tracks = {} as Record<Track, GainLike>;
  for (const t of ['speech', 'music', 'effects'] as const) {
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    tracks[t] = gain;
  }
  const levels = (m: SoundMix): Record<Track, number> => ({
    speech: m.speech,
    music: m.music,
    effects: m.effects,
  });
  for (const [t, level] of Object.entries(levels(mix))) tracks[t as Track].gain.value = level;
  return {
    context: ctx,
    track: (t) => tracks[t],
    wake() {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    },
    setMix(m) {
      const now = ctx.currentTime;
      for (const [t, level] of Object.entries(levels(m))) {
        const param = tracks[t as Track].gain;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(level, now + MIX_RAMP_SECONDS);
      }
    },
    speechContext: () => ({
      get destination() {
        return tracks.speech;
      },
      get state() {
        return ctx.state;
      },
      get currentTime() {
        return ctx.currentTime;
      },
      resume: () => ctx.resume(),
      createBuffer: (channels, length, sampleRate) =>
        ctx.createBuffer(channels, length, sampleRate),
      createBufferSource: () => ctx.createBufferSource(),
    }),
    async decode(bytes) {
      try {
        // `decodeAudioData` takes its buffer over, so it's given a copy.
        return await ctx.decodeAudioData(bytes.slice().buffer);
      } catch {
        return null;
      }
    },
    close() {
      void ctx.close().catch(() => undefined);
    },
  };
}
