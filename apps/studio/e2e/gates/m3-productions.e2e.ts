import { expect, test, type Page } from '@playwright/test';
import { demoProduction, openProduction, saveProduction } from '@storystage/production';

// The M3 gate, "Productions" (workplan section 5; WP18.2): several scenes in one `.storystage`
// file play in order with cuts and fades, as one path. The manual script is
// docs/test/M3-productions.md; this is the part CI can check on every pull request. The play
// rules and the round trip have their own tests (playthrough.test.ts, file.test.ts); this one
// checks they join up in the studio: the Storyboard's running order and transitions, the
// Screening room's rough cut, and Save a copy and Open a copy.
//
// The demo film: scene 1 ends with a cut, scene 2 with a fade to black, and scene 3 is last.

/** Chooses in a segmented control, by its label, as a person would: the label covers the radio. */
const choose = (page: Page, group: string, label: string) =>
  page
    .getByRole('radiogroup', { name: group, exact: true })
    .locator('label')
    .filter({ hasText: new RegExp(`^${label}$`) })
    .click();

/**
 * The system file pickers, which a test can't drive, stood in for in the page: Save a copy keeps
 * the bytes on `window`, and Open a copy hands over what the test put there. The studio's own
 * code, from the Film menu to the file's bytes, runs as it does for a learner.
 */
function standInPickers(page: Page) {
  return page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.showSaveFilePicker = async ({ suggestedName }: { suggestedName: string }) => ({
      async createWritable() {
        const parts: Uint8Array[] = [];
        return {
          write: async (b: Uint8Array) => void parts.push(new Uint8Array(b)),
          close: async () => {
            const bytes = parts.flatMap((p) => [...p]);
            w.savedCopy = { name: suggestedName, bytes };
          },
          abort: async () => undefined,
        };
      },
    });
    w.showOpenFilePicker = async () => {
      const { name, bytes } = w.copyToOpen as { name: string; bytes: number[] };
      return [{ getFile: async () => new File([new Uint8Array(bytes)], name) }];
    };
  });
}

/** A device folder and no class list, as a learner at home has: the Film menu is there. */
async function deviceFolder(page: Page) {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.evaluate(async () => {
    window.localStorage.clear();
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys())
      await root.removeEntry(name, { recursive: true });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^Film: / })).toBeVisible();
}

async function openCopy(page: Page, name: string, bytes: Uint8Array) {
  await page.evaluate(
    ([n, b]) => {
      (window as unknown as Record<string, unknown>).copyToOpen = { name: n, bytes: b };
    },
    [name, [...bytes]] as const,
  );
  await page.getByRole('button', { name: /^Film: / }).click();
  await page.getByRole('menuitem', { name: 'Open a copy…' }).click();
}

test('M3: the film plays its scenes in order, with a cut, a crossfade and a fade', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');

  // Scene 1 now ends with a crossfade instead of a cut: one undo step.
  await page.getByRole('row', { name: /^1 · / }).click();
  await choose(page, 'Ends with', 'Crossfade');
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveText(
    'Undo: End scene 1 with crossfade',
  );

  // The Screening room plays the whole film, scene by scene.
  await page.getByRole('tab', { name: /Screening room/ }).click();
  const rough = page.getByRole('region', { name: 'Rough cut' });
  const play = rough.getByRole('button', { name: 'Play' });
  await expect(play).toBeVisible({ timeout: 60_000 });
  await expect(rough.getByRole('grid', { name: 'Running order' }).getByRole('row')).toHaveText([
    /1\. Ice shelf, morning/,
    /2\. Forest, night/,
    /3\. Ice shelf, evening/,
  ]);
  // Every place the player shows, however briefly, in order.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { seen: string[] }).seen = seen;
    const label = document.querySelector('.sr-player-label')!;
    const note = () => {
      const now = label.textContent ?? '';
      if (seen.at(-1) !== now) seen.push(now);
    };
    note();
    new MutationObserver(note).observe(label, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });
  await play.click();
  await expect(rough.getByRole('button', { name: 'Pause' })).toBeVisible();
  // To the end: Play is offered again, with the bar at its end.
  await expect(play).toBeVisible({ timeout: 60_000 });
  const bar = rough.getByRole('slider', { name: 'Where the film is' });
  expect(await bar.getAttribute('aria-valuenow')).toBe(await bar.getAttribute('aria-valuemax'));
  const seen = await page.evaluate(() => (window as unknown as { seen: string[] }).seen);
  const scenes = seen.map((s) => /Scene (\d)/.exec(s)?.[1]).filter(Boolean);
  expect([...new Set(scenes)], seen.join(' / ')).toEqual(['1', '2', '3']);
});

test('M3: a film saved as a .storystage file opens again the same, transitions and all', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await standInPickers(page);
  await deviceFolder(page);

  // Open a copy of the demo film, as a learner opens a file from a USB stick.
  const demo = saveProduction(demoProduction());
  await openCopy(page, 'The Lost Penguin (demo).storystage', demo);
  await expect(
    page.getByRole('button', { name: /^Film: The Lost Penguin \(demo\)/ }),
  ).toBeVisible();
  await expect(page.getByRole('grid', { name: 'Scenes' }).getByRole('row')).toHaveCount(3);

  // Scene 2 now ends with a crossfade instead of a fade to black.
  await page.getByRole('row', { name: /^2 · / }).click();
  await choose(page, 'Ends with', 'Crossfade');

  // Save a copy: the file holds three scenes in order, and scene 2's new ending.
  await page.getByRole('button', { name: /^Film: / }).click();
  await page.getByRole('menuitem', { name: 'Save a copy…' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { savedCopy?: unknown }).savedCopy))
    .toBeTruthy();
  const saved = await page.evaluate(
    () => (window as unknown as { savedCopy: { name: string; bytes: number[] } }).savedCopy,
  );
  expect(saved.name).toBe('The Lost Penguin (demo).storystage');
  const opened = openProduction(new Uint8Array(saved.bytes));
  expect(opened.status).toBe('ok');
  if (opened.status !== 'ok') return;
  const before = demoProduction().manifest.runningOrder;
  const order = opened.production.manifest.runningOrder;
  expect(order.map((r) => r.scene)).toEqual(before.map((r) => r.scene));
  expect(order.map((r) => r.transition.kind)).toEqual([
    'cut',
    'crossfade',
    before[2]!.transition.kind,
  ]);

  // Open that copy again: the same film, with scene 2 ending in a crossfade.
  await openCopy(page, saved.name, new Uint8Array(saved.bytes));
  await page.getByRole('row', { name: /^2 · / }).click();
  await expect(page.getByRole('radio', { name: 'Crossfade' })).toBeChecked();
  await page.getByRole('row', { name: /^1 · / }).click();
  await expect(page.getByRole('radio', { name: 'Cut' })).toBeChecked();
});
