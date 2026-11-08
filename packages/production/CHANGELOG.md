# Production format changelog

The versions of the `.storystage` file (`formatVersion` in `manifest.json`), newest first. The promise behind them is in `docs/spec/03-production-format.md`, section 1.2. The program inside has its own versions: `packages/ast/CHANGELOG.md`.

## 1.1.0

What the Screening room keeps (WP11b, asked for by S2). Both fields are optional, so a 1.0.0 file opens, is migrated, and keeps its original (spec section 1.2).

- `storyboard.json`: `cards[].retakeNotes`, a learner's notes for retakes of a scene (WP11.2).
- `manifest.json`: `credits.names`, the names learners chose for the end credits (WP11.4).

A file with a note over 200 characters, a name over 40, or more than 40 names is refused (`TEXT_LIMITS`).

## 1.0.0

The first version.
