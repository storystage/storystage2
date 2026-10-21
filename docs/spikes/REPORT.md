# Spike report (WP1.10)

One row per spike, filled in as each one finishes; go/no-go is recorded per spike in `docs/decisions/spike-1.N-<topic>.md`, so work that depends on a spike starts without waiting for the others. **The owner decides go or no-go**; S1 proposes.

| Spike | Status | Measured | Proposed | Owner decision |
|---|---|---|---|---|
| **1.2 Alice model in Babylon.js** | **built; device runs pending** (#6); Alice models wait for S4's converter (WP3b) and the licence (WP17.1) | CI (software rendering): all four presets run, from 19k triangles in 3 characters to 270k in 5 | decide after the M1 device runs | pending |
| **1.3 whisper.cpp in WebAssembly** | **built and passing in CI**; device runs pending (#6) | Both tiny models transcribe a clear recording perfectly; a 5-second robotic request with 1–2 words wrong; **644–758 MB of memory**; model ready in under 0.5 s once downloaded | decide after the M1 device runs; memory is the risk | pending |
| **1.4 Interpreter and scheduler** | **passed in CI** (Chromium, SwiftShader) | 60 fixed-step frames identical twice (pixels and scene state); live: 0 of 16 commands late with a 100 ms lookahead, worst 7.3 ms early; 60 fps | **go**, with the design rules below | **go**, 21 Oct 2026 ([record](../decisions/spike-1.4-scheduler.md)) |
| **1.5 Both code editors** | **passed in CI** (Chromium, SwiftShader); devices pending (#6) | Both editors: typed move, nested do together, object slot, wrong drops refused, arguments asked on drop, keyboard paths (6 Playwright tests). Drag: tiles 0 long frames (mouse and touch); Blockly 0–3 long frames, worst 66–150 ms | **go for both**, with the findings below; touch numbers on the reference devices still needed | **go for both**, 21 Oct 2026 ([record](../decisions/spike-1.5-editors.md)) |
| **1.6 Tauri key path** | **passed in CI** (Windows, WebView2) | Key read from Credential Manager by Rust only; reply streamed to the page in 284 ms; 3 bad requests refused before the network; key found nowhere in the webview: page, storage, IPC replies, or a DevTools heap snapshot (scanner proven by a planted key) | **go** | **go**, 21 Oct 2026 ([record](../decisions/spike-1.6-key-path.md)) |
| 1.7 Tauri Android on a Chromebook | not started (needs reference devices, #6) | | | |
| **1.8 MP4 export** | **passed in CI** (Chrome, Chromium, WebKit, WebView2, WKWebView) | H.264 MP4, 10 s at 720p and 30 fps, valid everywhere; 0.65× to 3.5× real time; AAC missing in Chrome on Linux | **go** for video; audio needs a decision (see the findings) | **go for video**; audio after the Chromebook check, 21 Oct 2026 ([record](../decisions/spike-1.8-mp4.md)) |
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

## 1.8 MP4 export

**Task:** WebCodecs plus Mediabunny (MPL-2.0) encode a 10-second, 30 fps, 1280×720 clip from offscreen Babylon.js frames. Test in Chrome, Safari 26 and each Tauri webview. Record where it fails, and the fallback. Code: `spikes/1.8-mp4/` (the page) and `spikes/1.6-key-path/` (the Tauri harness that runs the page inside WebView2 and WKWebView). Run: `.github/workflows/spikes.yml`.

**How it works.** Frames are drawn at a fixed time step, in a canvas that's never on screen. The scene waits for `whenReadyAsync` first (spike 1.4, rule 5). The page encodes with the first MP4 codec it can (H.264 first), using Mediabunny's `CanvasSource` with backpressure. Each clip is checked with ffprobe and decoded all the way through with ffmpeg.

**Results (20 Oct 2026; GitHub runners, software rendering):**

| Where | Video codecs it can encode | AAC audio | Encode 10 s of 720p | Clip (ffprobe; full decode) |
|---|---|---|---|---|
| Google Chrome (Playwright, Linux) | H.264, VP9, AV1 (no HEVC) | **no** | 15.4 s (0.65× real time) | H.264, 1280×720, 30 fps, 300 frames, 10.000 s; decodes |
| Chromium, open source (Linux) | H.264, VP9, AV1 | **no** | 14.7 s (0.68×) | same |
| WebKit (Playwright, Linux) | H.264, HEVC, VP9, AV1 | yes | 4.5 s (2.2×) | same |
| **Tauri on macOS (WKWebView)** | H.264, HEVC, VP9, AV1 | yes | **2.9 s (3.5×)** | same |
| **Tauri on Windows (WebView2, Edge 154)** | H.264, VP9, AV1 (no HEVC) | yes | **3.2 s (3.2×)** | same |
| Built-in browser on the owner's PC (Chromium 152, 2 cores) | H.264, VP9, AV1 | yes | 7.1 s (1.4×) | (not checked with ffprobe) |

Playwright's device presets replace the user-agent string, so the user agents in the raw results don't say which engine ran. The project names do.

**Findings for WP11 (S2; S1 for the encoder, 11.3 and 11.5):**
1. **Video works everywhere we could test.** H.264 MP4 from offscreen Babylon.js frames, with no fallback needed for video, in Chrome, Chromium, WebKit, and both desktop Tauri webviews (WebView2 and WKWebView).
2. **Audio is the gap, but only in the browser on Chromebooks and Linux.** Both desktop Tauri webviews encode AAC. **Chrome and Chromium on Linux can't**, and ChromeOS is close kin, so the browser version and the Android app on the reference Chromebook must be checked (#6). Options, for WP11.5:
   - Opus audio in the MP4: plays in most players, but not reliably in QuickTime on older Macs or iPads
   - AAC from the native layer on desktop
   - an FFmpeg sidecar on desktop, as the workplan suggests
   - export on another device
3. **Speed:** encoding, not rendering, is the cost (rendering is under 10% of the total). Software encoders on a 2-core runner are slower than real time, so export needs the progress bar and cancel that 11.3 already asks for. The reference devices set the real budget (18.3).
4. Mediabunny needs no changes. It's MPL-2.0, used unmodified, and recorded in `NOTICE`.

**Not covered:** Safari 26 itself and the reference iPad (needs #6); audio tracks (only probed, not encoded); export of a real production with transitions and captions (WP11.3, 11.4).

## 1.6 Tauri key path

**Task:** on Windows, store a key in Credential Manager and send a streamed Messages API request from Rust to the fake Claude server. Stream the events to the web UI, and prove the key never appears in the webview: no JS API returns it, and it doesn't appear in devtools. Code: `spikes/1.6-key-path/` (Rust in `src-tauri/`, page in `src/`, CI scripts in `scripts/`). Run: `.github/workflows/spikes.yml`, job "spike 1.6".

**How it works.**
- **The native layer:** reads the key from the OS store (`keyring` 3.6, Credential Manager on Windows, Keychain on macOS) only inside `prompter_send`, after a first-cut **policy enforcement point** has passed the request. The policy checks the models allowed for the mode, a 32,000-token ceiling, streaming, the SHA-256 of the pinned system prompt, a 10-a-minute cap, and anything key-shaped or auth-like in the body.
- **The reply:** it sends the request with the key added, and streams the reply to the page over a Tauri `Channel` in the transport contract's shape (#32). Each HTTP status maps to one error code, with at most two retries with backoff.
- **The test key:** CI stores a **random test key** that it makes itself; no real key is involved. The fake Claude server checks the key by its SHA-256 hash, so the key is never printed, and logs only whether it matched.
- **The scan:** CI collects everything the webview can see: the page's own report (its HTML, storage, window properties and every native reply), the live page through WebView2's DevTools port, and a full JS heap snapshot. A helper then scans all of it, plus the server log, for the key. The helper's own positive control finds a key planted in a file.

**Results (CI, 20 Oct 2026, windows-latest, WebView2 / Edge 154):**

| Check | Result |
|---|---|
| Rust unit tests (policy, SSE parsing, status codes, Credential Manager round trip) | 10 of 10 pass |
| Status reports the Prompter available, with no key in the reply | pass |
| A request streams to the page and ends, with the text whole | pass (284 ms, 8 events) |
| A request containing a key-shaped string | refused by policy, before the network |
| The wrong model for the mode / an unpinned system prompt | refused by the allowlist, before the network |
| Requests that reached the fake server | exactly 1, and it carried the stored key |
| The key in the page's report, the live page, the 2.8 MB heap snapshot, or the server log | **not found** in any (scanner proven on a planted key) |

**Findings for WP15.2 (S8) and WP13 (S7):**
1. **The design works as decided.** The webview builds the request, and the native layer checks it, adds the key and streams. The key never needs to be in web code, so no JS API returns it.
2. **Refusing before the network is cheap and testable.** The policy is plain Rust with unit tests, and the error codes match the transport contract. The real version adds tool-schema hashes, the per-day cap (24.5), policy-file settings and per-mode models from configuration.
3. **The DevTools heap-snapshot scan is a reusable test.** It belongs in WP15.2's CI and the WP18 self-test on every desktop build. The real app must **never** ship with the remote-debugging port, which the spike harness turns on.
4. `keyring` 4 now splits its stores into separate crates. The spike used 3.6 for a known API; S8 picks one for WP15.2.
5. The Tauri `--config` override let one harness embed a different page (spike 1.8) without code changes. That's useful for running the self-test (WP18.1) inside each webview.

**Not covered:** macOS Keychain and Android Keystore (the code is written for Keychain but only Windows was run); iOS; the native key wizard (the key was stored by the CI helper, not typed by a person); the human security review (recommended before the pilot).

## 1.2 Characters in Babylon.js (Alice model)

**Task:** convert three Alice models (a biped, a quadruped, a prop) to glTF with their joints. Load them in Babylon.js, and animate a turn of the head joint and a walk. Measure frame rate and memory on both reference devices, in Chrome, Safari and the Tauri app. Code: `spikes/1.2-models/`. Page: https://storystage.github.io/storystage2/1.2-models/

**What changed, and why.** Converting Alice's models needs S4's converter (`tools/convert-alice-models`, WP3b), which uses StoryStage 1's Java loader. And until CMU answers (WP17.1), Alice's models mustn't go into this public repository or onto the public spike pages. So the spike is in two halves:
1. **Now: a budget sweep with characters made in code.** A biped with VRM bone names (22 joints, or 52 with fingers) and a quadruped with Alice's joint set (27): one skinned mesh each, at a chosen triangle count, with two bone influences per vertex and a generated texture. Four presets, from 3 small characters to a crowd of 12, each turn their heads and walk. The page records frame rate, frame-time spread, stutters, draw calls, build time and memory, and **flags any measurement taken while the page was hidden** (browsers slow a hidden page to about a frame a second; that's what happened on the first local try).
2. **Later: the Alice models themselves.** The same page opens a `.glb` from the device, finds its joints by Alice or VRM name, and animates its head and walk. S4's converted models are tested that way, on the devices, without being published.

**Results so far (CI, 21 Oct 2026, SwiftShader: a CPU, no GPU, so a floor and not a budget):**

| Preset | Characters × triangles | Texture | Total triangles | Bones | Graphics memory (estimate) | fps | Frames over 50 ms in 5 s |
|---|---|---|---|---|---|---|---|
| small | 3 × 5k | 512 | 19k | 71 | 5 MB | 28.6 | 5 |
| medium | 5 × 20k | 1024 | 107k | 120 | 33 MB | 8.8 | 43 |
| large | 5 × 50k, fingers | 2048 | 269k | 210 | 124 MB | 6.4 | 31 |
| crowd | 12 × 20k | 1024 | 256k | 294 | 79 MB | 7.2 | 28 |

**For WP3.9 (S4) and WP5a (S3), once the devices have run it:** the triangle, bone and texture budgets per model and per scene come from the largest preset that holds 30 fps on the reference Chromebook at "low" (WP5 done-when). Until then, a working assumption is about 20k triangles and 1024 px textures per character, and no more than about 100k triangles per scene.

**Not covered yet:** the reference devices (#6); the three real Alice models (WP3b and WP17.1); Safari and the Tauri app on the devices. The Tauri harness from spike 1.6 can embed this page the same way it embedded 1.8.

## 1.3 whisper.cpp in WebAssembly

**Task:** the tiny model transcribes a 5-second request on both devices. Measure load time, transcription time and peak memory. Code: `spikes/1.3-whisper/`. Page: https://storystage.github.io/storystage2/1.3-whisper/

**How it works.**
- **The build:** CI builds **whisper.cpp v1.9.5** to WebAssembly with **Emscripten 6.0.13**, using whisper.cpp's own example. The only change is exporting Emscripten's file system, so the page can hand over the model.
- **The models:** the **tiny English model**, full (78 MB) and quantised q5_1 (32 MB). They come from whisper.cpp's model repository, are each checked against a pinned SHA-256, and are hosted beside the page, so devices load only from our site.
- **The clips:** a 5-second request made with espeak-ng ("Make the cat walk to the tree, and then wave hello."), and whisper.cpp's public-domain sample, President Kennedy in 1961.
- **The microphone:** a button records 5 seconds and transcribes it. The audio never leaves the tab.
- **Cross-origin isolation:** whisper uses threads, which on a web page need it. On GitHub Pages `coi-serviceworker` provides it.

**Results (CI, 22 Oct 2026, Chromium on a 4-core runner, software only):**

| Model | Memory (WebAssembly) | Model ready (after download) | Request: heard | Request: wrong words | Kennedy (4 s of speech in 11 s): heard | Kennedy: wrong words | Kennedy: time |
|---|---|---|---|---|---|---|---|
| tiny.en q5_1 (32 MB) | **644 MB** | 0.3 s | "make the catwalk to the tree and then wave the low." | 36% | exactly right | 0% | 5.0 s |
| tiny.en (78 MB) | **758 MB** | 0.4 s | "Make the catwalk to the tree and then wave below." | 27% | exactly right | 0% | 7.9 s |

The first transcription after loading took longer (13.4 s for the quantised model's first clip), so the 5-second request's times include warm-up. The device runs repeat each clip.

**Findings for WP14 (S7):**
1. **It works with no server.** whisper.cpp in WebAssembly transcribes in the page, and clear speech comes out right with the tiny model.
2. **Memory is the risk on a 4 GB Chromebook.** whisper.cpp's example reserves **512 MB at start** and grew to 644–758 MB. WP14.1 should try a smaller starting reservation, the quantised model, and freeing whisper after each request, and measure on the device (M1).
3. **The robotic test voice is hard for the tiny model** ("catwalk", "wave the low"). Children's real voices are the test that matters, so the M1 script records the owner's voice. The pilot should add children's voices, with consent (WP19).
4. **Cross-origin isolation** is needed for whisper's threads. The Tauri apps can set the headers themselves; the browser version needs them from its host (WP15.6), or the `coi-serviceworker` workaround.
5. **Licences:** whisper.cpp is MIT. OpenAI's Whisper model weights are MIT too, but check this for the shipped model in WP17. espeak-ng (GPL) was used only as a build tool to make the test clip, and isn't shipped.

**Not covered:** the reference devices (#6), and Safari and the Tauri webviews (the device runs cover Safari); children's voices; the base model (WP1.3 asks only for tiny).
