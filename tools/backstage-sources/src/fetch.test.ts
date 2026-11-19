import { describe, expect, it } from 'vitest';
import { passingFailure, withRetries, type Fetcher } from './fetch.ts';

/** A fetcher that fails with each of `failures` in turn, then returns one byte. */
function flaky(failures: Error[]): { fetcher: Fetcher; calls: () => number } {
  let calls = 0;
  return {
    fetcher: async () => {
      const failure = failures[calls++];
      if (failure) throw failure;
      return new Uint8Array([1]);
    },
    calls: () => calls,
  };
}

describe('withRetries', () => {
  const waits: number[] = [];
  const wait = async (ms: number) => {
    waits.push(ms);
  };

  it('tries again after a dropped connection, waiting longer each time', async () => {
    waits.length = 0;
    const f = flaky([passingFailure('socket closed'), passingFailure('503')]);
    await expect(withRetries(f.fetcher, 4, wait)('https://x/a.glb')).resolves.toEqual(
      new Uint8Array([1]),
    );
    expect(f.calls()).toBe(3);
    expect(waits).toEqual([1000, 2000]);
  });

  it('gives up after its tries, with the last failure', async () => {
    waits.length = 0;
    const f = flaky([1, 2, 3, 4].map((n) => passingFailure(`drop ${n}`)));
    await expect(withRetries(f.fetcher, 4, wait)('https://x/a.glb')).rejects.toThrow('drop 4');
    expect(f.calls()).toBe(4);
    expect(waits).toEqual([1000, 2000, 4000]);
  });

  it('fails at once on a missing file or a refusal', async () => {
    waits.length = 0;
    const f = flaky([new Error('Could not fetch https://x/a.glb: 404 Not Found')]);
    await expect(withRetries(f.fetcher, 4, wait)('https://x/a.glb')).rejects.toThrow('404');
    expect(f.calls()).toBe(1);
    expect(waits).toEqual([]);
  });
});
