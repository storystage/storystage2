# Spike report (WP1.10)

One row per spike, filled in as each one finishes; go/no-go is recorded per spike in `docs/decisions/spike-1.N-<topic>.md`, so work that depends on a spike starts without waiting for the others. **The owner decides go or no-go**; S1 proposes.

| Spike | Status | Measured | Proposed | Owner decision |
|---|---|---|---|---|
| 1.2 Alice model in Babylon.js | not started (needs reference devices, #6) | | | |
| 1.3 whisper.cpp in WebAssembly | not started (needs reference devices, #6) | | | |
| **1.4 Interpreter and scheduler** | **passed in CI** (Chromium, SwiftShader) | 60 fixed-step frames identical twice (pixels and scene state); live: 0 of 16 commands late with a 100 ms lookahead, worst 7.3 ms early; 60 fps | **go**, with the design rules below | [spike-1.4-scheduler](../decisions/spike-1.4-scheduler.md) |
| **1.5 Both code editors** | **passed in CI** (Chromium, SwiftShader); devices pending (#6) | Both editors: typed move, nested do together, object slot, wrong drops refused, arguments asked on drop, keyboard paths (6 Playwright tests). Drag: tiles 0 long frames (mouse and touch); Blockly 0–3 long frames, worst 66–150 ms | **go for both**, with the findings below; touch numbers on the reference devices still needed | [spike-1.5-editors](../decisions/spike-1.5-editors.md) |
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

## 1.5 Both code editors

**Task:** in each of option B (Blockly with an Alice-style renderer) and option C (a minimal React tile editor), build a typed `move` block with a direction dropdown and an amount, a nested do together, and an object-typed slot. Show that invalid drops are refused, arguments are asked for on drop, and keyboard navigation works. Measure drag performance on both reference devices, with touch. Code: `spikes/1.5-editors/` (`?editor=blockly` or `?editor=tiles`). Run: `.github/workflows/spikes.yml`.

**How it's built.** Both editors edit one tiny typed program with a single drop rule (`canDrop`). Option C uses that rule directly. Option B uses Blockly's connection checks (`Object` and `Number` inputs), plus one rule of its own: nothing may sit outside "when the scene starts". The Alice-style cascade that asks "Who moves? Which way? How far?" when a move lands is **one React component shared by both editors**.

**Results (CI, 20 Oct 2026, Chromium with SwiftShader on a 2-core runner; 6 Playwright tests and 7 unit tests, all passing):**

| Check | Option B (Blockly 13) | Option C (React tiles) |
|---|---|---|
| Typed move, nested do together, object slot | yes | yes |
| A number on the object slot is refused | yes: Blockly won't connect it, and our listener removes the loose block | yes: the drop zone never lights up, and the learner hears "2 can't go there" |
| A tile dropped outside the program is refused | yes (removed) | yes (no drop zone there) |
| Arguments asked for on drop | yes (shared cascade) | yes (shared cascade); Escape cancels the drop |
| Keyboard | Blockly's own navigation: Tab reaches the flyout, then the workspace; arrows move between blocks and connections | Full path built in the spike: add from the palette, answer the cascade, pick up (Space), move (arrows), put down, delete |
| Mouse drag, frames over 50 ms | 1–2 per drag, worst 66–117 ms | 0 (worst 16.8 ms) |
| Touch drag, frames over 50 ms | 0–3 per drag, worst 33–150 ms | 0 (worst 16.8 ms) |
| Bundle | the spike's whole page, both editors and React: 949 kB (269 kB gzipped), mostly Blockly | |

**Findings for WP7, WP7c and WP12:**
1. **One drop rule and one cascade can serve both editors.** That's a good sign for the switch (7.11) and the parity tests (7.12): the behaviour lives outside either editor.
2. **Blockly leaves refused blocks loose by default.** Alice-like behaviour needs our own rule: remove them, or disable them as 7.6 says. Decide which in WP7.6.
3. **Blockly fires its events asynchronously.** Anything that reacts to a drop (refusal, the cascade) happens a moment later, so tests have to wait for it. The first CI run raced on this.
4. **Blockly 13's keyboard navigation is built in and on by default.** Registering it again throws. What's still to check: inserting a block from the flyout by keyboard, and what a screen reader announces.
5. **Drop zones that grow during a drag move everything below them**, so a target shifts under the pointer or finger. The first CI run missed its target because of this. In option C, show drop zones as overlays, or reserve their space, instead of resizing them.
6. **The long frames in Blockly come at the start of a drag**, probably while a block is created from the flyout. Measure it on the reference Chromebook before WP7 sets a budget.
7. Option C's React rows must be render functions, not components defined inside the editor, or they remount on every update and lose keyboard focus. The spike hit this.

**Not covered:** the reference devices, and real touch on an iPad and a Chromebook (needs #6); programs of 500 statements (7.10); screen-reader passes; "add detail"; switching between the editors mid-task.
