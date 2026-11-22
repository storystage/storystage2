/**
 * Audio for whisper (`docs/spec/06-speech.md` section 1.6): the device's channels mixed to mono,
 * then resampled to 16 kHz. Pure functions, so they are tested on their own and run in the
 * worker, off the studio's thread.
 */

/** The rate whisper needs. */
export const WHISPER_RATE = 16_000;

/** The channels' average, one sample at a time. */
export function toMono(channels: readonly Float32Array[]): Float32Array {
  const [first] = channels;
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return first.slice();
  const out = new Float32Array(first.length);
  for (const channel of channels)
    for (let i = 0; i < out.length; i++) out[i]! += (channel[i] ?? 0) / channels.length;
  return out;
}

/**
 * Resamples mono audio to `to` samples a second. Going down, each output sample averages the
 * input samples it covers, which keeps sound above the new rate's limit from folding back as
 * noise; going up, it interpolates between neighbours.
 */
export function resample(
  input: Float32Array,
  from: number,
  to: number = WHISPER_RATE,
): Float32Array {
  if (!(from > 0) || !(to > 0)) throw new RangeError('Sample rates must be above zero.');
  if (from === to) return input.slice();
  const length = Math.floor((input.length * to) / from);
  const out = new Float32Array(length);
  const step = from / to;
  if (step > 1) {
    for (let i = 0; i < length; i++) {
      const start = Math.floor(i * step);
      const end = Math.min(input.length, Math.floor((i + 1) * step));
      let sum = 0;
      for (let j = start; j < end; j++) sum += input[j]!;
      out[i] = end > start ? sum / (end - start) : 0;
    }
  } else {
    for (let i = 0; i < length; i++) {
      const at = i * step;
      const j = Math.floor(at);
      const next = Math.min(input.length - 1, j + 1);
      out[i] = input[j]! + (input[next]! - input[j]!) * (at - j);
    }
  }
  return out;
}

/** How loud a chunk is, from 0 to 1, for the level meter. */
export function level(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const s of samples) sum += s * s;
  // Speech is quiet as a signal: a root mean square of 0.1 is talking at a normal level.
  return Math.min(1, Math.sqrt(sum / samples.length) * 5);
}
