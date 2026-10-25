# Lane log

Each session keeps its own section current. Newest entries first. One line each.

## S1 Platform and quality
- Merged:
  - 22 Oct: platform upkeep: S1 sessions can push again (Claude GitHub App reinstalled for the organisation); CodeQL default setup saved without Python, which has had no source since WP0.10 and failed the `main` scan.
  - 22 Oct: **WP0.10, the one schedule file**: `tools/plan/schedule.yaml` holds every item, its estimate, basis and actual dates; `pnpm schedule` writes workplan 5a, a "Schedule items" line in each section 6 WP and the handover roster, and CI fails when they disagree. It replaces schedule.py, capsim.py and sessions.py with the same numbers.
  - 22 Oct: build halves of spikes **1.3 whisper in WebAssembly** (#43; CI: clear speech right, 644–758 MB of memory) and **1.7 the Android app** (#44; Babylon.js and Blockly run on an Android 14 emulator with 4 GB; the APK is a workflow artifact).
  - 22 Oct: **WP11a, the MP4 encoder module** (#41): `exportMp4` and `probeExport` in `@storystage/export` (H.264, AAC by default, progress, cancel, coded errors). **S2: WP11b's Screening room can build on it.**
  - 21 Oct: spike 1.2 build half, the character budget sweep (#40); the owner's decisions, Apache-2.0 licence (#37); WP18a self-test skeleton and M0, M1 scripts (#36); capacity probe (#23); classroom questions (#24); organisation settings (#38, #39).
  - 21 Oct: **the WP0.8 contracts** (#26, #27, #29–#33) and spikes **1.4, 1.5, 1.6 go; 1.8 go for video** (#25, #28, #35). Spike pages: https://storystage.github.io/storystage2/
  - 20 Oct: WP0.1–0.7 (#1, #2, #4, #5, #18, #21, #22).
- Blocked on:
  - Owner: the reference Chromebook (Acer Spin 314, N100, 4 GB, chosen) and iPad (#6) for the M1 device runs of 1.2, 1.4, 1.5 and 1.8, and the export audio choice (does the Chromebook encode AAC?).
  - S4: the Alice converter (WP3b) for the Alice half of spike 1.2.
- Next: spike 1.9 (AR) needs the devices; WP23a waits for WP5a (S3) and WP6 (S2); WP14b waits for S7. Until those land, S1 helps the M1 device runs and keeps CI healthy.

## S2 Language, runtime and Screening room
- Merged:
- Blocked on:
- Next:

## S3 Stage and Story API procedures
- Merged:
- Blocked on:
- Next:

## S4 Backstage and Productions
- Merged:
- Blocked on:
- Next:

## S5 Studio interface
- Merged:
  - 25 Oct: **WP12a, the light theme drawn (12.1, decision 0032)**: every screen in `sizes/` opens in the light theme with `?theme=light`; PNGs in `screenshots/light/`; the light token values tabled in the handoff README. Text and outlines checked against WCAG AA in both themes.
  - 25 Oct (#58): **WP12a, mock-ups at three sizes (12.1)**: the screens 12.1 names at laptop (1536 × 864) and iPad (1180 × 820) in `docs/design/direction-a/sizes/`, a new screen 02c (Code editor closed until the scene is storyboarded, 10.8), the handoff README reconciled with `docs/decisions/`, `docs/spec/07-ux.md` §1 (screen sizes), and decisions 0032 (light theme) and 0033 (narrow windows). 12.1 stays unticked until the owner approves it.
- Blocked on:
  - Owner: approving the mock-ups (12.1), which waits for the teacher interviews (16.7) and the first use cases (16.6); approving the light theme before any light-theme code (decision 0032).
- Next: WP12b, design system and components (12.2–12.5): `07-ux.md` §2–5 first, then tokens (both themes as values; only dark switched on until the light theme is approved) and the component library checked against screen 14.

## S6 Story API spec, Tile editor and Alice import
- Merged:
- Blocked on:
- Next:

## S7 Prompter and speech
- Merged:
- Blocked on:
- Next:

## S8 Apps, security and class set-up
- Merged:
- Blocked on:
- Next:

## D Documents
- Merged:
- Blocked on:
- Next:
