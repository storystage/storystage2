import { describe, expect, it } from 'vitest';
import { estimateBytes, videoBitrate } from './size.ts';

describe('estimateBytes', () => {
  it('follows the encoder: about 2.8 Mbit/s at 720p and 6.1 at 1080p', () => {
    expect(videoBitrate('720p') / 1e6).toBeCloseTo(2.84, 1);
    expect(videoBitrate('1080p') / 1e6).toBeCloseTo(6.12, 1);
  });

  it('grows with the length, and adds the sound when there is some', () => {
    const minute = estimateBytes(60, '720p');
    expect(minute / 1e6).toBeCloseTo(21.3, 0);
    expect(estimateBytes(120, '720p')).toBe(minute * 2);
    expect(estimateBytes(60, '720p', true)).toBe(minute + (60 * 192_000) / 8);
  });

  it('puts a 10-minute film at 1080p under the 512 MB file limit', () => {
    expect(estimateBytes(600, '1080p')).toBeLessThan(512 * 1024 * 1024);
  });
});
