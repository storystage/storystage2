import { expect, test, type Page } from '@playwright/test';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';

// The M6 gate, "Distribution" (workplan section 5; WP18.2): signed apps for Windows, macOS, iPad
// and Android; the browser version live; MP4 export works. The manual script is
// docs/test/M6-distribution.md, and most of this gate is the owner's, on the devices: installing
// the signed apps and playing the film in each one's own player. This is the part CI can check on
// every pull request: the export, from the Screening room to the files saved, read back.
//
// The native layer's parts of WP15's done-when have their own tests in CI (desktop.yml): the
// policy and the school lock, the allowlist that refuses an unlisted model or system prompt, and
// thirty clients backing off without a retry storm. The rollback drill is spec 05, section 4.7.

/** Each file the export saved, as the folder picker received it. */
interface Saved {
  readonly file: string;
  readonly bytes: number[];
}

/**
 * The browser's folder picker, which a test can't drive, stood in for in the page: each file
 * written into the folder is kept on `window`. The studio's own code, from Export film to the
 * files' bytes, runs as it does for a learner.
 */
function standInFolder(page: Page) {
  return page.addInitScript(() => {
    const saved: { file: string; bytes: number[] }[] = [];
    (window as unknown as { savedFilm: typeof saved }).savedFilm = saved;
    (window as unknown as Record<string, unknown>).showDirectoryPicker = async () => ({
      async getFileHandle(file: string) {
        return {
          async createWritable() {
            const parts: Uint8Array[] = [];
            return {
              write: async (b: Uint8Array) => void parts.push(new Uint8Array(b)),
              close: async () => {
                const bytes: number[] = [];
                for (const part of parts) for (const byte of part) bytes.push(byte);
                saved.push({ file, bytes });
              },
            };
          },
        };
      },
    });
  });
}

/** The MP4 read back: its tracks, size, frames and length, as the export's own test reads them. */
async function readBack(bytes: Uint8Array) {
  const input = new Input({ formats: ALL_FORMATS, source: new BufferSource(bytes) });
  const video = await input.getPrimaryVideoTrack();
  const audio = await input.getPrimaryAudioTrack();
  return {
    duration: await input.computeDuration(),
    video: video && {
      codec: video.codec,
      width: video.codedWidth,
      height: video.codedHeight,
      frames: (await video.computePacketStats()).packetCount,
    },
    audio: audio && { codec: audio.codec, channels: audio.numberOfChannels },
  };
}

test('M6: the three-scene film exports to an MP4, with its captions saved beside it', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await standInFolder(page);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');

  await page.getByRole('tab', { name: /Screening room/ }).click();
  await page.getByRole('button', { name: 'Export film' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export film' });
  await expect(dialog).toBeVisible();
  // The automatic check runs first; the film can be exported whatever it finds.
  await expect(dialog.getByText('Checking the film against its storyboard…')).toHaveCount(0, {
    timeout: 60_000,
  });
  await dialog.getByRole('textbox', { name: 'Under the title' }).fill('A film by Gate Class');
  await dialog.getByRole('button', { name: 'Export film' }).click();
  await expect(dialog.getByText(/is saved, with its captions beside it\./)).toBeVisible({
    timeout: 200_000,
  });

  const saved = await page.evaluate(() => (window as unknown as { savedFilm: Saved[] }).savedFilm);
  const named = (end: string) => saved.find((s) => s.file.endsWith(end));
  expect(saved.map((s) => s.file).sort()).toEqual(
    ['.mp4', '.srt', '.vtt'].map((end) => `The Lost Penguin (demo)${end}`),
  );

  // The MP4: H.264 at 720p, 30 frames a second for the whole film. The demo has no speak lines,
  // so nothing in it makes a sound; a film that has one carries AAC (the export's own test).
  const film = await readBack(new Uint8Array(named('.mp4')!.bytes));
  console.log(`M6 export: ${JSON.stringify(film)}`);
  expect(film.video).toMatchObject({ codec: 'avc', width: 1280, height: 720 });
  expect(film.video!.frames).toBe(Math.round(film.duration * 30));
  // Three scenes (1, 1.5 and 1 seconds), the title card, and the credits.
  expect(film.duration).toBeGreaterThan(3.5);
  if (film.audio) expect(film.audio.codec).toBe('aac');

  // The captions, in both formats: each line the film says, timed.
  const vtt = new TextDecoder().decode(new Uint8Array(named('.vtt')!.bytes));
  const srt = new TextDecoder().decode(new Uint8Array(named('.srt')!.bytes));
  expect(vtt.startsWith('WEBVTT')).toBe(true);
  expect(srt).toMatch(/^1\r?\n\d\d:\d\d:\d\d,\d\d\d --> \d\d:\d\d:\d\d,\d\d\d/);
  const cues = (text: string) => text.split(/\r?\n/).filter((l) => /\w/.test(l) && !/-->/.test(l));
  expect(cues(vtt).length).toBeGreaterThan(1);
  for (const said of cues(srt).filter((l) => !/^\d+$/.test(l))) expect(vtt).toContain(said);
});

test('M6: the browser version has no Prompter, key or speech input, and loads only from itself', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);
  // Everything the page asks for, from start-up through each tab and Settings.
  const asked: string[] = [];
  page.on('request', (r) => asked.push(r.url()));
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(
    page
      .getByRole('region', { name: 'Scene view' })
      .getByRole('button', { name: 'Rehearse', exact: true }),
  ).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('tab', { name: /Screening room/ }).click();
  await expect(page.getByRole('region', { name: 'Rough cut' })).toBeVisible({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Self-test' })).toBeVisible();

  // WP15.6: the Prompter, the key and speech input are the apps' alone.
  const headings = await page.getByRole('heading').allInnerTexts();
  expect(headings.join(' | ')).not.toMatch(/Prompter|Talk to type|key/i);
  for (const name of [/Prompter/, /Talk to type/, /Spoken steps/, /Add a key/i])
    await expect(page.getByRole('button', { name })).toHaveCount(0);

  // No StoryStage server, accounts or analytics: every request is to the page's own site.
  const origin = new URL(baseURL!).origin;
  const elsewhere = asked.filter((u) => !u.startsWith(origin) && !/^(data|blob):/.test(u));
  expect(elsewhere).toEqual([]);
});

test.fixme('M6: the signed apps install and open on Windows, macOS, iPad and Android', () => {
  // Waits on code signing (WP15.4: the owner's certificate and notarisation) and the store
  // accounts (WP15.5). Until then desktop.yml and mobile.yml build unsigned. By hand: the script's
  // section 2, on each reference device.
});

test.fixme('M6: the exported film plays in each device’s own player, with captions', () => {
  // A device check (WP11's done-when): Windows, macOS, iPad and ChromeOS. By hand: section 3.
});
