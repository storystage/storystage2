# 06 Speech

- **Covers:** dictation (whisper WASM), voices, narration, speak line (from StoryStage 1 spec 03)
- **Work package:** WP14
- **Owner:** S7 (S1 for speak line, 14.3)
- **Status:** written for 14.1 and 14.2 (WP14a); section 1 widened to dictation in every field (decision 0060). Section 4, the speak line, is S1's to write (14.3). Numbers marked *to measure* are set at the M1 device runs.
- **Carried over from:** StoryStage 1 spec 03 (speech); see `docs/carried-over/` and its note on what changes. Section 6 lists every difference.

## 0. Decisions this spec relies on

- [0020 Speech in](../decisions/0020-speech-in.md): whisper.cpp in WebAssembly, on the device; audio never leaves it.
- [0057 The speech model is bundled](../decisions/0057-speech-model-bundled.md): the default model ships in the apps; the optional one downloads on request.
- [0060 Dictation in every field](../decisions/0060-dictation-in-every-field.md): dictation into any text field, not only Prompter requests, and not tied to the Prompter.
- [0021 Speech out](../decisions/0021-speech-out.md): browser speech synthesis with on-device voices only; captions always shown.
- [Spike 1.3](../decisions/spike-1.3-whisper.md): go, on the CI evidence, 8 Nov 2026.
- [0022 Off switches](../decisions/0022-off-switches.md): the policy keys `speech.dictation` (dictation anywhere) and `prompter.voiceInput` (talking to the Prompter).
- [0056 Key entry](../decisions/0056-key-entry.md): the Claude key is entered in a system dialog, so it is never dictated.
- `CLAUDE.md` rules 3 (audio never goes to the Prompter), 6 (low-end devices first) and 7 (captions for all speech).

## 1. Dictation (14.1)

**Dictation** means talking instead of typing, in any field a learner types in (decision 0060): the logline, the synopsis, scene headings, script lines, captions, plan steps and requests to the Prompter. A mic button beside each field turns what the learner says into words in that field, on the device. It doesn't depend on the Prompter: it works when the Prompter is off or not set up.

The words are the learner's own, so dictating the story is the learner writing it (rule 4). The audio never leaves the device and never reaches the Prompter (rule 3).

Dictation is in the Tauri apps only. The browser version has no speech input (15.6), and its host's `speech` is `null`.

### 1.1 Shown only when allowed

A field's mic button is shown when all of these are true:

- **the policy allows dictation.** The policy key is `speech.dictation`, separate from the Prompter's level, so a school can allow dictation with the Prompter off, or switch dictation off on its own (S8, spec 05). The host's `speech` is non-null exactly when it is allowed (`@storystage/host`, #152);
- **the page is cross-origin isolated** (`crossOriginIsolated`), because whisper's threads need it. The Tauri apps set the headers themselves (section 7);
- **the learner has turned Talk to type on** in Settings. It is off until they do. Turning it on says, in plain words, that what they say stays on this device and is never sent anywhere. The default model ships with the app, so nothing downloads (section 1.4).

**The Prompter's input** also needs `prompter.voiceInput`, which governs talking to the Prompter only. With it false, every other field can still be dictated into.

**Never dictated:** the Claude key, which is entered in a system dialog (decision 0056), and password-like fields.

### 1.2 The engine

- **whisper.cpp v1.9.5**, built to WebAssembly with **Emscripten 6.0.13**, the versions spike 1.3 measured. The build runs in CI from pinned sources, like the spike's, and its output is pinned by SHA-256.
- It runs in its own **Web Worker**, so the studio never waits on it.
- **Language:** English (`en`), greedy decoding, `min(navigator.hardwareConcurrency, 4)` threads.
- **The spike's build reserved 512 MB at start.** This build starts smaller and grows as needed (`INITIAL_MEMORY` 64 MB, `ALLOW_MEMORY_GROWTH`, `MAXIMUM_MEMORY` 1 GB). *To measure:* peak memory on the reference Chromebook.

### 1.3 Models

| Model | Size | SHA-256 | Use |
|---|---|---|---|
| `ggml-tiny.en-q5_1.bin` (`tiny.en-q5_1`) | 32 MB | `c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b` | The default, **bundled in the app** (decision 0057). Less memory |
| `ggml-tiny.en.bin` (`tiny.en`) | 78 MB | `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f` | Offered in Settings as "More accurate, uses more memory". Downloaded on request |

Both are from whisper.cpp's model repository, as measured in spike 1.3. The names in brackets are the ones the host interface uses (`@storystage/host`, `SPEECH_MODEL_NAMES`); the native layer is only ever asked for a model by those names, never by a path. The base model isn't offered in the first release: the workplan makes it optional, and memory is already the risk. English only, because the interface is English in the first release; Welsh and Gaelic wait for a model that handles them.

The more accurate model is used once it is downloaded and chosen; otherwise the bundled one.

*To measure:* whether the default stays the quantised model, from the owner's own voice at M1 (it got more words wrong on the robotic test voice, and none wrong on real speech).

### 1.4 Getting the model

**The default model ships inside the app** (decision 0057), so dictation works offline from the first launch, with no download and no host to reach. Every install is about 32 MB bigger for it.

Both models reach the worker the same way: **through the native layer, never the webview.** The webview loads no remote content (threat model, spec 15). The native layer (S8, WP15) reads the bundled model from the app's resources, or a downloaded one from its data folder, checks it against its pinned SHA-256 every time it is loaded, and hands the checked bytes to the worker over a Tauri channel (`HostInterface.speech.load`). A model that fails the check isn't used. The webview's content security policy gains no remote host.

**The optional model downloads on request:**

- **After consent.** Choosing "More accurate" in Settings shows the size, that it downloads once, and where it comes from. Nothing downloads until the learner presses **Download**.
- **From where.** From the address the native layer pins at build time (spec 05, section 5.3). The build copies the file there from whisper.cpp's repository and checks it against its pin.
- **Checked.** The download is refused unless its SHA-256 matches the pin, so a swapped file can't be used. A mismatch keeps nothing and says "The download didn't arrive whole. Try again."
- **Kept** in the app's data folder. Settings shows its size and has **Remove**, which goes back to the bundled model.
- **Progress** is shown, with **Cancel**. A failed download can be tried again; until one succeeds, the bundled model is used.

This optional download is the only network traffic speech ever makes (WP14's done-when).

### 1.5 The mic button

- **Tap to start, tap again to stop.** The microphone is on only between the two. A take also stops at 30 seconds, and on Esc, which cancels it. Holding a button down while talking is hard for some young children and for children with motor difficulties, and awkward for a whole synopsis, so the button toggles. StoryStage 1's Hold to talk is gone.
- **From the keyboard:** Enter or Space on the focused mic button starts and stops; Esc cancels. Focus stays on the button, then returns to the field with the words in it.
- **While it listens,** the button shows the microphone is on and a level meter moves, so the learner can see it hears them. While the words are worked out, it says so.
- **One take at a time,** across the whole studio. Starting a take in another field first cancels the one in progress.
- **The microphone is let go** when a take stops or is cancelled, and when the window loses focus or the page is hidden, so the system's microphone light goes off.
- **Too short** (under half a second) isn't transcribed: "Tap the mic, talk, then tap it again."

### 1.6 Audio

- Captured as raw samples at the device's rate (an `AudioWorklet`), mixed to mono, and resampled to **16 kHz** in the worker, which is what whisper needs. Resampling is a pure function, tested on its own.
- Audio exists **only in memory**. It is never written to storage, never logged, never sent anywhere, and never goes to the Prompter (rule 3). After transcription the buffers are zeroed and released.

### 1.7 The words

- **Dictation gives the words back; the studio puts them in the field.** It inserts them at the caret, or replaces the selection, as one undo step named for the field ("Write logline"), and keeps the field's length limit. So the field and its history stay the studio's, as with typing.
- **Nothing is sent or saved by itself.** A dictated Prompter request waits for **Send**, like a typed one. There is no "send when I stop talking" in the first release.
- **Cleaning:** whisper's bracketed notes (`[BLANK_AUDIO]`, `(music)`) and repeated-line glitches are removed, and space is tidied. Whisper's capitals and punctuation are kept. If nothing is left: "I didn't catch that. Try again, a little closer."
- Once in the field, the words are the learner's text like any other. A sent Prompter request goes in its `<learner_request>` block (spec 04, section 2.4).

### 1.8 Memory and the worker's life

The worker is started when the learner first taps a mic button (the model loads while they talk) and **ended** when no take has started for 30 seconds, or at once when the page is hidden. Ending the worker gives its memory back to the device, which freeing whisper inside it doesn't. If the system ends the worker for lack of memory, the learner sees "There isn't enough memory to listen right now. Close other apps and try again," and nothing else is affected.

### 1.9 To measure at M1

On the reference Chromebook and iPad (#6): peak memory, model load time, time to transcribe a 5-second take and a 30-second one (warm and cold), the owner's voice right or wrong, and whether 30 seconds idle is the right life for the worker. The defaults in sections 1.2, 1.3 and 1.8 change if these say so.

### 1.10 Errors

Errors say what happened and what to do next (rule 9). Each has a code, so the studio can choose where to show it, or say it.

| Code | Situation | Message |
|---|---|---|
| `no_microphone` | No microphone | "No microphone found." |
| `permission_denied` | Permission refused | "StoryStage can't use the microphone. You can let it in your device's settings." |
| `too_short` | Under half a second | "Tap the mic, talk, then tap it again." |
| `nothing_heard` | Nothing left after cleaning | "I didn't catch that. Try again, a little closer." |
| `out_of_memory` | The worker was ended for lack of memory | "There isn't enough memory to listen right now. Close other apps and try again." |
| `model_failed` | The model wouldn't load or failed its check | "Talk to type isn't working right now. You can still type." |
| `busy` | A take is already going | Nothing: the studio cancels the other take first |
| `cancelled` | Esc, or another take started | Nothing |
| `internal` | Anything else | "Talk to type stopped working. You can still type." |

The download's own errors are the host interface's `SpeechModelError` codes, shown in Settings: `check_failed` and `offline` as "The download didn't arrive whole. Try again."; `no_space` as "There isn't room on this device for it."

### 1.11 The interface (for S5)

`packages/speech` exports:

```ts
createDictation(speech: SpeechModels | null, options?): Dictation | null

interface Dictation {
  readonly state: Watchable<{ phase: 'idle' | 'listening' | 'working'; level: number }>;
  start(): Promise<void>;           // opens the microphone; rejects with a DictationError
  stop(): Promise<{ text: string }>; // stops and transcribes; rejects with a DictationError
  cancel(): void;                    // stops and throws the audio away
}

class DictationError extends Error {
  readonly code: DictationErrorCode;  // section 1.10
  readonly message: string;           // section 1.10's words
}
```

- `createDictation` returns `null` when `speech` is `null`, so a field with no `onSpeak` has no mic.
- `start` takes nothing about the field: the studio knows which field it is for. One `Dictation` serves the whole studio, one take at a time.
- `state` can be read and subscribed to, so the button shows "Listening…" and the meter without polling. `level` runs from 0 to 1.
- `options` holds the learner's model choice and, for tests, the worker and the microphone.

The words come back from `stop`, and the studio inserts them (section 1.7).

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
| The mic shown only when allowed, and the Prompter's only with `prompter.voiceInput` (1.1) | Unit, each condition | `packages/speech` |
| Tap to start and stop, Esc to cancel, 30 seconds at most, one take at a time (1.5) | Unit, fake microphone and clock | `packages/speech` |
| `stop` gives back the words and inserts nothing; each error has its code and words (1.7, 1.10, 1.11) | Unit | `packages/speech` |
| The microphone is let go on stop, cancel, blur and hide (1.5) | Unit, fake microphone | `packages/speech` |
| Dictated words go in at the caret as one undo step, within the field's limit (1.7) | Unit and end-to-end | `apps/studio` (S5) |
| Transcribing a recorded clip | End-to-end in CI, the spike's clips | `packages/speech` |
| Only on-device voices; en-GB first (2.1) | Unit, fake voice lists | `packages/speech` |
| The sanitiser (2.2) | Unit | `packages/speech` |
| The queue: order, Stop, shortening, captions without a voice (3.1) | Unit, fake speaker | `packages/speech` |
| No network traffic but the download (WP14 done-when) | Device run, with the network watched | M1 script (S1) |
| Memory and speed on the reference devices (1.9) | Device run | M1 script (S1) |

## 6. Differences from StoryStage 1 spec 03

| Area | StoryStage 1 | StoryStage 2 | Why |
|---|---|---|---|
| Speech in | Prompter requests only | Dictation into every text field, with or without the Prompter | Decision 0060 |
| Engine | whisper-jni in Java | whisper.cpp in WebAssembly, in a worker | No Java; decision 0020 |
| Models | Multilingual tiny (default) and base | English tiny, quantised by default; full tiny optional; no base | Memory on 4 GB devices (spike 1.3) |
| Getting the model | Downloaded from Hugging Face | Default bundled in the app (0057); the optional one from StoryStage's website. Both checked by the native layer, pinned | Works offline from the first launch; the webview loads no remote content |
| Capture | Java sound, 16 kHz | `AudioWorklet` at the device's rate, resampled to 16 kHz | Browsers choose the rate |
| Starting and stopping | Hold to talk, or Ctrl+Space | Tap to start, tap to stop; Enter or Space on the focused mic; Esc cancels | Holding is hard for some children; Ctrl+Space switches input languages on some systems |
| Where the words go | Into the Prompter's box | Given back to the studio, which puts them in the field as one undo step | The field and its history stay the studio's |
| Worker life | Model loaded once | Worker ended after 30 seconds idle | Gives memory back on 4 GB devices |
| Browser version | n/a | No speech in | 15.6 |
| Speech out | PowerShell, `say`, `spd-say`, Flite | Browser speech synthesis, on-device voices only | No processes; decision 0021 |
| Narration queue | Carried over | The same, plus a new request clears the old one | |
| Speak line | None | Section 4 (S1) | 14.3 |

## 7. Open points for other sessions

| Needs | From | For |
|---|---|---|
| COOP and COEP headers in the Tauri apps: done on Windows (#155) | S8 (WP15) | Section 1.1 |
| The `speech.dictation` policy key, with `host.speech` following it (#152), in spec 05 and workplan 15.3 | S8 (WP15) | Section 1.1 |
| The bundled model in the app's resources, the optional download, the check on every load, and their rows in the threat model (spec 15) | S8 (WP15) | Section 1.4 |
| Where the optional model is hosted: StoryStage's website or GitHub Releases (S8 proposes the latter, spec 05 section 5.3) | Owner, with S8 | Section 1.4 |
| The mic button beside every field (`TextField`'s `onSpeak`), inserting the words as one undo step, and the Talk to type and model Settings | S5 (WP12) | Sections 1.5, 1.7, 1.11 |
| The model weights' licence confirmed for shipping (MIT), in `NOTICE` | D (WP17) | Section 1.3 |
| The device runs in section 1.9 added to the M1 script | S1 (WP18) | Section 1.9 |
| Speech in the DPIA: on-device only, the one download | D (WP17.3) | Sections 1.4, 1.6 |
