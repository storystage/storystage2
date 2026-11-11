# 06 Speech

- **Covers:** dictation (whisper WASM), voices, narration, speak line (from StoryStage 1 spec 03)
- **Work package:** WP14
- **Owner:** S7 (S1 for speak line, 14.3)
- **Status:** written for 14.1 and 14.2 (WP14a); section 1 widened to dictation in every field (decision 0060). Section 4, the speak line (14.3), proposed by S1 on 8 Nov 2026; its section 4.6 waits for the owner. Numbers marked *to measure* are set at the M1 device runs.
- **Carried over from:** StoryStage 1 spec 03 (speech); see `docs/carried-over/` and its note on what changes. Section 6 lists every difference.

## 0. Decisions this spec relies on

- [0020 Speech in](../decisions/0020-speech-in.md): whisper.cpp in WebAssembly, on the device; audio never leaves it.
- [0057 The speech model is bundled](../decisions/0057-speech-model-bundled.md): the default model ships in the apps; the optional one downloads on request.
- [0061 The optional speech model's host](../decisions/0061-speech-model-host.md): GitHub Releases, the update host.
- [0060 Dictation in every field](../decisions/0060-dictation-in-every-field.md): dictation into any text field, not only Prompter requests, and not tied to the Prompter.
- [0021 Speech out](../decisions/0021-speech-out.md): browser speech synthesis with on-device voices only; captions always shown. It governs narration (section 3).
- [0068 Bundled voices](../decisions/0068-bundled-voices.md): speak line uses an open-source engine bundled with StoryStage, on every platform (section 4).
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
- **Its threads load whisper's script, not the worker's.** The build adds `mainScriptUrlOrBlob` to Emscripten's own list of module settings (`INCOMING_MODULE_JS_API`), and the worker sets it. The rest of the list stays as Emscripten has it: a shorter list hung whisper's threads in CI.
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
- **From where.** From GitHub Releases: the `speech-models-v1` release on `storystage/storystage2` (decision 0061). That is the host already named for updates (decision 0047), so no new third party sees a device. The `Speech models` workflow publishes the file there from whisper.cpp's repository after checking it against its pin, and the native layer pins the address (spec 05, section 5.3).
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
- `options` holds the microphone, the recogniser (whisper in its worker), the learner's model choice, a clock, and what tells it the window lost focus, so tests pass fakes.
- **In the app, the studio calls `createBrowserDictation(host.speech, { whisperScript, model })`**, which gives the browser's microphone (an `AudioWorklet`, `mic-worklet.js`), the whisper worker and the page's focus. `whisperScript` is the address of `whisper.js`, which the app serves itself: it is built from pinned sources by `scripts/build-whisper.sh`, with section 1.2's memory settings, and kept with its SHA-256 by the `speech` workflow for the apps to bundle (S8, section 7). It returns `null` where there is no speech or no microphone.
- **A take can stop listening by itself:** at 30 seconds, or when the window loses focus or the page is hidden. `state` then goes from `listening` to `working`, and the studio calls `stop` to collect the words, as after a tap. A new `start` drops words nobody collected.

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

**Speak line** is the block that makes a character say a line of the script out loud, with a caption, as in a film. `say` and `think` show a bubble and make no sound; speak line makes a sound and shows a caption instead of a bubble. The block is `Model.speakLine` in the Story API (spec 02, section 7), on the Actions tab beside `say` and `think`.

Status: proposed by S1, 8 Nov 2026. The voices come from a speech engine bundled with StoryStage (decision 0068), chosen by a spike (`docs/spikes/tts-engines.md`); the numbers marked *to measure* come from it.

### 4.1 The line

- The block's argument is the **words** (`text: Text`), so both editors show what is said, and a learner can type or dictate them like any other text.
- When the block is made from a script line (dragged from the script pane, or built by the Prompter from a pinned line), it also carries the line's id, `line: LineId` (`03-production-format.md`), as a detail the learner doesn't edit. Its words are copied from the line when it's made.
- **If the script line changes later,** the block keeps its words. The automatic check (11.6) then reports "Line 2.3 has changed since this block was made", with **Use the new words** and **Keep these**. The script stays the learner's to write (rule 4), and code never changes behind their back.
- A block without a line id is allowed: it's dialogue the script doesn't have. The check says so ("The owl says words that aren't in the script"), as advice, not an error.

### 4.2 How long it takes

Rehearse and export must take exactly the same time (6.5), but how long a voice takes to say something isn't known in advance and differs by device. So the length comes from the words, not from the voice:

- **Duration** = 0.4 s + 0.4 s for each word, at least 1.5 s, rounded up to the next 0.1 s. That's 150 words a minute, a calm speaking pace for children's listening. The `duration` detail, as on `say`, overrides it.
- **The rule lives in the Story API**, as `lineDuration(text)` in `@storystage/story-api`, because it is part of what the block means, like any block's default duration. The Story API's `speakLine` procedure uses it to time the block; the speech package imports it to prepare each line's sound (section 4.6). The Story API depends on nothing but `ast`, so it can't import speech; speech may import the Story API (decided by S1 and S6, 10 Nov 2026).
- The block takes that long, and the program moves on after it, whatever the voice does. The caption shows for exactly that long.
- **The voice is fitted to the time.** The engine makes the line's sound first, so its length is known. If it is longer than the duration it is sped up, to 1.25× at most, keeping its pitch; anything still longer is faded out over 0.2 s at the end. Shorter lines are left as they are. Words a minute for each voice are *to measure* in the spike; if the voices run long, the 0.4 s a word changes, in one place.

### 4.3 Which voice

- Speak line's voices come from the **bundled engine** (decision 0068), not the device, so a production sounds the same on every device and in its exported film. Narration (section 3) still uses the device's voices (section 2.1). The text goes through the same sanitiser (section 2.2).
- **Each character keeps one voice for the whole production.** The production stores a voice for each cast member, keyed by the set-up object's name as written (`manifest.voices`, `{ preset, accent, base, pitch, formant, speed }`, production format 1.4.0). A character is its name: every set-up object with that name, in any scene, speaks with that voice, as the caption shows it ("FOX: …"). Renaming an object carries its voice to the new name in the same edit; if other scenes still have the old name, it keeps its voice too, and a new name that already has a voice keeps its own. The type and its check are in `@storystage/production`, so the format never loads the engine; speech imports them. When the file opens, a voice that breaks the limits, names a voice StoryStage doesn't ship, or has a name no scene's set-up object has is dropped, and that character takes its class's preset again.
- **Presets** for Settings › Cast: Woman, Man, Girl, Boy, and animal sizes (small, middle-sized, big). A preset is one of the engine's voices, with pitch, formant (the size of the voice) and speed changed. The limits, 1 meaning unchanged: pitch and formant 0.7 to 1.5, speed 0.8 to 1.25. Spike 14.3's presets use 0.8 to 1.45, shifting pitch and formant together. Children's and animals' voices are made this way from adult voices: no openly licensed children's voice model exists (`docs/spikes/tts-engines.md`, section 4).
- By default each cast member gets a preset from its Backstage class, with people alternating woman and man, and no two characters with the same voice while the engine has voices to spare. The learner can change it, and play a sample line.
- The engine and its voices are part of StoryStage, so a production sounds the same wherever it's opened.
- **Accent** (owner, 10 Nov 2026): **British English by default**, with **American English** as an option, switched in Settings › Voices.
  - The accent decides which of Kokoro's voices the presets use: British (`bf_…`, `bm_…`) or American (`af_…`, `am_…`).
  - It also decides the pronunciations: British by our rules, the RP list and the hand list (`docs/spikes/tts-engines.md`, section 6), or American from the CMU dictionary as it is.
  - The production stores its accent with its cast's voices (`voice.accent`, `03-production-format.md`), so a film sounds the same on every device.
  - The switch sets the accent for new productions. It can also change the one that's open: every character keeps its preset, takes that preset's voice in the other accent, and every line's sound is prepared again (section 4.6).

### 4.4 Captions

- While the line is spoken, its words show as a **caption**: a film subtitle at the bottom of the frame, with the speaker's name ("OWL: Here is the key."). It is not a bubble on the character.
- Captions show whether or not a voice exists, the sound is on, or the device can speak (rule 7, section 2.3).
- They are part of the scene's state, like bubbles. So the automatic check (11.6) sees "Line 2.3 was spoken", scrubbing the timeline shows them, and the export's captions file (11.4: WebVTT and SRT) is written from them.

### 4.5 In Rehearse

- The voice starts when the block starts, and stops on **Stop**, on pause, and when the learner leaves the Production stage.
- Scrubbing or seeking shows captions without sound. Playing on from the middle of a line speaks nothing until the next line starts.
- One line sounds at a time. A new speak line cuts the one before it, as two people talking over each other would be unreadable as captions.

### 4.6 The engine (decision 0068)

The browser's own speech synthesis can't be recorded into a film, and its voices differ by device. So speak line uses an **open-source speech engine bundled with StoryStage**, the same on every platform, the browser version included (decision 0068). It runs in WebAssembly in a worker, on the device, and sends nothing anywhere.

- **Licence:** the engine, its pronunciation component and every voice pass rule 8. Most open engines take their pronunciation from eSpeak NG (GPL-3), so the engine must use a GPL-free one, such as the CMU Pronouncing Dictionary (BSD) with letter-to-sound rules and a British override list. Every voice's licence and credit goes in `NOTICE` and the film's credits (11.4).
- **Size and memory:** *to measure*. The candidates are 75–95 MB. The apps bundle it; the browser version downloads it once, on first use of speak line, with consent and a progress bar, like the optional speech model (section 1.4). It is unloaded when not in use, so it never sits in memory beside whisper on a 4 GB Chromebook.
- **Speed:** *to measure*. Each line's sound is made **as the code changes**, in the background, and kept with the production's cache (not in the saved file). So Rehearse plays lines without waiting, and export uses the same sound. A line not ready yet shows its caption and stays silent rather than holding up Rehearse.
- **Export** mixes each line's sound into the soundtrack at its start time (spec 08), so films keep their voices.
- **Which engine:** the spike measures Kokoro-82M and Piper's British multi-speaker voice, each with a GPL-free phonemiser. It checks licence, size, memory, speed, and intelligibility (whisper's word error rate on the spoken lines). Then the owner chooses.

### 4.7 How it runs

No new mechanism: a speak line is a `say` command with a caption instead of a bubble.

- **Story API** (S6): `speakLine` runs as `command:say`, not `needs:speech`, and its details are `duration` and `line`. `lineDuration(text)` (section 4.2) is exported from `@storystage/story-api`, and the procedure uses it when the block has no `duration`.
- **Stage contract** (S3): `say` gains `bubble: 'caption'` beside `'say'` and `'think'`, and an optional `line: LineId`; `Speech` carries both. The stage draws no bubble for a caption. The studio's frame overlay draws it, as the camera-frame overlay is drawn (Direction A, screen 02). The scene-state hash includes it, as it does bubbles.
- **Runtime** (S2): nothing new. The duration is worked out in the Story API's procedure, like every other block's.
- **Studio** (S5): during Rehearse it watches the stage's speech for objects whose bubble is `caption`. When one starts, it plays that line's prepared sound (section 4.6) and draws the caption.
- **Speech** (S7's package; S1 adds the code for 14.3): the line cache built from the program's `speakLine` blocks, each timed by its `duration` detail or by the Story API's `lineDuration` (the stage's `Speech` carries no duration), `castVoices(cast)` (section 4.3), the engine in a worker with its line cache (section 4.6), and a `LinePlayer` that plays a line's sound fitted to its duration and stops on cue. It is tested with a fake engine and clock.
- **Export** (S2, WP11): captions from the stage's speech timeline, and each line's sound from the cache, mixed in at its start time.
- **Apps** (S8): the engine's files bundled in each app and served from the app itself, checked like the speech model (section 1.4).

### 4.8 Not in the first release

Recording the learner's own voice for a line, and lip sync driving the mouth (14.4).

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
| A speak line's duration from its words, and the `duration` detail (4.2) | Unit | `packages/story-api` (`lineDuration`, the procedure); `packages/speech` (the cache uses the same time) |
| The sound fitted to the duration, faded at the end, cut by the next line and by Stop (4.2, 4.5) | Unit, fake engine and clock | `packages/speech` |
| Presets given to the cast by class, no two characters alike while voices remain; switching the accent keeps each character's preset (4.3) | Unit | `packages/speech` |
| A line's sound made when its code changes, reused by Rehearse and export, silent with a caption while not ready (4.6) | Unit, fake engine | `packages/speech` |
| Every spoken test line understood: whisper's word error rate on the engine's output (4.6) | End-to-end in CI | the spike, then `packages/speech` |
| A speak line is the same in Rehearse and export: same duration, same captions, same scene-state hash (4.2, 4.4) | Unit (fixed step) | `packages/stage`, `packages/runtime` |
| The captions file has every speak line, at its time, with the speaker's name (4.4) | Unit | `packages/export` (S2) |
| No network traffic but the download (WP14 done-when) | Device run, with the network watched | M1 script (S1) |
| Memory and speed on the reference devices (1.9) | Device run | M1 script (S1) |

## 6. Differences from StoryStage 1 spec 03

| Area | StoryStage 1 | StoryStage 2 | Why |
|---|---|---|---|
| Speech in | Prompter requests only | Dictation into every text field, with or without the Prompter | Decision 0060 |
| Engine | whisper-jni in Java | whisper.cpp in WebAssembly, in a worker | No Java; decision 0020 |
| Models | Multilingual tiny (default) and base | English tiny, quantised by default; full tiny optional; no base | Memory on 4 GB devices (spike 1.3) |
| Getting the model | Downloaded from Hugging Face | Default bundled in the app (0057); the optional one from the update host, GitHub Releases (0061). Both checked by the native layer, pinned | Works offline from the first launch; the webview loads no remote content |
| Capture | Java sound, 16 kHz | `AudioWorklet` at the device's rate, resampled to 16 kHz | Browsers choose the rate |
| Starting and stopping | Hold to talk, or Ctrl+Space | Tap to start, tap to stop; Enter or Space on the focused mic; Esc cancels | Holding is hard for some children; Ctrl+Space switches input languages on some systems |
| Where the words go | Into the Prompter's box | Given back to the studio, which puts them in the field as one undo step | The field and its history stay the studio's |
| Worker life | Model loaded once | Worker ended after 30 seconds idle | Gives memory back on 4 GB devices |
| Browser version | n/a | No speech in | 15.6 |
| Speech out | PowerShell, `say`, `spd-say`, Flite | Browser speech synthesis, on-device voices only | No processes; decision 0021 |
| Narration queue | Carried over | The same, plus a new request clears the old one | |
| Speak line | None | A block that speaks a script line with a caption, for a time worked out from its words; one voice per character (section 4) | 14.3 |

## 7. Open points for other sessions

| Needs | From | For |
|---|---|---|
| COOP and COEP headers in the Tauri apps: done on Windows (#155) | S8 (WP15) | Section 1.1 |
| The `speech.dictation` policy key, with `host.speech` following it (#152), in spec 05 and workplan 15.3 | S8 (WP15) | Section 1.1 |
| The bundled model in the app's resources, the optional download, the check on every load, and their rows in the threat model (spec 15) | S8 (WP15) | Section 1.4 |
| Running the `Speech models` workflow once, before the first build that offers the optional model (decision 0061) | Owner | Section 1.4 |
| The mic button beside every field (`TextField`'s `speech`), inserting the words as one undo step, and the Talk to type and model Settings. Done for the Storyboard's fields and Talk to type (S5, 10 Nov); the model choice and the Prompter's input are still to come. The studio asks for `whisper.js` at `<base>/speech/whisper.js` | S5 (WP12) | Sections 1.5, 1.7, 1.11 |
| Bundling `whisper.js` (the `speech` workflow's `whisper-wasm` artifact, with its SHA-256) in the Tauri apps, served from the app itself so the content security policy needs nothing new | S8 (WP15) | Section 1.11 |
| The model weights' licence confirmed for shipping (MIT), in `NOTICE` | D (WP17) | Section 1.3 |
| The device runs in section 1.9 added to the M1 script | S1 (WP18) | Section 1.9 |
| Speech in the DPIA: on-device only, the one download | D (WP17.3) | Sections 1.4, 1.6 |
| `speakLine` runs as `command:say`, with the `line` detail | S6 (WP4) | Section 4.7 |
| `say`'s `bubble: 'caption'` and `line`, in the stage contract and `Speech`; no bubble drawn for a caption | S3 (WP4.4, contract PR) | Section 4.7 |
| A `voice` for each cast member in the production format, with its accent | S4 (WP8) | Section 4.3 |
| Captions drawn over the scene view, the voice played during Rehearse, Settings › Cast's voices, and the accent switch in Settings › Voices | S5 (WP7) | Sections 4.3–4.5 |
| Line changed, line never spoken, and words not in the script, in the automatic check | S2 (WP11.6) | Section 4.1 |
| The captions file from the speech timeline, and each line's sound mixed into the soundtrack | S2 (WP11.4) | Sections 4.4, 4.6 |
| The speech engine's files bundled in the apps, served from the app and checked like the speech model | S8 (WP15) | Section 4.6 |
| Choosing the engine after the spike; the licence and provenance of its voices | Owner; D (WP17) | Section 4.6 |
| The engine spike: licence, size, memory, speed and word error rate (`docs/spikes/tts-engines.md`) | S1 | Sections 4.2, 4.6 |
