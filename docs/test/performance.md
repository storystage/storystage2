# Performance budgets (WP18.3)

How fast StoryStage must start, load a scene, rehearse and export, and how much memory it may use: in CI on every pull request, and on each reference device. **Who:** S1 keeps this page and CI's test; the owner runs the devices. CLAUDE.md rule 6: the 4 GB Chromebook is the device every budget is for.

## What's measured, and how

| Measure | What it is | In CI | On a device |
|---|---|---|---|
| **Start-up** | From the page starting to load to the Storyboard taking input | `apps/studio/e2e/performance.e2e.ts` | **Settings › Report a problem**: "Timings on this device" (first paint and ready to run); and a stopwatch to the Storyboard |
| **Scene load** | From choosing the Production stage to **Rehearse** being offered on the demo's scene 1 | The same test | Stopwatch, on `?example` |
| **Frame rate** | Frames drawn a second while Rehearse plays, and frames over 50 ms | The same test, for 3 seconds | Spike 1.2's budget sweep (M1 checklist), until the studio has a live measure |
| **Memory** | JavaScript's heap in use after Rehearse (Chromium only); and whether the tab survives | The same test | Report a problem's "JavaScript memory in use"; a tab that reloads itself is a fail |
| **Export speed** | Time to export five seconds of film, over five seconds | The self-test's "Export five seconds", run by the same test | **Settings › Self-test**: the time beside "Export five seconds" |

CI's test prints its numbers in the log (`Performance: {…}`) and writes `test-results/performance.json`. `STUDIO_CPU_SLOWDOWN=4` slows Chromium's CPU fourfold, a rough stand-in for the Chromebook: then the numbers are reported and not held.

## The budgets

CI draws in software on a two-core runner, so its budgets are set at about three times what it measures: they catch a change that makes StoryStage clearly slower, not a device being slow. The devices' budgets are what a lesson needs; they are **provisional until the owner's runs**, and the Chromebook's numbers then replace them here, through a decision record if they change what's built.

| Measure | CI (budget) | Owner's PC, Edge, software drawing (measured 15 Nov) | Same, CPU slowed 4× | Reference Chromebook (target) | Reference iPad (target) |
|---|---|---|---|---|---|
| Start-up | ≤ 6 s | 1.2 s | 3.0 s | ≤ 5 s | ≤ 5 s |
| Scene load | ≤ 8 s | 1.4 s | 2.6 s | ≤ 5 s | ≤ 5 s |
| Rehearse frame rate | ≥ 5 fps | 59 fps, 0 frames over 50 ms | 56 fps, 1 over 50 ms | ≥ 30 fps at "low" (WP5's done-when) | ≥ 30 fps |
| JavaScript memory | ≤ 400 MB | 36 MB | 34 MB | ≤ 400 MB, and the tab never reloads | ≤ 400 MB, and the tab never reloads |
| Export, five seconds | ≤ 15× real time | 2.8× (14 s) | 8.6× (43 s) | ≤ 4× real time, so a one-minute film exports in four minutes | ≤ 4× real time |

**Sources:** 30 fps at "low" on the Chromebook is WP5's done-when and spec 17, section 4. Export speed in spike 1.8 ran from 0.65× real time (Chrome) to 3.5× (software encoders on a two-core runner), so 4× is the provisional device target. Whisper's own memory (spike 1.3, 644–758 MB in its worker) is measured apart, by spike 1.3's device run; it isn't in JavaScript's heap here.

## Device runs

On each reference device, with the build the run names, after the M1 checklist's preparation:

1. Open the studio at `?example`. Note how long until the Storyboard takes typing (a stopwatch is fine).
2. Choose the Production stage, and note how long until **Rehearse** is offered.
3. **Rehearse**. Does it look smooth? Note any stutter.
4. **Settings › Self-test** › **Run the self-test**: note the time beside "Export five seconds", and the last line.
5. **Settings › Report a problem** › **Make the report**, and paste it into a chat with S1: it holds "Timings on this device" and the self-test, and nothing personal.

S1 writes the numbers into the table above and says what changes.
