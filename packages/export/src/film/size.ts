/**
 * The export dialog's file size estimate (spec 08, section 4), from the film's length and the
 * resolution. It follows the bitrate the encoder asks for: Mediabunny's `QUALITY_HIGH` for H.264
 * (3 Mbit/s at 1080p for "medium", scaled by pixels to the power 0.95 and by 2.04 for "high"),
 * and 192 kbit/s of AAC when there's sound. An estimate: the real file depends on the picture.
 */
import { RESOLUTIONS, type Resolution } from './export-film.ts';

const REFERENCE_PIXELS = 1920 * 1080;
const REFERENCE_BITRATE = 3_000_000;
/** Mediabunny's factor for "high": 0.3 × e^(2.5538 × 0.75). */
const HIGH = 0.3 * Math.exp(2.5538 * 0.75);
const AAC_BITRATE = 192_000;

/** Video bits a second at this resolution, as the encoder asks for them. */
export function videoBitrate(resolution: Resolution): number {
  const { width, height } = RESOLUTIONS[resolution];
  return REFERENCE_BITRATE * Math.pow((width * height) / REFERENCE_PIXELS, 0.95) * HIGH;
}

/** About how many bytes the MP4 will be. */
export function estimateBytes(seconds: number, resolution: Resolution, sound = false): number {
  const bitsPerSecond = videoBitrate(resolution) + (sound ? AAC_BITRATE : 0);
  return Math.round((seconds * bitsPerSecond) / 8);
}
