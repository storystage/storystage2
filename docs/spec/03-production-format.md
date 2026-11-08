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
| `manifest.json` | Title, format version, running order, audio list, credit names. The first entry in the zip | `ProductionManifest` |
| `program.json` | All the code: one `Program` (`01-ast.md`) | `Program` |
| `scenes/<id>.json` | How one scene starts, and its script method | `Scene` |
| `storyboard.json` | Logline, synopsis, arc, scene cards | `Storyboard` |
| `script.fountain` | The script, in Fountain (section 5) | `ScriptLine[]` |
| `frames/<id>.json` | One storyboard frame and its links | `Frame` |
| `audio/` | Lines and narration the learner chose to record | Files named in the manifest |
| `models/<folder>/` | Each class-imported model the production uses (section 1.3) | `PackedModel`, named in the manifest |

**The same production gives the same bytes.** JSON is written with sorted keys (`serializeProgram` for the program, the same rule for the rest), entries go in the order above and then by name, and each entry has a fixed date. So a save with no changes is identical, and the round-trip test (WP8) can compare bytes. `saveProduction` and `openProduction` (`file.ts`) do this. **Reopening gives the same production,** except that `scenes` and `frames` come back in order of their ids: their order in memory carries no meaning (the running order and each frame's `order` do), and saving doesn't depend on it.

**File names from ids.** A scene or frame id, or a model's folder, becomes part of a path, so it must match `SAFE_ID` (lowercase letters, digits and hyphens, 1 to 32 characters, starting with a letter or digit). An audio file is a plain name in `audio/`. `checkReferences` refuses anything else.

**Reading a file** follows `15-security.md` section 3: one archive reader, in this package (`archive.ts`: `readArchive`, `writeArchive`, `readJson`), with its limits on sizes and names, and the whole file checked before anything loads (WP8.4). The reader parses the zip itself, so it refuses links and devices, encrypted, split and ZIP64 archives, and unknown packing methods; it unpacks only the entries the format names, counting bytes as they come; and it refuses the whole file on any problem, in plain words that never quote the file. `.a3p` files and model packs use the same reader. The writer gives the same bytes for the same entries: deflated at level 6 (or stored, when that is smaller), names in UTF-8, every entry dated 1 January 1980.

### 1.0 Opening a file

`openProduction` opens nothing until the whole file has passed, in this order:

1. **The archive reader** (`archive.ts`; `15-security.md`, sections 3.1 and 3.2), unpacking only the entries this section names. Anything else is ignored, and never written back.
2. **The manifest,** which must say `format: "storystage"` and give its version (section 1.2).
3. **Every part's shape** (`validate.ts`): the manifest, each scene, the storyboard and each frame, with every number finite and in range, and the retake notes and credit names within `TEXT_LIMITS` (200 characters a note, 40 a name, 40 names; spec 07, section 6.9). A scene or frame's `id` must match its file name. **In a file of this version, a part may hold only the fields its type names,** so nothing outside this spec (section 1.1) can ride through a save. A newer file, opened read-only, may hold fields this version doesn't know.
4. **The program,** with `openProgram` (`01-ast.md`, section 7).
5. **The script,** with `readFountain` and its limits (section 5).
6. **`checkReferences`,** and every audio and packed model file the manifest names.

It returns `ok`, `migrated` (with the `original` bytes to keep), `readOnly` (with the plain-words reason for the session), or `broken` (a plain-words message that never quotes the file, and problems for developers). `saveProduction` refuses a production that `checkReferences` faults, or whose audio or packed model files it isn't given, so a saved file always opens.

### 1.1 What is never stored

- API keys, or anything derived from them.
- Prompter conversations.
- Camera images.
- Microphone audio, other than lines the learner chose to record.
- Usage figures, logs and policy settings, which belong to the device or the class.

A production gets shared between pupils and schools, so anything in it should be treated as public. The learner's own words (the script, captions and names they typed) are the only personal content it should hold. That includes `manifest.credits.names` (format 1.1.0): the names learners chose to put in the end credits (WP11.4), in their own words, which may be first names, initials or nothing. Nothing fills them in from the class list.

### 1.2 Versions

`manifest.json` has `formatVersion` (`FORMAT_VERSION`, 1.1.0), for the zip and its JSON files. `program.json` has its own `schemaVersion`. Each moves on its own, under the promise in `01-ast.md` section 7:

- **Semantic versions.** A patch changes no meaning, a minor adds something an older reader can skip, a major changes something it can't.
- **Migrating keeps the original.** The original file stays beside the migrated one, unchanged, in the pupil's folder, until the learner deletes it (decision 0065: `openProduction` hands it back as `original`, and the first save keeps it with `PupilFolder.keepOriginal`).
- **An older app opens a newer file read-only,** with a plain message. It never writes back to that file.
- **Deprecated parts stay readable for two major versions.**
- **A changelog,** in `packages/production/CHANGELOG.md`.

A reader takes the older-is-migrated, newer-is-read-only decision on `formatVersion` first, then opens the program with `openProgram`. If either is newer, the whole production is read-only.

**Format migrations** (`FORMAT_MIGRATIONS`, `file.ts`) go one version at a time, each step keyed by the version it starts from. A migrated file is checked against the version it was migrated to, so its fields must all be ones that version names. An older version with no step to the next is refused in plain words. A minor version that only adds optional fields has a step that changes nothing but `formatVersion`: 1.0.0 to 1.1.0 is one.

### 1.3 Models

Decision [0049](../decisions/0049-models-in-the-production-file.md): a film looks right wherever it's opened.

- **Shipped models stay out.** A production names them by Backstage id, and every copy of StoryStage has them.
- **Every class-imported model the production uses is in the file:** in a set-up, on a scene card, or in a frame's sketches. `manifest.models` lists each as a `PackedModel`, whose `item` is its full Backstage record, so its licence, credit line, source, joints and budget all travel with it. `models/<folder>/` holds the files that record names: the model, its thumbnail and its sketches. Saving adds a model the production starts using, and drops one it stops using.
- **Opening doesn't add to Backstage.** A packed model belongs to that production. A teacher can promote it to the class, as with any import (WP3.11).
- **A packed model is an import.** It's checked as any import is (`15-security.md` section 3.4, F8, F9), in the import worker, before it reaches the stage.
- **The licence goes where the model goes.** Film credits still work (WP11.4), and non-commercial and "not sure" models still block the pathway exports and Export for distribution (WP3.12), on any device, because their record is in the file. A `.storystage` file can be passed on like any other file, so the app can't stop that; the credit and licence are what it can guarantee.
- **If a model can't be found,** because a shipped model is in a later catalogue than this copy, the object shows as a labelled outline, as a `StandIn` does (WP10.9). The code still runs and nothing is lost.

Models are the largest thing in the file. They're already reduced to the device budget on import (WP3.9), and the limits in `15-security.md` section 3.1 apply to the whole file. If a file is too big to save, WP8.4 says so in plain words.

### 1.4 Saving in a pupil's folder

Decision 0065: work lives in pupil folders in the app, and moves between devices as files. The folders and the system's file picker are the host's (`@storystage/host`, S8). This package can't depend on the host, so `saving.ts` says what it needs from them (`SaveFolder`, `CopyPicker`), and the host's `PupilFolder` and `FilePicker` fit those as they are.

A `ProductionSaver` holds one open production's saves:

1. **Backups are working sessions.** The host keeps five backups of each production. The first save after a production is opened keeps the version it replaces as a backup, and so does a save the learner asks for. Autosaves in between don't, so the five backups go back five sessions, not five minutes.
2. **A migrated production keeps its original,** with `keepOriginal`, before its first save (section 1.2).
3. **A read-only production is never written.** Saving it says, in plain words, to save a copy instead.
4. **Saves run one at a time.** Autosaves asked for while a save is running wait, and only the latest of them runs. A save the learner asks for always runs. Each caller gets its outcome.
5. **Problems come back in plain words,** never thrown: the host's codes (`full`, `locked`, `too_big` and so on), a read-only production, or a production `saveProduction` refuses.

**Open** reads from the pupil's folder (`openFromFolder`) or from a file the learner picks (`openFromPicker`). Either way the bytes go through `openProduction` (section 1.0): a picked file is untrusted (threat PS5). **Save a copy** (`saveCopy`) suggests a name made from the title that works on every system.

### 1.5 Collect and Hand back

At the end of a unit, the teacher **collects** every pupil's productions into a folder they pick, one folder per pupil, and later **hands back** marked work from the same layout (decision 0065; `collect.ts`). They read each pupil's folder with `ClassFolders.folder(id)`, which doesn't change the current pupil, so autosave keeps writing where it was.

1. **Names the teacher sees:** each pupil's folder is their name, made safe for every system (`plainName`, the host's `safeFileName` rules). Two pupils with the same name get "Sam" and "Sam (2)", in class-list order, ignoring case, so Hand back finds the same pupil again. Productions with the same title in one folder get "Pip" and "Pip (2)".
2. **Collect copies each production as saved,** byte for byte.
3. **Hand back checks every file** as any picked file is checked (`openProduction`, threat PS5). It writes each good one into its pupil's folder as a new production called "<title> (handed back)", so it never overwrites the pupil's own work. A file that fails, or whose folder names no pupil, is skipped, and the teacher sees why in plain words.

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

Each entry has a `Transition`, which says how that scene ends: `cut`, `fadeToBlack` or `crossfade`, with a `duration` ignored for a cut. The last scene's transition is ignored.

### 3.1 Playing a production

Agreed with S6 (the Story API) and S3 (the stage) on 8 Nov 2026 (WP8.3). `playback.ts` holds the rules below (`firstScene`, `nextScene`, `waitsForViewer`). The player (Storyboard play, the Screening room, the export) asks it what comes next.

1. **Play starts with the first scene in running order.** Each scene starts fresh, from its own set-up and fields. It's its own type, so nothing carries over from the scene before.
2. **A scene ends on its own** when its script method has finished and its last stage command has ended, unless it **waits on the viewer**, with a listener for `clickOnScreen`, `clickOnObject`, `keyPress` or `arrowKeyPress` (`VIEWER_EVENTS`).
    - A scene that waits ends only at `goToScene`, `crossfade` or `fadeToBlack`, or when play is stopped.
    - Other listeners (timers, collisions, proximity, view) don't keep a scene going, and they stop when it ends.
3. **When a scene ends on its own,** the next scene in running order plays, and the ended scene's transition leads into it. After the last scene, the film ends.
4. **`goToScene(scene)`** ends this scene at once. No more of its code runs, including blocks running alongside it in a do together. Its transition leads into `scene`, and play carries on in running order from there.
5. **`crossfade(scene; duration)`** does the same, with a crossfade over `duration` (the catalog's default, 1 second), whatever the running order says.
6. **`fadeToBlack(; duration)`** fades to black and ends the scene, and the next scene in running order fades in. After the last scene, the film ends in black.
7. **How transitions look.** A transition's `duration` is the whole transition.
    - **Cut:** the next scene's first frame follows this scene's last frame.
    - **Fade to black:** the picture fades to black over the first half, then the next scene fades in over the second half. It uses the stage's `fade` command on the scene, so the export renders it frame by frame:
        - `to: 1` over the first half;
        - then, on the next scene, `to: 1` at time 0 with no duration, before its first frame;
        - then `to: 0` over the second half.
    - **Crossfade:** both scenes are on screen, the old one fading out over the new, for the whole duration. It's the stage's job (S3, `packages/stage`), with the next scene preloaded (WP8.2). On a slow device the old scene may be shown still rather than moving. An export always shows both scenes moving: it draws frame by frame at its own pace, at full size, whatever the device, so a film exports the same on a Chromebook as on a fast PC.
8. **Going back is allowed,** so a film might never end. Play stops after 200 scene starts (`SCENE_START_LIMIT`), or at the export's length cap, with a plain-words message.
9. **Rehearse** (one scene, from the code editor) doesn't jump. At `goToScene`, `crossfade` or `fadeToBlack` it ends and shows "Next: <the scene's heading>".
10. **A scene that isn't there:** a scene in code is text (spec 02, section 3a), so deleting a scene can leave a stale value. `checkProgram` flags it before play (`sceneExists`, S6). If play reaches it anyway, it stops with "There's no scene called …" (`noSuchScene`).
11. **The export** has no viewer, so a scene that waits on the viewer runs to the length cap. The Screening room says so in plain words before exporting (`waitsForViewer`).

**The runtime's part** (agreed with S2 on 8 Nov 2026; the messages are spec 18's, `packages/runtime/src/messages.ts`, `RUNTIME_PROTOCOL` 2):
- `load` carries the production's scene ids (`scenes`), so an unknown scene, a scene that isn't text, or a negative duration is a `bad_value` fault at the block, with the block highlighted.
- The three blocks run in the runtime, from the script method or any listener. Each flushes the commands so far, sends `{ type: 'sceneChange', at, ending }` at that scene time, and stops every strand at once. `ending` is the runtime's `RuntimeSceneEnding`, which is `SceneEnding` (`playback.ts`) without `finished`. No `finished` or `stopped` follows.
- **The player** passes the ending to `nextScene`. It also derives `{ kind: 'finished' }` itself, from the runtime's `finished` message (the script method has ended): unless the scene waits on the viewer (`waitsForViewer`), it waits for the last stage command to end, sends `stop`, and asks `nextScene`.
- The same worker takes a fresh `load` for the next scene, from scene time 0 with that scene's own seed. Going to the scene already playing restarts it.

### 3.2 The player

`ProductionPlayer` (`player.ts`) is the player's controller, agreed with S2 on 8 Nov 2026. It's a pure state machine: it has no worker, stage or clock of its own. The one-scene driver (S2, WP6.4) and the Screening room (WP11.1) tell it what happens, and do what it says.

- **In:**
  - `start()`;
  - every message from the runtime (`runtime()`);
  - the picture's scene time (`now()`): every frame live, and at each `advance` when fixed. It's the picture's time, not the worker's, which runs ahead by its lookahead, so a scene ends when the screen gets there;
  - the learner's Stop (`stop()`).
- **Out:** actions, in the order to do them:
  - `load`, which is self-contained: the scene, its script method, its set-up, its seed, the scene ids for the runtime, how it came in, and any commands to schedule before its first seek;
  - `stageCommands`, a fade on the scene that's ending;
  - `crossfade`: keep the old scene's picture playing, its timeline carrying on with the commands it already has, while the next one loads. Only one runtime runs;
  - `preload`, after each `load` in a production: the running order's next scene and its set-up, so the stage can fetch its models now (`Stage.preload`, S3). It's only a guess, because a goToScene can go elsewhere; the `load` that follows reuses whatever was fetched, and a failed preload is silent;
  - `stop`, for the worker;
  - `next`, Rehearse's "Next: <heading>";
  - `fault`, the scene start limit or a missing scene, in plain words;
  - `end`.
- **Rules:**
  - **Seeds:** each scene's seed is the run's seed plus its start number, so a rerun repeats (WP6.5).
  - **A runtime error** stops play; the driver shows the error with its block highlighted.
  - **The last command's end** is worked out from the `commands` the worker sends.
  - **The player's fade commands** take sequence numbers from 2^30 up, after anything the runtime sends at the same moment.

**WP8's done-when** ("plays through with each transition type") is `playthrough.test.ts`. A four-scene film plays through the real runtime (`serve`, fixed steps) with the stage's fake:
1. a goToScene and the cut it leads into;
2. a scene that ends on its own into a fade to black;
3. another into a crossfade;
4. a last scene that waits for a click, whose listener fades the film to black.

## 4. Storyboard

`storyboard.json` holds the logline and synopsis (required before scenes can be added, WP10.1), the arc (a template and its part names, WP10.2) and one card per scene, with the same id as the scene. `SceneCard.heading` is what 10.8 means by the scene's heading. `SceneCard.retakeNotes` (format 1.1.0, optional) is the learner's notes for retakes of that scene, written in the Screening room (WP11.2).

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
- **Action** is a paragraph. **Dialogue** is the character's name, then the line: in capitals, or forced with `@` to keep its case (`@Pip`), so a name reopens exactly as it was typed.
- **`line:`** is the `LineId`, **`frame:`** the frame it's pinned to, if any.
- **The title page** is written for other tools. The title, logline and synopsis read back from `manifest.json` and `storyboard.json`, and these lines are ignored on reading. A script's first lines are a title page only when the first key is one Fountain defines (Title, Credit, Author, Authors, Source, Draft date, Date, Contact, Copyright, Notes, Revision) or one this writes (Logline, Synopsis), so "Morning: the sun rises." stays action.
- **On reading,** only a note at the very end of a line, starting `scene:` or `line:`, is read as ids. Any other `[[...]]` is the learner's text. A line with no id (written in another tool) gets a new one.
- **Text that could be misread** is forced, so it reads back as it was written: an action line that another tool could take for a heading, a speaker, a transition or a note starts with `!` (forced action), and a speaker whose name could be misread, or isn't in capitals, starts with `@` (forced character).
- **A line with several lines in it** keeps its line breaks but not blank lines, which would end it in Fountain. The Storyboard and the Prompter store a line's text through `scriptLineText` (no blank lines, no spaces at the ends), so what is saved reopens exactly (section 1).
- **Scripts from other tools** are read too: `INT.` and `EXT.` headings, speakers in capitals with their brackets kept in the line, centred text and lyrics as action. Sections, synopses, transitions, the boneyard (when `/*` starts a block, the first line after a blank one; one that never closes is kept as text, so nothing after it is lost) and page breaks are left out. Lines before the first heading go under a scene with no heading yet. Every scene and line gets a new id unless its note gives a safe one (`SAFE_ID`) not used already; a pin is kept only if its frame id is safe, and the caller drops pins to frames its production doesn't have.
- **Limits** (`FOUNTAIN_LIMITS`, matching `07-ux.md` section 6.9): 512 KiB, 50 scenes, 2,000 lines, 500 characters a line, 80 a heading and 40 a speaker's name. A script over any of them isn't read at all, and `readFountain` says which limit it met.

`writeFountain`, `readFountain` and `scriptLineText` are in `fountain.ts` (WP10.4).

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
| Playing a production: the running order, each scene's transition, the end; go to scene, crossfade and fade to black; scenes that aren't there; the scene start limit; scenes that wait on the viewer (section 3.1) | `playback.test.ts` | Unit |
| The player: a self-contained load with its seed; endings judged on the picture's time; waiting on the viewer; fade out then in; crossfade; the end, in black; the start limit; missing scenes; Rehearse; errors and Stop; reruns repeat (section 3.2) | `player.test.ts` | Unit |
| WP8 done-when: a film plays through every transition, a goToScene and a scene that waits for a click, through the real runtime and the stage's fake (section 3.2) | `playthrough.test.ts` | Integration |
| Fountain reads and writes as section 5 says, including scripts from other tools and the limits | `fountain.test.ts` | Unit |
| A production saves and reopens identically, and saves to the same bytes again (section 1) | `file.test.ts`: the WP8 round-trip test | Unit |
| A newer file opens read-only; an older one is migrated with its original handed back (section 1.2) | `file.test.ts` | Unit |
| A read-only file is never written (section 1.2) | `saving.test.ts` | Unit |
| Collect and Hand back: one folder per pupil, names made safe and unique as the teacher sees them, files copied as saved; handed-back files checked and written as new productions, the rest skipped with reasons (section 1.5) | `collect.test.ts` | Unit |
| Saving in a pupil's folder: a key for a new production, backups on a session's first save and saves asked for, the original kept once, plain-words problems, one save at a time with waiting autosaves merged; opening from the folder and the picker through `openProduction`; a copy's name (section 1.4) | `saving.test.ts` | Unit |
| Nothing in section 1.1 reaches a file: a field the types don't name is refused (section 1.0) | `file.test.ts`, `validate.test.ts` | Unit |
| Opening checks the archive, every part's shape, the script's limits and the references before anything loads; unknown entries are ignored and never written back (section 1.0) | `file.test.ts`, `validate.test.ts` | Unit |
| Adding, deleting and moving a scene keep the production sound, and their inverses restore the program (section 2.1) | `scenes.test.ts` | Unit |
| One undo step covers the program and the set-up (section 2.1) | With WP8.2 | Unit |
