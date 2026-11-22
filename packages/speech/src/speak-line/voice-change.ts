/**
 * Changing a voice, and fitting a line to its time (spec 06, sections 4.2 and 4.3; spike 14.3).
 * Pure functions on mono samples.
 *
 * Children's and animals' voices are made from adult ones (decision 0068: no openly licensed
 * children's voice model exists). Resampling moves the pitch and the formants together, as a
 * smaller or larger vocal tract does, and changes the length; stretching then sets the length
 * without changing the pitch.
 */

/** Reads `input` `factor` times as fast, by linear interpolation: pitch and formants × factor. */
export function rescale(input: Float32Array, factor: number): Float32Array {
  const n = Math.max(1, Math.floor(input.length / factor));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i * factor;
    const j = Math.floor(x);
    const a = input[j] ?? 0;
    const b = input[j + 1] ?? a;
    out[i] = a + (b - a) * (x - j);
  }
  return out;
}

/**
 * Changes the length of `input` by `ratio` (2 = twice as long) without changing its pitch:
 * windowed overlap-add, each new window placed where it best matches the last (WSOLA).
 */
export function stretch(input: Float32Array, ratio: number, sampleRate: number): Float32Array {
  if (Math.abs(ratio - 1) < 1e-3) return input.slice();
  const win = Math.round(sampleRate * 0.04); // 40 ms windows
  const hop = Math.round(win / 2); // half overlap on output
  const search = Math.round(sampleRate * 0.01); // look 10 ms either side for the best match
  const outLength = Math.round(input.length * ratio);
  const out = new Float32Array(outLength + win);
  const weight = new Float32Array(outLength + win);
  const hann = Float32Array.from(
    { length: win },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (win - 1)),
  );
  let prev = 0; // where the last window was read from
  for (let o = 0; o < outLength; o += hop) {
    const ideal = Math.round(o / ratio);
    let best = Math.min(Math.max(0, ideal), Math.max(0, input.length - win));
    if (o > 0) {
      // Continue naturally from the last window: compare with what follows it in the input.
      let bestScore = -Infinity;
      for (let d = -search; d <= search; d += 2) {
        const at = ideal + d;
        if (at < 0 || at + win > input.length) continue;
        let score = 0;
        for (let k = 0; k < win; k += 4) score += input[at + k]! * (input[prev + hop + k] ?? 0);
        if (score > bestScore) {
          bestScore = score;
          best = at;
        }
      }
    }
    for (let k = 0; k < win && o + k < out.length; k++) {
      out[o + k]! += (input[best + k] ?? 0) * hann[k]!;
      weight[o + k]! += hann[k]!;
    }
    prev = best;
  }
  for (let i = 0; i < outLength; i++) out[i] = weight[i]! > 1e-3 ? out[i]! / weight[i]! : 0;
  return out.subarray(0, outLength);
}

/** How a voice is changed: 1 means unchanged (spec 06, 4.3, for the limits). */
export interface VoiceShape {
  readonly pitch: number;
  readonly formant: number;
  readonly speed: number;
}

/**
 * A changed voice. Pitch and formant move together, by `pitch`: separate formant shifting is
 * for later, so `castVoices` always gives them the same value.
 */
export function changeVoice(input: Float32Array, sampleRate: number, v: VoiceShape): Float32Array {
  if (v.pitch === 1 && v.speed === 1) return input;
  const shifted = v.pitch === 1 ? input : rescale(input, v.pitch);
  // Rescaling made it 1/pitch as long; bring it to the original length divided by speed.
  return stretch(shifted, input.length / v.speed / shifted.length, sampleRate);
}

/** The fastest a line is sped up to fit its time, and how long the fade at the end is. */
export const FIT_MAX_SPEED = 1.25;
export const FIT_FADE_SECONDS = 0.2;

/**
 * A line's sound fitted to its time (4.2): a longer one is sped up, to 1.25× at most, keeping its
 * pitch; anything still too long fades out over 0.2 s at the end. A shorter one is left as it is.
 */
export function fitToTime(input: Float32Array, sampleRate: number, seconds: number): Float32Array {
  const room = Math.round(seconds * sampleRate);
  if (input.length <= room) return input;
  const ratio = Math.max(room / input.length, 1 / FIT_MAX_SPEED);
  const faster = stretch(input, ratio, sampleRate);
  if (faster.length <= room) return faster;
  const out = faster.slice(0, room);
  const fade = Math.min(room, Math.round(FIT_FADE_SECONDS * sampleRate));
  for (let i = 0; i < fade; i++) out[room - fade + i]! *= 1 - (i + 1) / fade;
  return out;
}

/** The strongest frequency in a stretch of voiced sound, by autocorrelation (for tests). */
export function pitchOf(samples: Float32Array, sampleRate: number, lo = 60, hi = 800): number {
  let best = 0;
  let bestLag = 0;
  for (let lag = Math.floor(sampleRate / hi); lag <= Math.ceil(sampleRate / lo); lag++) {
    let s = 0;
    for (let i = 0; i + lag < samples.length; i++) s += samples[i]! * samples[i + lag]!;
    if (s > best) {
      best = s;
      bestLag = lag;
    }
  }
  return bestLag ? sampleRate / bestLag : 0;
}
