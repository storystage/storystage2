/**
 * Spike 14.3: making children's and animals' voices from adult ones (decision 0068; no openly
 * licensed children's voice model exists). Pure functions on mono samples, unit-tested.
 *
 * `shift` raises (above 1) or lowers (below 1) the pitch and the formants together, as a
 * smaller or larger vocal tract does: the sound is resampled, which also shortens or lengthens
 * it, and then stretched back to the length wanted without changing pitch.
 */

/** Reads `input` `factor` times as fast, by linear interpolation: pitch and formants × factor. */
export function resample(input: Float32Array, factor: number): Float32Array {
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

/** A voice preset's change: `shift` for pitch and formants, `speed` for pace (1 = as spoken). */
export interface VoiceChange {
  readonly shift: number;
  readonly speed: number;
}

export function changeVoice(input: Float32Array, sampleRate: number, c: VoiceChange): Float32Array {
  const shifted = c.shift === 1 ? input : resample(input, c.shift);
  // Resampling made it 1/shift as long; bring it to the original length divided by speed.
  const target = input.length / c.speed;
  return stretch(shifted, target / shifted.length, sampleRate);
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
