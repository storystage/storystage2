# M6 Distribution: manual test script

**Gate (workplan section 5):** signed apps for Windows, macOS, iPad and Android; the browser version live; MP4 export works. WP15 is done when signed builds install on each target, the key survives restart, with the policy lock set the Prompter can't be switched on, a request with an unlisted model or system prompt is refused, 30 simulated clients hitting rate limits back off without a retry storm, and the rollback drill passes. WP11 is done when a three-scene production exports to an MP4 that plays in the default player on Windows, macOS, iPad and ChromeOS, with captions and credits. **Who:** the owner, on the devices, with S1 writing up and S8 for the apps.

**What CI already checks on every pull request**, so these steps don't repeat it:

- `apps/studio/e2e/gates/m6-distribution.e2e.ts`: the demo film exported from the Screening room, read back (H.264 at 720p, 30 frames a second for the whole film, AAC where it has sound), with its WebVTT and SRT captions saved beside it; and the browser version with no Prompter, key or speech input, asking nothing of any site but its own.
- `desktop.yml`, in Rust, on Windows and macOS: the policy and the school lock, the gate that refuses an unlisted model or system prompt, and thirty clients backing off without retrying together (`thirty_clients_do_not_retry_together`). The leak scan checks the app itself with a key made at run time.

**Where:** each reference device, with the build the run names: the Windows PC, the Mac, the iPad and the Chromebook (the Android app). A browser for section 4. Steps marked _(signed)_ wait on code signing and the store accounts (WP15.4, 15.5); until then the builds are unsigned and the system warns, which is expected.

## 1. Install the apps _(signed; WP15.1, 15.4, 15.5)_

| # | Device | Do | Expect | ✓ |
|---|---|---|---|---|
| 1 | Windows | Install from the signed installer. | No "unknown publisher" warning: it names StoryStage's publisher. It opens to the studio. | |
| 2 | macOS | Open the downloaded app. | No warning that it can't be checked: it's notarised. It opens to the studio. | |
| 3 | iPad | Install through TestFlight, then the App Store listing. | It opens to the studio. | |
| 4 | Chromebook | Install the Android app from Google Play (managed Play for a school's devices). | It opens to the studio, in a window that can be resized. | |
| 5 | Each | Find the app's version (spec 05, section 4.6; the studio has no About page yet, so this waits on it). | The version and the channel, pilot or stable. | |

## 2. The key and the school lock _(native host; WP15.2, 15.3)_

Use your own key, typed only into the system's dialog (M5 section 1). Never into the studio, a chat, a file or these results.

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Add your key, close the app, and open it again. | The Prompter is still ready: the system kept the key. | |
| 2 | As an administrator, put a policy file with `prompter.enabled=false` where spec 05, section 3.2 says (Windows: `%PROGRAMDATA%\StoryStage\policy.properties`; macOS: `/Library/Application Support/StoryStage/policy.properties`; iPad and Android: managed app configuration). Restart the app. | No Prompter anywhere, and nothing in Settings switches it on. | |
| 3 | Change one line of the file into nonsense, and restart. | The Prompter is off (a malformed policy means off). | |
| 4 | On Windows, as a standard user with no file there, create one that switches the Prompter on. | It's ignored: a file a learner made can't widen anything (spec 05, section 3.6). | |
| 5 | Take the file away, and restart. | The Prompter is back as it was. | |

## 3. Export a film, and play it on each device _(WP11)_

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open the demo film (or a three-scene film of your own). Screening room › **Export film**, 720p, with a title card and "A film by …" under the title. | The automatic check runs first, and the film can be exported whatever it finds. A progress bar, then "… is saved, with its captions beside it." | |
| 2 | Find the three files: the `.mp4`, the `.vtt` and the `.srt`, named after the film. | All three, together. | |
| 3 | Open the MP4 in the device's own player: Films & TV or Media Player on Windows, QuickTime on the Mac, Photos or Files on the iPad, Gallery on the Chromebook. | It plays to the end: the title card, the three scenes with their cut and fade, then the credits (Cast, Props, Set and Backdrops, and any notices). | |
| 4 | With **Captions on the picture** on, look at a line being said. | Its caption is on the picture. | |
| 5 | Turn captions on in a player that reads the `.srt` or `.vtt` beside the film (VLC, or the Windows player). | The same lines, at the same times. | |
| 6 | Export a film with a speak line (M5, section 5). | You hear it in the MP4. On a device that can't put sound into a film, the dialog says so and the captions are still there. Record which. | |
| 7 | Start an export, and **Stop export**. | It stops; nothing half-made is saved. | |
| 8 | Export at 1080p on the Chromebook, and time it. | The time goes in [performance.md](performance.md) (the budget is at most 4× real time). | |

## 4. The browser version _(WP15.6)_

At `app.storystage.org` once it's hosted, or the preview S1 sends until then.

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open it in Chrome, Edge and Safari (on the iPad). | The studio, with nothing to install or sign in to. | |
| 2 | Look for the Prompter, a key, Talk to type and Spoken steps. | None of them: those are the apps' alone. | |
| 3 | Make a film, close the tab, and open it again. | The film is still there. The first time, the studio says your films are kept in this browser on this device. | |
| 4 | Do section 3, steps 1 to 3. | The same. Chrome and Edge ask for a folder to save into; other browsers save one `.zip` holding the three files. | |

## 5. Updates and the rollback drill _(WP15.7)_

The drill is spec 05, section 4.7: publish a good build to the pilot channel and let a test install take it; publish one marked broken, and let it take that; roll the channel back with the `Channel` workflow; and check the next start is the good build. Record how long the rollback took to reach the test install, in `docs/lanes.md`.

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | The drill, on the Windows PC. | The test install ends on the good build. | |
| 2 | With `update.channel=stable` in the policy file, publish to pilot only. | The device doesn't take it. | |
| 3 | With `update.pin` set to the current version, promote a newer one to stable. | The device stays on the pinned version. | |

## Record

For each device: the date, the build, which steps passed, and for each that didn't, what happened, in the studio's own words. Never record your key. Then, on each device, run **Settings › Self-test** › **Run the self-test**, and record its last line (`SELFTEST PASS` or `SELFTEST FAIL`); if it fails, paste its report into the results.
