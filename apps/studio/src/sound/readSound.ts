/**
 * Reading an imported sound on this device (`07-ux.md` section 7.7): its length first, from the
 * file's own header, so one over 10 minutes is refused before the whole of it is decoded; then
 * the rest, decoded at a low sample rate, for its true length and the trim dialog's waveform, so
 * a long file doesn't fill a Chromebook's memory.
 */
import { SOUND_LIMITS, SOUND_TYPES, type SoundType } from '@storystage/production';

/** The waveform's sample rate: enough to draw it, a sixth of a CD's. */
export const WAVEFORM_RATE = 8000;

export interface Decoded {
  readonly duration: number;
  /** One channel, the loudest of the file's at each sample, at `WAVEFORM_RATE`. */
  readonly samples: Float32Array;
}

export interface SoundReading {
  /** The length the file's header gives, or NaN when the device can't say without decoding it. */
  readonly lengthOf: (bytes: Uint8Array, type: SoundType) => Promise<number>;
  /** Decodes it at `WAVEFORM_RATE`, throwing when this device can't play it. */
  readonly decode: (bytes: Uint8Array) => Promise<Decoded>;
}

/** Each of `buckets` parts of `samples`' loudest sample, from 0 to 1. */
export function peaksOf(samples: Float32Array, buckets: number): Float32Array {
  const peaks = new Float32Array(buckets);
  if (samples.length === 0) return peaks;
  const per = Math.max(1, samples.length / buckets);
  for (let b = 0; b < buckets; b++) {
    const from = Math.floor(b * per);
    const to = Math.min(samples.length, Math.floor((b + 1) * per));
    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]!));
    peaks[b] = Math.min(1, peak);
  }
  return peaks;
}

/**
 * One file's reading: `measure` is `importSound`'s, and `peaks` then draws the waveform, or is
 * `null` for a file refused before it was decoded.
 */
export function readSound(reading: SoundReading = DEVICE_READING) {
  let decoded: Decoded | null = null;
  return {
    async measure(bytes: Uint8Array, type: SoundType): Promise<number> {
      const header = await reading.lengthOf(bytes, type).catch(() => Number.NaN);
      if (Number.isFinite(header) && header > SOUND_LIMITS.seconds) return header;
      decoded = await reading.decode(bytes);
      return decoded.duration;
    },
    peaks: (buckets: number): Float32Array | null =>
      decoded ? peaksOf(decoded.samples, buckets) : null,
  };
}

/** The length the file's header gives, or NaN when this device can't say without decoding. */
function headerLength(bytes: Uint8Array, type: SoundType): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: SOUND_TYPES[type] }));
    const audio = new Audio();
    const done = (length: number) => {
      clearTimeout(timer);
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(url);
      resolve(length);
    };
    const timer = setTimeout(() => done(Number.NaN), 5000);
    audio.preload = 'metadata';
    audio.onloadedmetadata = () => done(audio.duration);
    audio.onerror = () => done(Number.NaN);
    audio.src = url;
  });
}

async function decodeLow(bytes: Uint8Array): Promise<Decoded> {
  const context = new OfflineAudioContext(1, 1, WAVEFORM_RATE);
  // Decoding takes the buffer over, and the import keeps these bytes as the film's file.
  const buffer = await context.decodeAudioData(bytes.slice().buffer);
  const samples = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const channel = buffer.getChannelData(c);
    for (let i = 0; i < channel.length; i++)
      if (Math.abs(channel[i]!) > Math.abs(samples[i]!)) samples[i] = channel[i]!;
  }
  return { duration: buffer.duration, samples };
}

export const DEVICE_READING: SoundReading = { lengthOf: headerLength, decode: decodeLow };
