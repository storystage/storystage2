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

**The same production gives the same bytes.** JSON is written with sorted keys (`serializeProgram` for the program, the same rule for the rest), entries go in the order above and then by name, and each entry has a fixed date. So a save with no changes is identical, and the round-trip test (WP8) can compare bytes.

**File names from ids.** A scene or frame id becomes part of a path, so it must match `SAFE_ID` (lowercase letters, digits and hyphens, 1 to 32 characters, starting with a letter or digit). An audio file is a plain name in `audio/`. `checkReferences` refuses anything else. The other limits, on path handling and on the size of files and entries, are import hardening (WP8.4), from the threat model (`15-security.md`).

**Models aren't in the file.** A production names Backstage models by id. Opened where a model isn't in Backstage, the object shows as a labelled outline, as a `StandIn` does (WP10.9), so the code still runs and nothing is lost.

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

So the production has its own session around `EditSession`, built in WP8.2:

- A **step** holds program edits and, for each scene it touched, that scene's `SceneSetup` before and after. Set-ups are immutable, so holding two is cheap.
- **Undo** runs the program's inverses and restores the "before" set-ups; redo the reverse.
- A step that only moves things on the stage has no program edits, and appears in the history like any other.
- **Renaming a scene object** is one step: a `rename` edit, and the set-up with that object's `id` changed, along with any `vehicle` pointing at it.

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
| Each rule `checkReferences` enforces (sections 1, 2, 3, 6, 7) | `types.test.ts`, one broken production per rule | Unit |
| A scene's script method can't be removed; other methods can | `types.test.ts`, through `EditSession` | Unit |
| Fountain reads and writes as section 5 says | With WP10.4 | Unit |
| A production saves and reopens identically (section 1) | With WP8.4: the WP8 round-trip test | Unit |
| A newer file opens read-only and is never written (section 1.2) | With WP8.4 | Unit |
| Nothing in section 1.1 reaches a file | With WP8.4 | Unit |
| One undo step covers the program and the set-up (section 2.1) | With WP8.2 | Unit |
