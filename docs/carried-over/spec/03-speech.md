> **StoryStage 2 note (WP0.7).** Copied unchanged from storystage/storystage@325c73d (17 Oct 2026). It is a reference, not a StoryStage 2 spec.
> Replaced by: docs/spec/06-speech.md. Owner: S7 (speak line and narration: S1, 14.3). Work package: WP14.
>
> What changes in StoryStage 2:
> - whisper.cpp runs as WebAssembly in a worker (`packages/speech`), not through whisper-jni. Capture uses the browser's audio APIs. WP1.3 measures the tiny model on the reference devices before the base model is offered.
> - Speech out uses browser speech synthesis, with only voices that run on the device; there are no PowerShell, `say` or `spd-say` processes. Captions are always shown.
> - The model is still downloaded once, after the learner agrees, with a pinned SHA-256. Audio still never leaves the device.
> - The narration queue, Stop, and the sanitiser carry over. Speak line and narration for characters are new (14.3).

---

# 03 Speech

Implements workplan WP1.6. Speech is optional and controlled by `VoiceInputState` and `SpokenStepsState` (spec 02).

## 1. Speech input (whisper.cpp)

| Item | Decision |
|---|---|
| Binding | `io.github.givimad:whisper-jni` 1.7.1 (Apache 2.0; whisper.cpp is MIT). The jar includes the Windows x64, macOS and Linux native libraries (confirmed; a CI test loads the Windows one) |
| Models | `ggml-tiny.bin` (about 75 MB, the default) and `ggml-base.bin` (about 142 MB, offered as "more accurate, slower"). Multilingual, so they match the IDE locale |
| Download | On first use only, after the learner agrees, from the whisper.cpp model repository on Hugging Face, with a pinned SHA-256 per file; progress bar; retry; stored under the models folder (spec 00, section 6) |
| Capture | `javax.sound.sampled.TargetDataLine`, 16 kHz, 16-bit, mono, opened only while **Hold to talk** (button or Ctrl+Space) is held; maximum 30 seconds |
| Transcription | Background executor; the model starts loading when the learner starts talking; language set from the IDE locale (`en` default); greedy decoding; result placed in the input box for editing. Nothing is sent until the learner presses **Send** (or says nothing more for 1.5 s, if "Send when I stop talking" is ticked; after TR1). Set `-Dstorystage.prompter.whisperModel=base` for the larger model until the choice is in the wizard |
| Privacy | Audio stays in memory and is discarded after transcription. The only network use is the model download |
| Failure | No microphone: "No microphone found." Model missing and the learner declines the download: voice input stays off |

## 2. Speech output

```java
interface Voice {
  boolean isAvailable();
  void speak(String text, Runnable onDone);   // returns immediately
  void stop();                                // stops current and queued speech
}
```

| Order | Provider | Platform | How |
|---|---|---|---|
| 1 | `WindowsVoice` | Windows | A long-lived PowerShell process running `System.Speech.Synthesis.SpeechSynthesizer`, which reads lines from stdin. Prefers an `en-GB` voice when the locale is English (UK); otherwise the voice for the IDE locale, else the system default |
| 1 | `MacVoice` | macOS | `say -v <voice>` per sentence |
| 1 | `LinuxVoice` | Linux | `spd-say -w` (speech-dispatcher); else `espeak-ng` |
| 2 | `FliteVoice` | any | `flite` executable when found on the PATH (TR1 doesn't bundle Flite) |
| 3 | `CaptionsOnly` | any | No audio; captions still shown |

The first available provider is chosen at start-up. Text is passed through a sanitiser: plain text only, at most 300 characters per utterance, no control characters, quotes escaped for the provider's input format.

## 3. Narration queue

- Each executed tool's `narration` is queued as the edit is applied, so speech follows the visible change. The caption appears immediately in the panel, highlighted while it is spoken.
- `explain` texts and the Prompter's final summary are spoken too, if **Spoken steps** is on.
- **Stop** (button or Esc in the panel) clears the queue and stops the voice, but does not undo anything.
- Speech never blocks tool execution. If the queue holds more than five items, older items are spoken in shortened form ("Step 3 done").
