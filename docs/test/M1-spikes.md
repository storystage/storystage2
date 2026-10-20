# M1 Spikes: manual test script (device runs)

**Gate:** each spike passes on the reference devices, or the plan changes (WP1.10). CI has already run each spike in its browsers (see `docs/spikes/REPORT.md`). This script adds the numbers only real devices can give. **Who:** the owner, on the reference Chromebook and iPad (WP1.1, #6), and a Windows PC. Results: `docs/test/results/M1-<date>.md`, with each device's model, OS version and browser version.

**The spike pages:** these are throwaway pages that collect no data. To open them on a device they need to be reachable. **Owner decision:** either S1 publishes the built pages to a GitHub Pages site for this repository (public, no accounts, no analytics), or you serve them from your PC on the school or home network. Until you choose, use the second: S1 can give you a zip of each spike's built pages (`pnpm build` in its folder makes `dist/`). Unzip it on your PC, run `npx serve dist`, and open the address it prints on the device, which must be on the same network.

Before each spike: close other apps and tabs, plug the device in, and note the battery level and whether it is warm.

## 1.4 Interpreter and scheduler (`spikes/1.4-scheduler`)

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open the page in Chrome on the Chromebook, and in Safari on the iPad. Wait for the results to appear (under a minute). | `pixelsIdentical: true`, `statesIdentical: true`. | |
| 2 | Note `live.lookahead100ms`. | `lateCommands: 0`. Note `worstMarginMs` and `fps`: ______ | |
| 3 | Watch the two boxes while it runs. | The orange box speaks, both move together, then the orange one turns three times; the motion looks smooth. | |

## 1.5 Both code editors (`spikes/1.5-editors`), by touch

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open `?editor=tiles`. With a finger, drag **do together** into the program, then **move** into it. | Drop places light up as you drag; the "Who moves?" menu appears when you let go. Answer it by touch. | |
| 2 | Drag **2** onto the "the dog" slot. | It won't go in, and nothing changes. | |
| 3 | Drag tiles around quickly for ten seconds. | Does it keep up with your finger? Note any stutter: ______ | |
| 4 | Open `?editor=blockly` and do 1–3 there. | Same behaviour. Note stutter, especially as a drag starts: ______ | |
| 5 | Which felt easier to use by touch, and why? (Your impression; the study decides later.) | ______ | |
| 6 | On a keyboard (the Chromebook): in `?editor=tiles`, Tab to **move**, press Enter, and answer the menu with the arrow keys and Enter. Then press Space on the new tile, Up, and Space again. | The tile is added, then moved, with the focus outline always visible. | |

## 1.8 MP4 export (`spikes/1.8-mp4`)

| # | Do | Expect | ✓ |
|---|---|---|---|
| 1 | Open the page in Chrome on the Chromebook. Wait for the result (up to a few minutes). | Note `probe.video.avc` and **`probe.aac`** (CI found AAC missing in Chrome on Linux; ChromeOS is the question): ______ | |
| 2 | Note `encode.totalMs` and `encode.speed`. | ______ | |
| 3 | Click **Download the clip** and play it in the Chromebook's own player. | It plays for 10 seconds: four coloured boxes circling, with the camera turning. | |
| 4 | Repeat 1–3 in Safari on the iPad, and play the clip in Photos or Files. | Same. Note `speed`: ______ | |

## Later spikes

1.2 (an Alice model in Babylon.js), 1.3 (whisper in WebAssembly), 1.7 (the Android app on the Chromebook) and 1.9 (AR) are added here as S1 builds them. 1.6 (the key path) needs no device run: it ran on Windows in CI.

## Record

For each device: model, OS version, browser version, battery and warmth, and every number above. Then record go or no-go for each spike in its file in `docs/decisions/`.
