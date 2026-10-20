/**
 * Spike 1.8: a 10-second, 30 fps, 1280×720 clip rendered offscreen by Babylon.js, frame by frame
 * at a fixed time step, encoded with WebCodecs and muxed to MP4 by Mediabunny (MPL-2.0, used
 * unmodified). Results go on `window.spikeResult`; the file is offered as a download so CI can
 * check it with ffprobe.
 */
import {
  ArcRotateCamera,
  Color3,
  Color4,
  Engine,
  HemisphericLight,
  MeshBuilder,
  Scene,
  StandardMaterial,
  Vector3,
} from '@babylonjs/core';
import {
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  canEncodeAudio,
  canEncodeVideo,
  type VideoCodec,
} from 'mediabunny';

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 30;
const SECONDS = 10;

function makeScene(canvas: HTMLCanvasElement) {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: false });
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.55, 0.75, 0.95, 1);
  const camera = new ArcRotateCamera('camera', -Math.PI / 2, 1.1, 9, Vector3.Zero(), scene);
  new HemisphericLight('light', new Vector3(0.3, 1, -0.4), scene);
  const ground = MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);
  const gm = new StandardMaterial('g', scene);
  gm.diffuseColor = new Color3(0.4, 0.65, 0.35);
  ground.material = gm;
  const actors = [0, 1, 2, 3].map((i) => {
    const box = MeshBuilder.CreateBox(`actor${i}`, { width: 0.8, height: 1.2, depth: 0.6 }, scene);
    const m = new StandardMaterial(`m${i}`, scene);
    m.diffuseColor = Color3.FromHSV(i * 80, 0.7, 0.9);
    box.material = m;
    return box;
  });
  /** The scene at time t: a pure function, so every run draws the same frames. */
  const pose = (t: number) => {
    actors.forEach((a, i) => {
      const phase = t * 0.6 + (i * Math.PI) / 2;
      a.position.set(
        Math.cos(phase) * 3,
        0.6 + Math.abs(Math.sin(t * 3 + i)) * 0.5,
        Math.sin(phase) * 3,
      );
      a.rotation.y = -phase;
    });
    camera.alpha = -Math.PI / 2 + t * 0.15;
  };
  return { engine, scene, pose };
}

async function probe() {
  const codecs: VideoCodec[] = ['avc', 'hevc', 'vp9', 'av1'];
  const video: Record<string, boolean> = {};
  for (const c of codecs)
    video[c] = await canEncodeVideo(c, { width: WIDTH, height: HEIGHT, bitrate: QUALITY_HIGH });
  return {
    webCodecs: typeof VideoEncoder !== 'undefined',
    video,
    aac: await canEncodeAudio('aac'),
  };
}

async function encode(codec: VideoCodec) {
  const canvas = document.createElement('canvas'); // never attached: offscreen
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const { engine, scene, pose } = makeScene(canvas);
  await scene.whenReadyAsync(); // spike 1.4, rule 5
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
    target: new BufferTarget(),
  });
  const source = new CanvasSource(canvas, { codec, bitrate: QUALITY_HIGH, keyFrameInterval: 2 });
  output.addVideoTrack(source, { frameRate: FPS });
  await output.start();
  const started = performance.now();
  let renderMs = 0;
  for (let f = 0; f < FPS * SECONDS; f++) {
    const r0 = performance.now();
    pose(f / FPS);
    scene.render();
    renderMs += performance.now() - r0;
    await source.add(f / FPS, 1 / FPS);
  }
  await output.finalize();
  const totalMs = performance.now() - started;
  engine.dispose();
  const buffer = output.target.buffer!;
  return {
    codec,
    frames: FPS * SECONDS,
    bytes: buffer.byteLength,
    totalMs: Math.round(totalMs),
    renderMs: Math.round(renderMs),
    encodeMs: Math.round(totalMs - renderMs),
    /** How many times faster than real time (above 1: quicker than playing it). */
    speed: Math.round((SECONDS * 1000 * 100) / totalMs) / 100,
    buffer,
  };
}

async function main() {
  const out = document.getElementById('out')!;
  const result: Record<string, unknown> = { userAgent: navigator.userAgent };
  result.probe = await probe();
  const supported = (result.probe as { video: Record<string, boolean> }).video;
  const codec = (['avc', 'hevc', 'vp9', 'av1'] as VideoCodec[]).find((c) => supported[c]);
  if (!codec) {
    result.encode = { error: 'No MP4 video codec can be encoded here: the fallback is needed.' };
  } else {
    try {
      const { buffer, ...stats } = await encode(codec);
      result.encode = stats;
      const link = document.getElementById('download') as HTMLAnchorElement;
      link.href = URL.createObjectURL(new Blob([buffer], { type: 'video/mp4' }));
      link.download = `spike-1.8-${codec}.mp4`;
      link.hidden = false;
    } catch (e) {
      result.encode = { codec, error: String(e) };
    }
  }
  out.textContent = JSON.stringify(result, null, 2);
  (window as unknown as { spikeResult: unknown }).spikeResult = result;
}

main().catch((e: unknown) => {
  (window as unknown as { spikeResult: unknown }).spikeResult = { error: String(e) };
  document.getElementById('out')!.textContent = `Failed: ${String(e)}`;
});
