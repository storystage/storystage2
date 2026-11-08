# @storystage/production

The .storystage format, scenes, running order, transitions, storyboard data, links, Fountain import and export.

- **Owner:** S2 until 8.1 merges, then S4
- **Workplan:** WP8
- **Spec:** `docs/spec/03-production-format.md`
- **Status:** the format and data model (8.1); adding, deleting and moving scenes (`scenes.ts`, from 8.2, written by S5); renaming and duplicating scenes, and the production's undo session (`session.ts`, 8.2); the archive reader and writer (`archive.ts`, from 8.4), for `.storystage`, `.a3p` and model packs; Fountain reading and writing (`fountain.ts`, 10.4, written by S5); saving and opening the file (`file.ts`, `validate.ts`, 8.4); saving in a pupil's folder, Save a copy and Open (`saving.ts`, 8.4); Collect and Hand back (`collect.ts`, 8.4); playing a production, its transitions and go to scene (`playback.ts`, 8.3), and the player's controller (`player.ts`, 8.3). Loading only the active scene and preloading the next (8.2, with the stage) are still to come.

`exampleProduction` is a complete three-scene production with code in it, for tests in every lane. `checkReferences` checks a production; `sceneMethodCheck` is the `check` for an `EditSession`.
