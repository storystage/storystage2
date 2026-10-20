# Spike report (WP1.10)

One row per spike, filled in as each one finishes; go/no-go is recorded per spike in `docs/decisions/spike-1.N-<topic>.md`, so work that depends on a spike starts without waiting for the others. **The owner decides go or no-go**; S1 proposes.

| Spike | Status | Measured | Proposed | Owner decision |
|---|---|---|---|---|
| 1.2 Alice model in Babylon.js | not started (needs reference devices, #6) | | | |
| 1.3 whisper.cpp in WebAssembly | not started (needs reference devices, #6) | | | |
| **1.4 Interpreter and scheduler** | **passed in CI** (Chromium, SwiftShader) | 60 fixed-step frames identical twice (pixels and scene state); live: 0 of 16 commands late with a 100 ms lookahead, worst 7.3 ms early; 60 fps | **go**, with the design rules below | [spike-1.4-scheduler](../decisions/spike-1.4-scheduler.md) |
| 1.5 Both code editors | not started | | | |
| 1.6 Tauri key path | not started | | | |
| 1.7 Tauri Android on a Chromebook | not started (needs reference devices, #6) | | | |
| 1.8 MP4 export | not started | | | |
| 1.9 AR | not started (needs devices) | | | |

## 1.4 Interpreter and scheduler

**Task:** a Web Worker runs a small program with do in order, nested do together, count and a timed event; it drives Babylon.js on the main thread with correct timing; a fixed-time-step mode renders 60 frames offscreen identically twice in a row. Code: `spikes/1.4-scheduler/`. Run: `.github/workflows/spikes.yml` (results in the run's artifact).

**How it works.** The worker runs a cooperative scheduler: each running block is a generator that yields "wait this long" or "wait for these children" (do together). The scheduler is a discrete-event loop over virtual time in whole microseconds, with ties broken by thread number. It posts **relative, additive** stage commands (move by, turn by, say), each with a start time and duration on a clock shared with the main thread (`performance.timeOrigin + performance.now()`). The main thread computes the scene at any time as the starting state plus each command's eased share. That's a pure function, the same in both threads.

**Results (CI, 20 Oct 2026, Chromium 156 with SwiftShader on a GitHub runner):**

| Check | Result |
|---|---|
| Timing of do in order, nested do together, count and the timed event (unit tests, 8) | all pass, to the microsecond |
| Same commands on every run; frames unchanged whether the scheduler runs 0, 0.1 or 1 s ahead | pass |
| 60 frames at 30 fps, offscreen, twice: scene-state hashes | identical |
| … pixels, after `scene.whenReadyAsync()` | identical (33 distinct frames) |
| … pixels, **without** waiting | **differ at frame 0** (shaders still compiling) |
| Live, 100 ms lookahead | 0 of 16 commands late; worst 7.3 ms early; 60 fps |
| Live, no lookahead | 16 of 16 late, by up to 3.7 ms |
| Computing the whole 4 s timeline | under 1 ms |

**Design rules this suggests (for WP6, S2, and WP5a, S3):**
1. **The worker runs ahead of the clock** (about 100 ms) and timestamps commands on the shared clock. Messages then arrive before they're due, and the main thread never waits on the worker.
2. **Start the clock only when the worker reports ready.** The first run started the clock 50 ms after creating the worker, and the first command was 14 ms late.
3. **Virtual time in integer microseconds, with a total order (time, thread number)**, so runs repeat exactly, live or fixed step.
4. **Commands are relative and additive**, so overlapping animations on one object (moving while turning, nested do together) compose in any order.
5. **Offscreen export waits for the scene to be ready** (`whenReadyAsync`) before the first frame, and again after any model or material is added (WP5.5, WP11.3).
6. **Import Babylon.js by module, not from the package root.** The spike's root import gives a 6.8 MB bundle (1.5 MB gzipped), too big for the reference Chromebook (WP5a).

**Not covered, for WP6 to decide:**
- Anything that reads the scene back, such as functions like "distance to", clicks and collisions. These need the worker to wait for the main thread, which limits the lookahead.
- Whether moving while turning goes in a straight line (the spike) or an arc (Alice).
- The other overlap rules for events: the spike skips a run while the last one is still going.
- Timing in Safari and in the Tauri webviews, and on the reference devices. Not needed for go/no-go, but worth one run when 1.2 is measured on the devices.
