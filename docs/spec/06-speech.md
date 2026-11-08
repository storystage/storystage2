# 06 Speech

- **Covers:** whisper WASM, voices, narration, speak line (from StoryStage 1 spec 03)
- **Work package:** WP14
- **Owner:** S7 (S1 for speak line, 14.3)
- **Status:** written for 14.1 and 14.2 (WP14a). Section 4, the speak line, is S1's to write (14.3). Numbers marked *to measure* are set at the M1 device runs.
- **Carried over from:** StoryStage 1 spec 03 (speech); see `docs/carried-over/` and its note on what changes. Section 6 lists every difference.

## 0. Decisions this spec relies on

- [0020 Speech in](../decisions/0020-speech-in.md): whisper.cpp in WebAssembly, on the device; audio never leaves it.
- [0057 The speech model is bundled](../decisions/0057-speech-model-bundled.md): the default model ships in the apps; the optional one downloads on request.
- [0021 Speech out](../decisions/0021-speech-out.md): browser speech synthesis with on-device voices only; captions always shown.
- [Spike 1.3](../decisions/spike-1.3-whisper.md): go, on the CI evidence, 8 Nov 2026.
- [0022 Off switches](../decisions/0022-off-switches.md) and [0034 Prompter levels](../decisions/0034-prompter-levels.md): the policy key `prompter.voiceInput`, and Off.
- `CLAUDE.md` rules 3 (audio never goes to the Prompter), 6 (low-end devices first) and 7 (captions for all speech).

## 1. Speech in (14.1)

Speech in is a way to give the Prompter a request without typing. It exists only where the Prompter does, so it is in the Tauri apps and not the browser version (`BROWSER_POLICY.prompter.voiceInput` is false; 15.6).

### 1.1 Shown only when allowed

The **Hold to talk** button is shown when all of these are true:

- the Prompter's level isn't Off, and `prompter.voiceInput` is true in the policy in force;
- the page is cross-origin isolated (`crossOriginIsolated`), because whisper's threads need it. The Tauri apps set the headers themselves (section 7);
- the learner has turned **Talk to the Prompter** on in Settings. It is off until they do.

Turning it on says, in plain words, that what the learner says stays on this device and is never sent anywhere. The default model ships with the app, so nothing downloads (section 1.4).

### 1.2 The engine

- **whisper.cpp v1.9.5**, built to WebAssembly with **Emscripten 6.0.13**, the versions spike 1.3 measured. The build runs in CI from pinned sources, like the spike's, and its output is pinned by SHA-256.
- It runs in its own **Web Worker**, so the studio never waits on it.
- **Language:** English (`en`), greedy decoding, `min(navigator.hardwareConcurrency, 4)` threads.
- **The spike's build reserved 512 MB at start.** This build starts smaller and grows as needed (`INITIAL_MEMORY` 64 MB, `ALLOW_MEMORY_GROWTH`, `MAXIMUM_MEMORY` 1 GB). *To measure:* peak memory on the reference Chromebook.

### 1.3 Models

| Model | Size | SHA-256 | Use |
|---|---|---|---|
| `ggml-tiny.en-q5_1.bin` | 32 MB | `c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b` | The default, **bundled in the app** (decision 0057). Less memory |
| `ggml-tiny.en.bin` | 78 MB | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` | Offered in Settings as "More accurate, uses more memory". Downloaded on request |

Both are from whisper.cpp's model repository, as measured in spike 1.3. The base model isn't offered in the first release: the workplan makes it optional, and memory is already the risk. English only, because the interface is English in the first release; Welsh and Gaelic wait for a model that handles them.

*To measure:* whether the default stays the quantised model, from the owner's own voice at M1 (it got more words wrong on the robotic test voice, and none wrong on real speech).

### 1.4 Getting the model

**The default model ships inside the app** (decision 0057), so speech works offline from the first launch, with no download and no host to reach. Every install is about 32 MB bigger for it.

Both models reach the worker the same way: **through the native layer, never the webview.** The webview loads no remote content (threat model, spec 15). The native layer (S8, WP15) reads the bundled model from the app's resources, or a downloaded one from its data folder, checks it against its pinned SHA-256 every time it is loaded, and hands the checked bytes to the worker over a Tauri channel. A model that fails the check isn't used. The webview's content security policy gains no remote host.

**The optional model downloads on request:**

- **After consent.** Choosing "More accurate" in Settings shows the size, that it downloads once, and where it comes from. Nothing downloads until the learner presses **Download**.
- **From where.** From StoryStage's own website, where it sits beside the browser version (15.6), so no new third party sees the device. The build copies it there from whisper.cpp's repository and checks it against its pin. The address is pinned in the native layer at build time.
- **Checked.** The download is refused unless its SHA-256 matches the pin, so a file swapped on the website can't be used. A mismatch keeps nothing and says "The download didn't arrive whole. Try again."
- **Kept** in the app's data folder. Settings shows its size and has **Remove**, which goes back to the bundled model.
- **Progress** is shown, with **Cancel**. A failed download can be tried again; until one succeeds, the bundled model is used.

This optional download is the only network traffic speech ever makes (WP14's done-when).

### 1.5 Hold to talk

- The microphone is opened **only while** the button is held: by pointer or touch, or by holding Space while the button has focus. Releasing it stops the microphone and starts the transcription. S5 may add a shortcut (section 7).
- **At most 30 seconds.** At 30 seconds recording stops as if the button had been released.
- While held, the button shows that the microphone is on, and a level meter moves, so a learner can see it hears them.
- The microphone's tracks are stopped on release, on blur, and when the page is hidden, so the system's microphone light goes off.
- Too short (under half a second) is ignored, with "Hold the button while you talk."

### 1.6 Audio

- Captured as raw samples at the device's rate (an `AudioWorklet`), mixed to mono, and resampled to **16 kHz** in the worker, which is what whisper needs. Resampling is a pure function, tested on its own.
- Audio exists **only in memory**. It is never written to storage, never logged, never sent anywhere, and never goes to the Prompter (rule 3). After transcription the buffers are zeroed and released.

### 1.7 The transcript

- The text goes into the Prompter's input box, where the learner can edit it. **Nothing is sent until the learner presses Send.** There is no "send when I stop talking" in the first release.
- Whisper's bracketed notes (`[BLANK_AUDIO]`, `(music)`) and repeated-line glitches are removed. If nothing is left: "I didn't catch that. Try again, a little closer."
- Once sent, the transcript is a request like typed text, in its `<learner_request>` block (spec 04, section 2.4).

### 1.8 Memory and the worker's life

The worker is started when the learner first presses **Hold to talk** (loading begins while they talk) and **ended** when no transcription has started for 30 seconds, or at once when the page is hidden. Ending the worker gives its memory back to the device, which freeing whisper inside it doesn't. If the worker is ended by the system for lack of memory, the learner sees "There isn't enough memory to listen right now. Close other apps and try again," and nothing else is affected.

### 1.9 To measure at M1

On the reference Chromebook and iPad (#6): peak memory, model load time, time to transcribe a 5-second request (warm and cold), the owner's voice right or wrong, and whether 30 seconds idle is the right life for the worker. The defaults in sections 1.2, 1.3 and 1.8 change if these say so.

### 1.10 Errors

Errors say what happened and what to do next (rule 9).

| Situation | Message |
|---|---|
| No microphone | "No microphone found." |
| Permission refused | "StoryStage can't use the microphone. You can let it in your device's settings." |
| Download failed or checksum mismatch | "The download didn't arrive whole. Try again." |
| Not enough memory | "There isn't enough memory to listen right now. Close other apps and try again." |
| Nothing heard | "I didn't catch that. Try again, a little closer." |
| Anything else | "Voice input stopped working. You can still type." |

## 2. Voices (14.2)

### 2.1 Which voices

- Speech uses the browser's **speech synthesis** (`speechSynthesis`), and only voices with **`localService: true`**, which run on the device. Online voices are never used, so no text leaves the device to be spoken.
- **Preferred order:** an `en-GB` voice, then any other English voice, then none. Among equals, the system's default voice first, then by name. Settings lists the on-device English voices, so the learner can choose.
- Voices can arrive late (`voiceschanged`), so the choice is made again when they change.
- **No voice at all** is a normal state: captions still show, and **Spoken steps** says "This device has no voice StoryStage can use. Captions still show."

### 2.2 What gets spoken

Every piece of text is cleaned before it is spoken (the sanitiser, carried over):

- plain text only: no markdown symbols, no tags, no control characters, whitespace collapsed;
- split at sentence ends into utterances of at most **300 characters**, because some engines cut long utterances off (Chrome's at about 15 seconds).

### 2.3 Speech is never the only way

Every spoken text is also shown as a caption (rule 7, decision 0021). Captions don't depend on a voice existing, on **Spoken steps** being on, or on the sound being up.

## 3. Narration (14.2)

The Prompter's steps are read aloud as they land, if **Spoken steps** is on. It is off until the learner turns it on, and captions show either way.

### 3.1 The queue

- Each tool call's `narration` (spec 04, section 3) is queued **as its change lands**, so speech follows what the learner sees. The `explain` text and the Prompter's summing up are queued too.
- The caption appears at once and is highlighted while it is spoken.
- **Stop** (the button, or Esc in the Prompter panel) clears the queue and stops speaking. It doesn't undo anything.
- Speech never holds up a build. If more than **five** items are waiting, the older ones are cut to "Step 3 done", so speech catches up with the build instead of trailing it.
- A new learner request clears what's left of the last one.

### 3.2 The interface (for S5 and S1)

`packages/speech` exports:

- `chooseVoice(voices, preferred?)`: the voice to use, or none, by section 2.1;
- `speakable(text)`: section 2.2's sanitiser, giving the utterances;
- `NarrationQueue`: `say(item)`, `stop()`, and events for the caption to highlight. It takes a `Speaker` (the browser's, or a fake in tests), so it is tested without sound.

The Prompter panel (S5, WP13c) shows the captions; the speak line block (S1, 14.3) uses the same voices and sanitiser.

## 4. Speak line (14.3)

S1 writes this section (14.3): characters speak script dialogue through the same voices, captioned.

## 5. Tests

| Rule | Level | Where |
|---|---|---|
| The model is refused unless its SHA-256 matches (1.4) | Unit, with a tampered file | `packages/speech`; the native layer (S8) |
| The optional model downloads only after consent, and the bundled one is used until it does (1.4) | Unit | `packages/speech` |
| Resampling to 16 kHz mono (1.6) | Unit, known signals | `packages/speech` |
| Audio buffers are zeroed after transcription, and nothing is written or sent (1.6) | Unit; the leak scan (15.2) checks storage | `packages/speech`, `apps/desktop` |
| Bracketed notes and empty transcripts (1.7) | Unit | `packages/speech` |
| The worker ends after 30 seconds idle and on hide (1.8) | Unit, with a fake clock | `packages/speech` |
| Hold to talk shown only when allowed (1.1) | Unit, each condition | `packages/speech` |
| Transcribing a recorded clip | End-to-end in CI, the spike's clips | `packages/speech` |
| Only on-device voices; en-GB first (2.1) | Unit, fake voice lists | `packages/speech` |
| The sanitiser (2.2) | Unit | `packages/speech` |
| The queue: order, Stop, shortening, captions without a voice (3.1) | Unit, fake speaker | `packages/speech` |
| No network traffic but the download (WP14 done-when) | Device run, with the network watched | M1 script (S1) |
| Memory and speed on the reference devices (1.9) | Device run | M1 script (S1) |

## 6. Differences from StoryStage 1 spec 03

| Area | StoryStage 1 | StoryStage 2 | Why |
|---|---|---|---|
| Speech in | whisper-jni in Java | whisper.cpp in WebAssembly, in a worker | No Java; decision 0020 |
| Models | Multilingual tiny (default) and base | English tiny, quantised by default; full tiny optional; no base | Memory on 4 GB devices (spike 1.3) |
| Getting the model | Downloaded from Hugging Face | Default bundled in the app (0057); the optional one from StoryStage's website. Both checked by the native layer, pinned | Works offline from the first launch; the webview loads no remote content |
| Capture | Java sound, 16 kHz | `AudioWorklet` at the device's rate, resampled to 16 kHz | Browsers choose the rate |
| Shortcut | Ctrl+Space | Space on the focused button; any global shortcut is S5's | Ctrl+Space switches input languages on some systems |
| Worker life | Model loaded once | Worker ended after 30 seconds idle | Gives memory back on 4 GB devices |
| Browser version | n/a | No speech in | No Prompter there (0022) |
| Speech out | PowerShell, `say`, `spd-say`, Flite | Browser speech synthesis, on-device voices only | No processes; decision 0021 |
| Narration queue | Carried over | The same, plus a new request clears the old one | |
| Speak line | None | Section 4 (S1) | 14.3 |

## 7. Open points for other sessions

| Needs | From | For |
|---|---|---|
| COOP and COEP headers in the Tauri apps | S8 (WP15) | Section 1.1 |
| The bundled model in the app's resources, the optional download, the check on every load, and their rows in the threat model (spec 15) | S8 (WP15) | Section 1.4 |
| The optional model on StoryStage's website, beside the browser version | Owner (U hosts, 15.6) | Section 1.4 |
| A shortcut for Hold to talk, if wanted, and the consent and Settings screens | S5 (WP12) | Sections 1.4, 1.5 |
| The model weights' licence confirmed for shipping (MIT), in `NOTICE` | D (WP17) | Section 1.3 |
| The device runs in section 1.9 added to the M1 script | S1 (WP18) | Section 1.9 |
| Speech in the DPIA: on-device only, the one download | D (WP17.3) | Sections 1.4, 1.6 |
