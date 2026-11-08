# 03 Production format

- **Covers:** `.storystage` zip, scenes, running order, storyboard, script, frames, links
- **Work package:** WP8.1
- **Owner:** S2 (8.1), then S4
- **Status:** written for WP8.1. The data model is `packages/production/src/types.ts`. Saving and opening are WP8.4; reading and writing Fountain are WP10.4.

## 0. Decisions this spec relies on

- [0011 Project file](../decisions/0011-project-file.md): a zip holding the AST as JSON, the storyboard, the script, frame layouts and any learner audio.
- [0012 Storyboard](../decisions/0012-storyboard.md): a scene is storyboarded before its code can start.
- [0016 Script header](../decisions/0016-script-header.md): a logline and a synopsis open every script.
- [0005 API key](../decisions/0005-api-key.md), `CLAUDE.md` rules 1 and 3: what may never be stored.
- `01-ast.md`: the program, its versions and its undo.

## 1. `.storystage` zip

One file holds a whole production. Paths come from `ZIP_LAYOUT`.

| Path | What it is | Type |
|---|---|---|
| `manifest.json` | Title, format version, running order, audio list. The first entry in the zip | `ProductionManifest` |
| `program.json` | All the code: one `Program` (`01-ast.md`) | `Program` |
| `scenes/<id>.json` | How one scene starts, and its script method | `Scene` |
| `storyboard.json` | Logline, synopsis, arc, scene cards | `Storyboard` |
| `script.fountain` | The script, in Fountain (section 5) | `ScriptLine[]` |
| `frames/<id>.json` | One storyboard frame and its links | `Frame` |
| `audio/` | Lines and narration the learner chose to record | Files named in the manifest |
| `models/<folder>/` | Each class-imported model the production uses (section 1.3) | `PackedModel`, named in the manifest |

**The same production gives the same bytes.** JSON is written with sorted keys (`serializeProgram` for the program, the same rule for the rest), entries go in the order above and then by name, and each entry has a fixed date. So a save with no changes is identical, and the round-trip test (WP8) can compare bytes.

**File names from ids.** A scene or frame id, or a model's folder, becomes part of a path, so it must match `SAFE_ID` (lowercase letters, digits and hyphens, 1 to 32 characters, starting with a letter or digit). An audio file is a plain name in `audio/`. `checkReferences` refuses anything else.

**Reading a file** follows `15-security.md` section 3: one archive reader, in this package (`archive.ts`: `readArchive`, `writeArchive`, `readJson`), with its limits on sizes and names, and the whole file checked before anything loads (WP8.4). The reader parses the zip itself, so it refuses links and devices, encrypted, split and ZIP64 archives, and unknown packing methods; it unpacks only the entries the format names, counting bytes as they come; and it refuses the whole file on any problem, in plain words that never quote the file. `.a3p` files and model packs use the same reader. The writer gives the same bytes for the same entries: deflated at level 6 (or stored, when that is smaller), names in UTF-8, every entry dated 1 January 1980.

### 1.1 What is never stored

- API keys, or anything derived from them.
- Prompter conversations.
- Camera images.
- Microphone audio, other than lines the learner chose to record.
- Usage figures, logs and policy settings, which belong to the device or the class.

A production gets shared between pupils and schools, so anything in it should be treated as public. The learner's own words (the script, captions and names they typed) are the only personal content it should hold.

### 1.2 Versions

`manifest.json` has `formatVersion` (`FORMAT_VERSION`, 1.0.0), for the zip and its JSON files. `program.json` has its own `schemaVersion`. Each moves on its own, under the promise in `01-ast.md` section 7:

- **Semantic versions.** A patch changes no meaning, a minor adds something an older reader can skip, a major changes something it can't.
- **Migrating keeps the original.** The original file stays beside the migrated one, unchanged, until the learner deletes it (where it goes: WP24.2).
- **An older app opens a newer file read-only,** with a plain message. It never writes back to that file.
- **Deprecated parts stay readable for two major versions.**
- **A changelog,** in `packages/production/CHANGELOG.md`.

A reader takes the older-is-migrated, newer-is-read-only decision on `formatVersion` first, then opens the program with `openProgram`. If either is newer, the whole production is read-only.

### 1.3 Models

Decision [0049](../decisions/0049-models-in-the-production-file.md): a film looks right wherever it's opened.

- **Shipped models stay out.** A production names them by Backstage id, and every copy of StoryStage has them.
- **Every class-imported model the production uses is in the file:** in a set-up, on a scene card, or in a frame's sketches. `manifest.models` lists each as a `PackedModel`, whose `item` is its full Backstage record, so its licence, credit line, source, joints and budget all travel with it. `models/<folder>/` holds the files that record names: the model, its thumbnail and its sketches. Saving adds a model the production starts using, and drops one it stops using.
- **Opening doesn't add to Backstage.** A packed model belongs to that production. A teacher can promote it to the class, as with any import (WP3.11).
- **A packed model is an import.** It's checked as any import is (`15-security.md` section 3.4, F8, F9), in the import worker, before it reaches the stage.
- **The licence goes where the model goes.** Film credits still work (WP11.4), and non-commercial and "not sure" models still block the pathway exports and Export for distribution (WP3.12), on any device, because their record is in the file. A `.storystage` file can be passed on like any other file, so the app can't stop that; the credit and licence are what it can guarantee.
- **If a model can't be found,** because a shipped model is in a later catalogue than this copy, the object shows as a labelled outline, as a `StandIn` does (WP10.9). The code still runs and nothing is lost.

Models are the largest thing in the file. They're already reduced to the device budget on import (WP3.9), and the limits in `15-security.md` section 3.1 apply to the whole file. If a file is too big to save, WP8.4 says so in plain words.

## 2. Scenes

A scene is two things, kept in step:

- **`scenes/<id>.json`** says how it starts: backdrop, cast, camera, markers (`SceneSetup`).
- **In `program.json`** it is a `type` extending `Scene`, holding its objects as fields, its script method and its listeners. `Scene.method` points at the script method, which is how a scene finds its type.

**In step** means, and `checkReferences` confirms:

- each scene's method exists, in a type extending `Scene`, and no two scenes share a type;
- each object in the set-up has a field of that name with `initial: null`, and each such field has an object, except `camera`, whose start is in `SceneSetup.camera`;
- where the field's type is a Story API class, it is the object's `class`.

### 2.1 Undoing the program and the set-up together

Spec 01 leaves this here. Adding an object changes the program (a field) and the set-up. So do renaming one and deleting a scene. These must be one undo step, and moving an object on the stage has to be undoable too (WP7.3).

So the production has its own session, `ProductionSession` (`session.ts`, WP8.2), and every change goes through it, from code, the stage, the Storyboard or the Prompter:

- A **step** holds its program edits with the edits that undo them, and **the rest of the production before and after**: set-ups, cards, frames, lines and the running order. They are immutable, so holding two copies is cheap; they share everything that didn't change.
- **Undo** runs the program's inverses and restores the "before"; redo the reverse.
- **`apply`, `begin`, `commit`, `cancel`, `undo`, `redo`, `history` and `goTo` behave as `EditSession`'s do,** so the code editors' host uses the production session in its place. `step` takes a step from the scene functions below, and `change` takes a change to anything but the program, such as moving an object on the stage, which then appears in the history like any other. A group (`begin` to `commit`) can mix all three: a whole Prompter request is one undo step.
- **Renaming a scene object** is one step: a `rename` edit, and the set-up with that object's `id` changed, along with any `vehicle` pointing at it. A rename typed in the code editor does the same: the session renames the object in its scene's set-up in the same step. **Removing** the field takes the object out of the set-up, and whatever rode on it rides on the scene.
- **A scene's script method can't be removed** (`sceneMethodCheck`), and a production opened read-only refuses every change, with the reason.

**Adding, deleting and moving a scene** are `addScene`, `deleteScene` and `moveScene` (`scenes.ts`, written by S5 for the Storyboard). Each is one step across the type, the set-up, the card, the frames and lines, and the running order, and returns the program edits it made with their inverses, for the session to hold. A new scene is a type from `newSceneType` (`SceneN`, the first free name), an empty set-up and a card, with a scene id `sN`, the first free one; it waits for the logline and synopsis (WP10.1), and a production holds at most 50 scenes. Deleting unpins lines elsewhere that were pinned to its frames and keeps the learner's recordings, no longer tied to the scene; it is refused, in the AST's plain words, while other code still uses the scene's type. Moving changes only the running order.

**Renaming a scene** (`renameScene`) changes its card's heading, which the Storyboard, the script and the running order show; its type keeps its name. **Duplicating a scene** (`duplicateScene`) places a copy straight after it in the running order, with the same transition: a copy of its type (fields, methods and listeners with new ids, named `SceneN`), its set-up, its card with a new heading, and its frames and lines with new ids (`fN`, `lN`, the first free). The copied frames' links follow the copied blocks, and the copied lines stay pinned to the copied frames. Recordings aren't copied.

A scene's script method can't be removed by an edit: `sceneMethodCheck` is the `check` for `EditSession` that refuses it, in plain words (`01-ast.md` section 4.5). Deleting a scene takes its whole `type`, in the production's own step (WP8.2).

## 3. Running order

`manifest.runningOrder` is the one place that says what order the scenes play in. Every scene appears in it exactly once. The Storyboard shows cards in this order, whatever order `storyboard.cards` happens to be in; reordering cards reorders this list.

Each entry has a `Transition`, which says how that scene ends: `cut`, `fadeToBlack` or `crossfade`, with a `duration` ignored for a cut. The last scene's transition is ignored. **Go to scene** jumps to a scene and carries on from there in running order (WP8.3).

## 4. Storyboard

`storyboard.json` holds the logline and synopsis (required before scenes can be added, WP10.1), the arc (a template and its part names, WP10.2) and one card per scene, with the same id as the scene. `SceneCard.heading` is what 10.8 means by the scene's heading.

The Prompter never writes the logline, synopsis or script (`CLAUDE.md` rule 4). The format doesn't record who wrote what; that rule is kept by the tools the Prompter is given (WP13).

**Imported worlds.** `manifest.origin` is `alice` for an imported Alice world (WP9.3), which lets a teacher relax the storyboard rule for it (WP10.8). Otherwise it is `storystage`.

## 5. Script

`script.fountain` is the script as a plain Fountain file, so it opens in any Fountain tool. Fountain has no ids, so they go in Fountain's notes, `[[like this]]`, at the end of a line. Tools that don't know them ignore them.

```
Title: The Lost Penguin
Logline: A penguin lost in a forest finds an unlikely friend.
Synopsis: Pip drifts away from the ice and lands in a dark forest.

.Ice shelf, morning [[scene:s1]]

Pip slides to the edge of the ice. [[line:l1 frame:f1]]

PIP
Oh no, the ice is moving! [[line:l2]]
```

- **Scenes** are in running order, each under a forced heading (`.` then the card's heading), so a heading needn't start with INT or EXT. A scene with no lines still has its heading.
- **Action** is a paragraph. **Dialogue** is the character's name in capitals, then the line.
- **`line:`** is the `LineId`, **`frame:`** the frame it's pinned to, if any.
- **The title page** is written for other tools. The title, logline and synopsis read back from `manifest.json` and `storyboard.json`, and these lines are ignored on reading.
- **On reading,** only a note at the very end of a line, starting `scene:` or `line:`, is read as ids. Any other `[[...]]` is the learner's text. A line with no id (written in another tool) gets a new one.

Reading and writing this, with size limits, are WP10.4.

## 6. Frames

One file per frame, `frames/<id>.json`. `order` is the frame's place in its scene, from 0, with no two the same in one scene. `lengthSeconds` is the planned length, which the automatic check compares (WP11.6). Sketch positions are fractions of the frame from the top left, so a frame doesn't depend on the size it's drawn at. A sketch stands for a Backstage model or a `StandIn`; no outside drawing is ever stored (`CLAUDE.md` rule 5).

## 7. Links

`Frame.links` lists the blocks a frame is linked to, by node id. Since ids survive edits (`01-ast.md` section 3), a link survives moving and renaming. A link to a block that has been removed is **not** an error: the block may come back on undo, so the Storyboard shows the frame as not linked (WP10.8), and the link stays in the file. For the same reason `checkReferences` doesn't look at links.

A pinned script line must point at a frame that exists. A pin is the learner's own choice about the script, and nothing in the program can remove it.

## 8. Tests

| Rule | Test | Level |
|---|---|---|
| The example production is complete and valid, including its program | `types.test.ts` | Unit |
| Each rule `checkReferences` enforces (sections 1, 1.3, 2, 3, 6, 7) | `types.test.ts`, one broken production per rule | Unit |
| The archive reader refuses each case in `15-security.md` sections 3.1 and 3.2, counts bytes while unpacking whatever the zip declares, reads zips from other tools, and the writer gives the same bytes every time (section 1) | `archive.test.ts` | Unit |
| Saving packs exactly the imported models in use, and a packed model is checked as an import (section 1.3) | With WP8.4 | Unit |
| A scene's script method can't be removed; other methods can | `types.test.ts`, through `EditSession` | Unit |
| One undo step for program edits, scene steps and stage changes, alone or grouped; cancel; renaming or removing an object's field in code keeps its set-up in step; read-only; listeners; load (section 2.1) | `session.test.ts` | Unit |
| Renaming and duplicating a scene: the copy's type, set-up, card, place, new ids, links and pins (section 2.1) | `session.test.ts` | Unit |
| Fountain reads and writes as section 5 says | With WP10.4 | Unit |
| A production saves and reopens identically (section 1) | With WP8.4: the WP8 round-trip test | Unit |
| A newer file opens read-only and is never written (section 1.2) | With WP8.4 | Unit |
| Nothing in section 1.1 reaches a file | With WP8.4 | Unit |
| Adding, deleting and moving a scene keep the production sound, and their inverses restore the program (section 2.1) | `scenes.test.ts` | Unit |
| One undo step covers the program and the set-up (section 2.1) | With WP8.2 | Unit |
