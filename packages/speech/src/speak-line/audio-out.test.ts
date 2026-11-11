import { describe, expect, it } from 'vitest';
import { webAudioOut, type AudioContextLike } from './audio-out.ts';

function fakeContext(state = 'running') {
  const log: string[] = [];
  let n = 0;
  const context: AudioContextLike = {
    destination: 'speakers',
    state,
    resume: async () => void log.push('resume'),
    createBuffer: (channels, length, rate) => ({
      copyToChannel: () => log.push(`buffer ${channels}ch ${length / rate}s`),
    }),
    createBufferSource: () => {
      const id = ++n;
      return {
        buffer: null,
        connect: (d: unknown) => log.push(`${id} to ${String(d)}`),
        start: () => log.push(`${id} start`),
        stop: () => log.push(`${id} stop`),
      };
    },
  };
  return { context, log };
}

describe('webAudioOut', () => {
  it('plays a line, and cuts it when the next one starts or on stop', () => {
    const { context, log } = fakeContext();
    const out = webAudioOut(context);
    out.play(new Float32Array(24_000), 24_000);
    out.stop();
    out.play(new Float32Array(12_000), 24_000);
    out.stop();
    out.stop();
    expect(log).toEqual([
      'buffer 1ch 1s',
      '1 to speakers',
      '1 start',
      '1 stop',
      'buffer 1ch 0.5s',
      '2 to speakers',
      '2 start',
      '2 stop',
    ]);
  });

  it('wakes a suspended context before playing', () => {
    const { context, log } = fakeContext('suspended');
    webAudioOut(context).play(new Float32Array(10), 24_000);
    expect(log[0]).toBe('resume');
  });
});
