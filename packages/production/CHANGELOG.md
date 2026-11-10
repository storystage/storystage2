# Production format changelog

The versions of the `.storystage` file (`formatVersion` in `manifest.json`), newest first. The promise behind them is in `docs/spec/03-production-format.md`, section 1.2. The program inside has its own versions: `packages/ast/CHANGELOG.md`.

## 1.3.0

A frame can keep its latest automatic check against the storyboard (S2, WP11c; spec 08 section 9.6). Optional, so an older file opens, is migrated, and keeps its original.

- On a frame: `check`, `{ basis, items, kept }` (`FrameCheck`, `CheckItem`, `CHECK_KINDS`, `CHECK_OUTCOMES`), within `CHECK_LIMITS`. Only a cached result: one that doesn't fit is dropped when the file opens, never refused.
- `ProductionSession.annotate` saves results outside the undo history; a frame's `kept` changes through the history as before.

## 1.2.0

A stand-in can carry its size (S6, for imported Alice worlds; spec 19). Optional, so a 1.1.0 or 1.0.0 file opens, is migrated, and keeps its original.

- Wherever a stand-in can be (a set-up's objects, a scene card's cast, a frame's sketches): `size`, its box in metres at scale 1 (`x`, `y`, `z`), each more than 0 and at most 1,000 (`STAND_IN_SIZE_MAX`). Only the set-up uses it: the stage draws the box from it.

## 1.1.0

What the Screening room keeps (WP11b, asked for by S2). Both fields are optional, so a 1.0.0 file opens, is migrated, and keeps its original (spec section 1.2).

- `storyboard.json`: `cards[].retakeNotes`, a learner's notes for retakes of a scene (WP11.2).
- `manifest.json`: `credits.names`, the names learners chose for the end credits (WP11.4).

A file with a note over 200 characters, a name over 40, or more than 40 names is refused (`TEXT_LIMITS`).

## 1.0.0

The first version.
