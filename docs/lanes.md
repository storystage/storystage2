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
- In review (25 Oct, waiting for the owner under decision 0029):
  - **WP3.3 joint map** (#57): VRM 1.0 ids with H-Anim and Alice's words, Alice's animal joint sets as our extension, and `mapSkeleton` for Alice, VRM, Mixamo, Unreal/MakeHuman, Rigify and generic rigs. **S6: the Story API's joint names can build on `JOINT_MAP` in `@storystage/backstage`.**
  - **WP3.1 licence audit** (#60): `docs/legal/licence-audit.md`, with every source's licence and verdict, and Alice's gallery listed for CMU: 340 Alice models, and 95 that are Sims 2 art and never ship.
  - **WP10.5 sketch library tool** (#76): `@storystage/sketches` draws any Backstage model as a storyboard sketch on the CPU (four facings; walk, point and sit for characters), plus hand-made marks and backdrop sketches; `tools/make-sketches` runs it over a Backstage folder and writes the touch-up list. **S5: the Storyboard's sketch library can build on `makeItemSketches`, `MARKS` and `BACKDROP_SKETCHES`; spec 17 section 7 says how facing and flip work.** It runs on real models once WP3b ships them.
  - **WP3.2 Alice converter** (#78): a Java program over Alice 3.9's own exporter, plus a finishing step (face +Z, joint mapping, sizes). **S1: 16 converted Alice variants (Alice, White Rabbit, Pig, cat, Dalmatian, owl, chicken, clownfish, Nagi, biplane) are at `C:\dev\alice-out` on the owner's PC for spike 1.2: test only, not to be published until CMU replies.**
  - **WP3.7 CC0 sources**: `tools/backstage-sources` builds a Backstage folder from pinned source lists, keeping VRMs byte for byte. The new repository [storystage/backstage-assets](https://github.com/storystage/backstage-assets) holds the lists (nine KayKit characters, a mug, ten 100Avatars avatars) and a workflow that builds them in CI. **S3: VRM 0.x avatars face -Z; the stage's loader must turn them (spec 17, section 3).**
- Blocked on:
  - Owner: review and merge #57, #60, #76, #78 and the WP3.7 pull request, in that order (#60 is the audit sign-off); review the first assets build's sketches for representation; send the drafted letters to CMU (WP17.1) and Quaternius (`docs/legal/letters/`).
- Next: the MakeHuman people (3.5) in the assets repository's CI; Kenney, Poly Pizza and museum items for Props and Set (3.7).

## S5 Studio interface
- Merged:
- Blocked on:
- Next:

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
