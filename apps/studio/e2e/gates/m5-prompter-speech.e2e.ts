import { expect, test } from '@playwright/test';

// The M5 gate, "Prompter and speech" (workplan section 5; WP18.2): the Prompter works in the
// desktop app with the owner's key, and voice in and out work on the device. The manual script
// is docs/test/M5-prompter-speech.md, and most of this gate is the owner's, on the devices, with
// their own key, which never goes into a test. This is the part CI can check on every pull request.
//
// Today the studio runs on the browser host everywhere, the desktop app included: no studio code
// calls the native layer's Prompter, key or speech commands yet. So most of the gate waits; each
// step below names what it waits on. The native layer's own path is checked by the leak scan
// (apps/desktop/leak-scan, desktop.yml) against a fake server, with a key made at run time.

test('M5: speak lines are British by default, with American as the switch in Settings', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('button', { name: 'Settings' }).click();
  const accent = page.getByRole('radiogroup', { name: 'Accent for speak lines' });
  await expect(accent.getByRole('radio', { name: 'British English' })).toBeChecked();
  await expect(accent.getByRole('radio', { name: 'American English' })).not.toBeChecked();
  // A film with no speak line has no voices to choose yet, and says so.
  await expect(
    page.getByText('Each character’s voice shows here once the open film has a speak line.'),
  ).toBeVisible();
});

// The studio in the desktop app on the native host (`tauriHost`, with a transport over
// `prompter_send` and a Tauri channel), so the Prompter, Talk to type and the bundled voices reach
// it. Unassigned in the lane log: packages/host is S8's and S5's; S7's 13.2 waits on it.
test.fixme('M5: in the desktop app, the studio finds the Prompter, the mic and the bundled voices', () => {});

// Set-up 10a to 10d (spec 05, 1.1): Add key opens the system's own dialog, and the panel says
// "Key works. Checked just now." without showing the key. S7 and S5 (13.6). In CI this would run
// against tools/fake-claude with a test-endpoint build, as the leak scan does.
test.fixme('M5: set-up adds a key through the system dialog, and the Prompter is ready', () => {});

// The Prompter panel (07-ux 2.4; spec 04 sections 4 to 7) at each level (decision 0034), the story
// coach declining to write the story, and a plan built and undone in one step. S7 with S5 (WP13c).
test.fixme('M5: the Prompter plans, builds and undoes in one step, at each level', () => {});

// Talk to type (spec 06, section 1): the mic beside a field, tap to start and stop, the words in
// the field as one undo step. Needs the native host and whisper.js bundled in the apps (S8).
test.fixme('M5: Talk to type puts spoken words into the Logline as one undo step', () => {});

// Spoken steps (spec 06, section 3): the Prompter's steps read aloud on the device's own voices,
// with captions, Stop and Esc. S5 (WP13c), on S7's NarrationQueue.
test.fixme('M5: Spoken steps reads the Prompter’s steps aloud, with captions', () => {});
