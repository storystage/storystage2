# 0068 Bundled voices for speak line

- **Status:** settled; the engine is chosen by a spike
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answer in the S1 session, on spec 06 section 4.6 (#240)

## Decision

Speak line (14.3) uses an **open-source speech engine bundled with StoryStage**, in the first release, on every platform: the Windows and macOS apps, the iPad, the Chromebook, and the browser version. Exported films keep the voices, not only the captions.

The voices should cover **adults and children, men and women, and animals**.

Before the engine is chosen, S1 runs a **licence and size check** and a spike (`docs/spikes/tts-engines.md`). The engine, its pronunciation component and every voice must pass the licence policy (`CLAUDE.md` rule 8): nothing GPL linked into the app, every voice's licence and credit recorded.

## What this changes

- Spec 06 section 4.6: option D, replacing options A to C.
- Decision 0021 (speech out: the browser's speech synthesis, on-device voices only) still governs narration (spec 06, section 3). Speak line uses the bundled engine, which also runs on the device, so no text leaves it.
- WP14b grows from one week to three (`tools/plan/schedule.yaml`, basis "bundled voices").
