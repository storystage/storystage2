/**
 * WP11a end to end: real MP4s made in the browser (H.264, with sound where the browser can
 * encode it), read back and checked; the AAC-only default refuses rather than making a file
 * without proper sound; cancel stops.
 */
import { expect, test } from '@playwright/test';

test('exports real MP4s, checked by reading them back', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('http://localhost:4180/');
  const handle = await page.waitForFunction(
    () => (window as unknown as { exportResult?: unknown }).exportResult,
    undefined,
    {
      timeout: 170_000,
    },
  );
  type File = {
    duration: number;
    video: { codec: string; width: number; height: number; frames: number } | null;
    audio: { codec: string; channels: number } | null;
  };
  const r = (await handle.jsonValue()) as {
    error?: string;
    probe: { video: boolean; audioCodec: string | null };
    withSound: { audioCodec: string | null; progressSteps: number; file: File };
    rawFrames: { file: File };
    aacOnly: { made: boolean; code?: string; audioCodec?: string };
    cancel: { stopped: boolean; code?: string };
  };
  console.log(JSON.stringify(r, null, 2));
  expect(r.error).toBeUndefined();
  expect(r.probe.video).toBe(true);

  // Two seconds from canvas frames, with sound.
  expect(r.withSound.file.video).toEqual({ codec: 'avc', width: 1280, height: 720, frames: 60 });
  expect(r.withSound.file.duration).toBeGreaterThanOrEqual(1.99);
  expect(r.withSound.file.duration).toBeLessThanOrEqual(2.1);
  expect(r.withSound.progressSteps).toBe(60);
  expect(r.withSound.file.audio?.codec).toBe(r.withSound.audioCodec);
  expect(r.withSound.file.audio?.channels).toBe(2);

  // One second from raw RGBA frames, as the stage gives them.
  expect(r.rawFrames.file.video).toEqual({ codec: 'avc', width: 1280, height: 720, frames: 30 });

  // AAC only (today's default): either AAC, or a refusal with the right code.
  if (r.aacOnly.made) expect(r.aacOnly.audioCodec).toBe('aac');
  else expect(r.aacOnly.code).toBe('no_audio_encoder');

  expect(r.cancel).toEqual({ stopped: true, code: 'cancelled' });
});
