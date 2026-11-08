# @storystage/production

The .storystage format, scenes, running order, transitions, storyboard data, links, Fountain import and export.

- **Owner:** S2 until 8.1 merges, then S4
- **Workplan:** WP8
- **Spec:** `docs/spec/03-production-format.md`
- **Status:** the format and data model (8.1); adding, deleting and moving scenes (`scenes.ts`, from 8.2, written by S5); the archive reader and writer (`archive.ts`, from 8.4), for `.storystage`, `.a3p` and model packs. Saving and opening (8.4), the rest of 8.2 (duplicating scenes, loading only the active one) and the production's undo, and Fountain (10.4) are still to come.

`exampleProduction` is a complete three-scene production with code in it, for tests in every lane. `checkReferences` checks a production; `sceneMethodCheck` is the `check` for an `EditSession`.
