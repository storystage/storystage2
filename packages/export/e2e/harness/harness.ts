/**
 * Runs real exports in the browser and reads each MP4 back with Mediabunny, so the end-to-end
 * test can check the file itself: codec, size, frames, duration and the sound track.
 */
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { exportMp4, probeExport, type ExportError, type Frame } from '../../src/index.ts';

const W = 1280;
const H = 720;

function canvasFrames() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  return (i: number): Frame => {
    ctx.fillStyle = '#87b5e0';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#e07a3a';
    ctx.beginPath();
    ctx.arc(100 + i * 18, H / 2, 60, 0, Math.PI * 2);
    ctx.fill();
    return { kind: 'canvas', canvas };
  };
}

function rgbaFrames() {
  const data = new Uint8ClampedArray(W * H * 4);
  return (i: number): Frame => {
    for (let p = 0; p < data.length; p += 4) {
      data[p] = (i * 8) % 256;
      data[p + 1] = 120;
      data[p + 2] = 200;
      data[p + 3] = 255;
    }
    return { kind: 'rgba', width: W, height: H, data };
  };
}

function tone(seconds: number, sampleRate = 48_000) {
  const n = seconds * sampleRate;
  const left = new Float32Array(n);
  const right = new Float32Array(n);
  for (let i = 0; i < n; i++)
    left[i] = right[i] = 0.2 * Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  return { channels: [left, right], sampleRate };
}

async function inspect(bytes: ArrayBuffer) {
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  return {
    bytes: bytes.byteLength,
    duration: Math.round((await input.computeDuration()) * 1000) / 1000,
    video: video && {
      codec: video.codec,
      width: video.codedWidth,
      height: video.codedHeight,
      frames: (await video.computePacketStats()).packetCount,
    },
    audio: audio && {
      codec: audio.codec,
      channels: audio.numberOfChannels,
      sampleRate: audio.sampleRate,
    },
  };
}

async function main() {
  const result: Record<string, unknown> = { userAgent: navigator.userAgent };
  result.probe = await probeExport({
    audio: { channels: 2, sampleRate: 48_000 },
    audioCodecs: ['aac', 'opus'],
  });

  const progress: number[] = [];
  const withSound = await exportMp4({
    seconds: 2,
    renderFrame: canvasFrames(),
    audio: tone(2),
    audioCodecs: ['aac', 'opus'],
    onProgress: (p) => progress.push(p.fraction),
  });
  result.withSound = {
    audioCodec: withSound.audioCodec,
    ms: withSound.ms,
    progressSteps: progress.length,
    file: await inspect(withSound.bytes),
  };

  const raw = await exportMp4({ seconds: 1, renderFrame: rgbaFrames() });
  result.rawFrames = { ms: raw.ms, file: await inspect(raw.bytes) };

  // AAC only, as today's default: on a device without AAC this must refuse, not make a file.
  try {
    const aac = await exportMp4({ seconds: 1, renderFrame: canvasFrames(), audio: tone(1) });
    result.aacOnly = { made: true, audioCodec: aac.audioCodec };
  } catch (e) {
    result.aacOnly = { made: false, code: (e as ExportError).code };
  }

  const abort = new AbortController();
  try {
    await exportMp4({
      seconds: 3,
      renderFrame: (i) => {
        if (i === 5) abort.abort();
        return canvasFrames()(i);
      },
      signal: abort.signal,
    });
    result.cancel = { stopped: false };
  } catch (e) {
    result.cancel = { stopped: true, code: (e as ExportError).code };
  }

  document.getElementById('out')!.textContent = JSON.stringify(result, null, 2);
  (window as unknown as { exportResult: unknown }).exportResult = result;
}

main().catch((e: unknown) => {
  (window as unknown as { exportResult: unknown }).exportResult = { error: String(e) };
});
