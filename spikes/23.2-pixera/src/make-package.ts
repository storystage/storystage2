/**
 * Writes the spike's test package: `node src/make-package.ts <folder>`.
 *
 * Two surfaces, Wall and Box, each a PNG sequence; the Wall again as VP9 in WebM, recorded in
 * Edge (MediaRecorder; there's no FFmpeg here), to see whether Pixera takes the container (23.6);
 * a soundtrack; and three cues.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { frame, frameName, png, wav, type Show } from './package.ts';

const FPS = 25;
const SECONDS = 4;
const W = 480;
const H = 270;
const COLOURS: Record<string, [number, number, number]> = {
  Wall: [40, 90, 200],
  Box: [200, 70, 40],
};

async function webm(colour: [number, number, number]): Promise<Buffer> {
  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    const page = await browser.newPage();
    const base64 = await page.evaluate(
      async ({ w, h, fps, seconds, colour }) => {
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const g = canvas.getContext('2d')!;
        const type = 'video/webm;codecs=vp9';
        if (!MediaRecorder.isTypeSupported(type)) throw new Error(`${type} isn't supported`);
        const stream = canvas.captureStream(fps);
        const recorder = new MediaRecorder(stream, { mimeType: type });
        const parts: Blob[] = [];
        recorder.ondataavailable = (e) => parts.push(e.data);
        const stopped = new Promise((r) => (recorder.onstop = r));
        recorder.start();
        const start = performance.now();
        await new Promise<void>((done) => {
          const draw = () => {
            const t = (performance.now() - start) / 1000;
            g.fillStyle = `rgb(${colour.join(',')})`;
            g.fillRect(0, 0, w, h);
            g.fillStyle = '#fff';
            g.fillRect((t % 1) * w - w / 64, 0, w / 32, h);
            for (let s = 0; s <= Math.floor(t); s++)
              g.fillRect(s * (w / 16) + 4, 0, w / 16 - 4, h / 8);
            if (t < seconds) requestAnimationFrame(draw);
            else done();
          };
          draw();
        });
        recorder.stop();
        await stopped;
        const bytes = new Uint8Array(await new Blob(parts, { type }).arrayBuffer());
        let s = '';
        for (const b of bytes) s += String.fromCharCode(b);
        return btoa(s);
      },
      { w: W, h: H, fps: FPS, seconds: SECONDS, colour },
    );
    return Buffer.from(base64, 'base64');
  } finally {
    await browser.close();
  }
}

async function main() {
  const folder = resolve(process.argv[2] ?? 'out/package');
  rmSync(folder, { recursive: true, force: true });
  const show: Show = {
    title: 'StoryStage spike 23.2',
    fps: FPS,
    seconds: SECONDS,
    surfaces: [],
    soundtrack: 'soundtrack.wav',
    cues: [
      { name: 'Start', seconds: 0, operation: 1 },
      { name: 'Hold', seconds: 2, operation: 2 },
      { name: 'End', seconds: SECONDS, operation: 3 },
    ],
  };
  for (const [name, colour] of Object.entries(COLOURS)) {
    const dir = join(folder, 'media', name);
    mkdirSync(dir, { recursive: true });
    for (let n = 0; n < FPS * SECONDS; n++)
      writeFileSync(join(dir, frameName(name, n)), png(W, H, frame(W, H, colour, n, FPS)));
    show.surfaces.push({ name, media: `media/${name}`, kind: 'png-sequence' });
  }
  writeFileSync(join(folder, 'media', 'Wall.webm'), await webm(COLOURS.Wall!));
  show.surfaces.push({ name: 'Wall', media: 'media/Wall.webm', kind: 'video' });
  writeFileSync(join(folder, 'soundtrack.wav'), wav(SECONDS));
  writeFileSync(join(folder, 'show.json'), JSON.stringify(show, null, 2) + '\n');
  console.log(`Wrote ${folder}`);
}

await main();
