# 0057 The speech model is bundled

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answer in the S8 session, on spec 06 section 7 (#137)

## Decision

**The Tauri apps bundle the default speech model,** `ggml-tiny.en-q5_1.bin` (32 MB, SHA-256 `c77c5766f1cef09b6b7d47f21b546cbddd4157886b3b5d6d4f709e91e66c7c2b`), so speech input works offline from the first launch, with no download. This replaces "download on first use" in workplan 14.1 for the default model.

The optional, more accurate model, `ggml-tiny.en.bin` (78 MB, SHA-256 `921e4cf8686fdd993dcd081a5da5b6c365bfde1162e72b08d75ac75289920b1f`), is still downloaded on request. The native layer fetches it, checks it against its pinned hash and stores it. The webview never fetches it.

## What follows

- **Every install is about 32 MB bigger,** including on the reference 4 GB Chromebook.
- **Nothing new for the DPIA from the default model.** Only the optional download contacts StoryStage's website, and only when someone asks for it.
- **S7** updates spec 06 section 7 and workplan 14.1. **S8** writes the threat model rows (spec 15) and the native call that hands a checked model to the speech worker.
- The browser version has no speech input (15.6), so this concerns the Tauri apps only.
