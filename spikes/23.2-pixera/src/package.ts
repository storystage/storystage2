/**
 * A test package for projection, in the shape 23.6's Export for projection will write: media for
 * each surface, a soundtrack and cues, described by `show.json`. The spike makes its own media
 * (no FFmpeg here): a PNG sequence for each surface, each frame a plain colour with a bar that
 * moves across and a block for each second, so a wrong frame rate or a skipped frame shows.
 */
import { crc32, deflateSync } from 'node:zlib';

export interface ShowSurface {
  /** The surface's name, which is also the Pixera screen a layer is sent to. */
  name: string;
  /** Relative to the package: a folder of numbered PNGs, or a video file. */
  media: string;
  kind: 'png-sequence' | 'video';
}

export interface ShowCue {
  name: string;
  seconds: number;
  /** Pixera's cue operations: 1 play, 2 pause, 3 stop, 4 jump. */
  operation: 1 | 2 | 3 | 4;
}

export interface Show {
  title: string;
  fps: number;
  seconds: number;
  surfaces: ShowSurface[];
  soundtrack?: string;
  cues: ShowCue[];
}

/** A PNG of RGB pixels, written by hand (no image library). */
export function png(width: number, height: number, rgb: Uint8Array): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])) >>> 0, 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const rows = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++)
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(
      rows,
      y * (width * 3 + 1) + 1,
    );
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** One frame of a surface's test media. */
export function frame(
  width: number,
  height: number,
  colour: [number, number, number],
  n: number,
  fps: number,
): Uint8Array {
  const rgb = new Uint8Array(width * height * 3);
  const bar = Math.floor(((n % fps) / fps) * width);
  const seconds = Math.floor(n / fps);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      const onBar = Math.abs(x - bar) < width / 64;
      const block = y < height / 8 && x < (seconds + 1) * (width / 16) && x % (width / 16) > 4;
      const c: [number, number, number] = onBar || block ? [255, 255, 255] : colour;
      rgb.set(c, i);
    }
  return rgb;
}

/** A mono 16-bit WAV of a tone that beeps once a second. */
export function wav(seconds: number, rate = 48_000): Buffer {
  const samples = Math.round(seconds * rate);
  const out = Buffer.alloc(44 + samples * 2);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(36 + samples * 2, 4);
  out.write('WAVEfmt ', 8, 'ascii');
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20); // PCM
  out.writeUInt16LE(1, 22); // mono
  out.writeUInt32LE(rate, 24);
  out.writeUInt32LE(rate * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write('data', 36, 'ascii');
  out.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) {
    const t = i / rate;
    const on = t % 1 < 0.15;
    out.writeInt16LE(on ? Math.round(Math.sin(2 * Math.PI * 880 * t) * 12_000) : 0, 44 + i * 2);
  }
  return out;
}

/** The padded frame number in a sequence's file names: `wall_00012.png`. */
export const frameName = (surface: string, n: number) =>
  `${surface}_${String(n).padStart(5, '0')}.png`;
