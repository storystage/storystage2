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
| `sounds/` | Sound files the learner imported (section 1.7) | `SoundClip`, named in the manifest |
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

It returns `ok`, `migrated` (with the `original` bytes to keep), `readOnly` (with the plain-words reason for the session), or `broken` (a plain-words message that never quotes the file, and problems for developers). Some fields are only the learner's choices or a cache, so one that doesn't fit is **dropped rather than refused**, and the film opens without it: a voice (section 1.6), a pose's joints (section 2.2) and a frame's check (section 6). An opened production lists each drop in `dropped`, for developers and logs, in the same style as `problems`. `saveProduction` refuses a production that `checkReferences` faults, or whose audio or packed model files it isn't given, so a saved file always opens.

### 1.1 What is never stored

- API keys, or anything derived from them.
- Prompter conversations.
- Camera images.
- Microphone audio, other than lines the learner chose to record.
- Usage figures, logs and policy settings, which belong to the device or the class.

A production gets shared between pupils and schools, so anything in it should be treated as public. The learner's own words (the script, captions and names they typed) are the only personal content it should hold. That includes `manifest.credits.names` (format 1.1.0): the names learners chose to put in the end credits (WP11.4), in their own words, which may be first names, initials or nothing. Nothing fills them in from the class list.

### 1.2 Versions

`manifest.json` has `formatVersion` (`FORMAT_VERSION`, 1.10.0), for the zip and its JSON files. `program.json` has its own `schemaVersion`. Each moves on its own, under the promise in `01-ast.md` section 7:

- **Semantic versions.** A patch changes no meaning, a minor adds something an older reader can skip, a major changes something it can't.
- **Migrating keeps the original.** The original file stays beside the migrated one, unchanged, in the pupil's folder, until the learner deletes it (decision 0065: `openProduction` hands it back as `original`, and the first save keeps it with `PupilFolder.keepOriginal`).
- **An older app opens a newer file read-only,** with a plain message. It never writes back to that file.
- **Deprecated parts stay readable for two major versions.**
- **A changelog,** in `packages/production/CHANGELOG.md`.

A reader takes the older-is-migrated, newer-is-read-only decision on `formatVersion` first, then opens the program with `openProgram`. If either is newer, the whole production is read-only.

**Format migrations** (`FORMAT_MIGRATIONS`, `file.ts`) go one version at a time, each step keyed by the version it starts from. A migrated file is checked against the version it was migrated to, so its fields must all be ones that version names. An older version with no step to the next is refused in plain words. A step can change the manifest, each frame file before its shape is checked (`frame`), and the opened program, with the scenes beside it, before the references between them are checked (`program`). A minor version that only adds optional fields has a step that changes nothing but `formatVersion`: 1.0.0 to 1.1.0, 1.1.0 to 1.2.0, 1.2.0 to 1.3.0, 1.3.0 to 1.4.0, and 1.4.0 to 1.5.0, are five.

**What each version added** (newest first; the details are in the changelog):

- **1.11.0** (28 Nov 2026, the owner's choice of 28 Nov, with S2 and S5): **where an imported sound came from**, each `SoundClip`'s `licence`, `source` and `credit` (section 1.7). The migration gives each clip "not sure".
- **1.10.0** (23 Nov 2026, the owner's choice of 22 Nov, from S6's review of #642; with S6 and S7): **3D text is `TextModel` in code**, as `Text` is words (spec 02 section 1, rule 3). The first migration that changes the program: the field of each set-up object of class `Text` that was typed `Text`, and each class that extends `Text`, becomes `TextModel`; every other field, variable and input of type `Text` stays words. An input, variable or list typed `Text` that held 3D text (as the Alice importer made them before) stays words, and the program check shows where: it is the learner's own code, so the file isn't damaged (S6's note). A 1.10.0 file whose 3D text is words in code is damaged, and says so. Older builds call a migrated film damaged rather than opening it read-only, as they read `TextModel` as no class (the owner accepted this).
- **1.9.0** (21 Nov 2026, decision 0076, the owner's choices of 21 Nov, with S5 and S8): sound, imported clips in `sounds/` and `manifest.sounds`, the tracks' volumes `manifest.mix` (section 1.7), and each scene's music, `Scene.music` (section 2.3).
- **1.8.0** (21 Nov 2026, S7's ask, for spec 04 section 6.8, the owner's choice of 21 Nov): repeat steps, the `repeat` kind and `PlanStep.holds` (section 6). The first version whose migration changes something: every step of a plan kept before gains `holds` 0, in each frame's file.
- **1.7.0** (20 Nov 2026, S7's ask, for spec 04 section 6.6, Plan only): the steps code ticked off, `FramePlan.done` (section 6).
- **1.6.0** (17 Nov 2026, S5's ask, for spec 04 section 6.7): a frame's agreed plan, `Frame.plan` (section 6).
- **1.5.0** (15 Nov 2026, with S3's #424, for S5's Pose panel): a set-up object's pose, `SceneObjectSetup.joints` (section 2.2).
- **1.4.0** (with S1): the characters' speak-line voices, `manifest.voices` (section 1.6).
- **1.3.0** (with S2): a frame's saved check, `Frame.check` (section 6).
- **1.2.0** (with S6): a stand-in's size, `StandIn.size` (section 2).
- **1.1.0**: credit names and retake notes.
- **1.0.0**: the first version.

### 1.3 Models

Decision [0049](../decisions/0049-models-in-the-production-file.md): a film looks right wherever it's opened.

- **Shipped models stay out.** A production names them by Backstage id, and every copy of StoryStage has them.
- **Every class-imported model the production uses is in the file:** in a set-up, on a scene card, or in a frame's sketches. `manifest.models` lists each as a `PackedModel`, whose `item` is its full Backstage record, so its licence, credit line, source, joints and budget all travel with it. `models/<folder>/` holds the files that record names: the model, its thumbnail and its sketches. Saving adds a model the production starts using, and drops one it stops using: `packModels` (`@storystage/backstage-import`) does it before each save, from the class Backstage. A model already packed stays as it is, even on a device whose class Backstage doesn't have it. The folder is made from the id, safe as a file name (`packFolder`).
- **Opening doesn't add to Backstage.** A packed model belongs to that production. A teacher can promote it to the class, as with any import (WP3.11).
- **A packed model is an import.** It's checked as any import is (`15-security.md` section 3.4, F8, F9), in the import worker, before it reaches the stage: `checkFilmModels` (`@storystage/backstage-import`; `checkFilmInWorker` runs it in the worker, within the 60-second limit). Its record must be a valid import's, its model a `.glb` that passes the import's checks and fits its section's budget, its thumbnail a picture within the limits, and each sketch exactly what Backstage's sketch renderer writes (`isSafeSketch`: no scripts, links or entities). `filmBackstage` shows only the models that passed. The others show as stand-ins, with the reason in plain words.
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

#### 1.4.1 Sounds kept once

**Built:** the folder's side (S8's #701) and production's (S4: `packVersion`, `ProductionSaver`, `openFromFolder`, `readWholeFilm`, Collect and Hand back). **Still to come:** the studio's (S5: the backup restore through `openFromFolder`, and passing `soundNames` on to the saver). The owner's choice of 25 Nov 2026, after S8's storage findings; S4 leads, S8 has the folder's side, S5 the studio's; reviewed by S5 and S8. Before this, each save wrote the whole film and the folder kept `BACKUPS_KEPT` earlier versions (spec 05 section 6.3), so a film with 150 MB of imported sound took about 0.9 GB. Instead, **each imported sound is kept once in the film's own folder, and every version points at it.**

1. **A kept sound is named by its bytes:** `sound-<the first 32 hex digits of its SHA-256, lower case>.<type>`, where the type is one that decision 0076 imports: `mp3`, `wav` or `m4a` (`SOUND_TYPES`, section 1.7). An example is `sound-3f2a…c9.mp3`: 42 characters, a safe part (spec 05 section 6.1). Two clips with the same bytes are one file, and the same file imported again after an undo is the file already there. A kept file is only ever written again with the same bytes, because its name is its bytes.
2. **A version in the folder is the film without its sounds.** It is the `.storystage` that `saveProduction` gives, but with no `sounds/` entries, and one more entry, `kept-sounds.json`: `{ "version": 1, "sounds": { "<clip file>": "<kept name>" } }` for each clip in `manifest.sounds`. So an autosave packs and writes a few hundred kilobytes, not the sounds again. The limits are the whole film's: a save that `ARCHIVE_LIMITS` or `FILE_LIMIT` would refuse as a whole film is refused here too, so Save a copy always fits.
3. **A save writes only the sounds the folder doesn't have yet** (S5's question). The studio still keeps every imported sound's bytes in `FilmSounds` while the film is open, so Undo and Redo work across a save (07-ux section 7.7), and still hands them all to every save. `ProductionSaver` asks the folder once which kept files the production has, and passes bytes only for the ones missing.
   - **After each save it replaces its list with the one the write returns:** the kept files left after step 3, not just the ones it added (S5's review). Otherwise a sound that a save stopped using, and so deleted, would count as present when an Undo brings it back.
   - **If the folder still finds a use missing** (`not_found`), for example because another window saved the same film (the last write wins), the saver asks for the list again and retries once, with the bytes. Any other refusal of a kept file is a fault in StoryStage, never the learner's.
   - **Each sound is hashed once per open film** (S5's review). A clip's bytes never change for its file name while a film is open, because `FilmSounds` never gives an id twice. So the saver remembers each clip file's kept name, and an autosave doesn't hash up to 150 MB again. Opening has hashed them already, to check them (4), so `openFromFolder` gives their names (`soundNames`), and a saver made with them hashes only sounds imported since.
   - A sound no version uses any more is deleted by the save that stops listing it (spec 05 section 6.3, step 3), as a stray version file is.
4. **Opening from the folder puts the sounds back.** `openFromFolder` reads the version, reads each kept file it names, checks each file's SHA-256 against its name, and opens the whole film as section 1.0 does, with every check the same. A kept file that's missing or doesn't match makes that version damaged, in the same plain words. Only the folder deletes kept files, and never one a listed version uses, so that means something outside StoryStage changed the folder.
   - **A backup is opened the same way,** from its own list, by `openFromFolder`'s own option: `openFromFolder(folder, key, { backup: index })`, which gives the same result as for the current version. So the studio's restore keeps its words for a damaged or unavailable backup (S5's request). `read` and `readBackup` now give a version, not a whole film, so nothing may hand their bytes straight to `openProduction`. **S5:** the studio's backup restore (`apps/studio/src/App.tsx`, which calls `readBackup` itself) moves to that path. **S4:** so does `collect.ts`.
5. **Whole films leave the folder.** Save a copy, Collect (section 1.5) and the export each get the whole film: the version's entries with its sounds put back as `sounds/<clip file>`, and `kept-sounds.json` left out. These are the same bytes that `saveProduction` gives for the same production: a version keeps `kept-sounds.json` where the sounds' entries were. **Collect copies a damaged film as saved** (`readWholeFilm`): one whose kept sound is missing or doesn't match goes as its version, which opens as damaged anywhere, as in the folder, so Collect never leaves out what the folder has. A migrated film's original (1.2) is the whole film, its sounds put back. **Save a copy to another folder** writes one whole `.storystage`, which shares nothing and opens anywhere. A file someone picks is always checked as a whole film (threat PS5). If it holds `kept-sounds.json`, that entry is ignored as any unknown entry is, and its missing sounds make it damaged.
6. **Films never share sounds with each other.** Kept files are in the production's own folder (`pupils/<pupil id>/<key>/`). So a new production writes all its sounds once into its own folder, whether it's a first save or a Hand back. Hand back packs a film of this format version that way. One that's older or newer is written whole, as it was picked: opening migrates the older one and keeps its original, as for any film in the folder, and a version without `kept-sounds.json` is opened as a whole film. Removing, binning, restoring or moving a film (`moveDeviceFilms`) already takes the whole `<key>` folder, so its kept files go with it, and no other film's are touched.
7. **A crash is safe.** The version file is written first, then the kept files, each atomically, and both before `meta.json` (spec 05 section 6.3). A crash before `meta.json` is replaced leaves strays: the next save deletes them, or adds again any it needs, with the same bytes. A first save that crashes leaves a folder with no `meta.json`, which the folder clears once its version file is a minute old, kept files included. If the kept files came first, a crash could leave a folder of sounds alone, with no version file to date it by, which would never be cleared (S8's review). The original of a migrated production (section 1.2) is kept whole, as it was.
8. **Whole films don't change, so the format version doesn't either.** `kept-sounds.json` is only ever in a pupil's folder. A film saved as a copy opens in any build that reads its format. **Going back to an older build** on the same device is the risk:
   - It finds a new folder version's sounds missing, so the version is damaged there.
   - It also tidies: if it ever saves that production, for example opened from its original, its step 3 deletes every `sound-*` file. That damages the backups for newer builds too.
   - Nothing is installed yet, with no release and no updater key, so this risk only matters later. **The rollback drill (15.7) must cover it** (S8's review).
   - From the folder's contract change on, `meta.json` gains `"layout": 2`, and a build refuses (`unreadable`) to write a production whose layout it doesn't know. That protects the next layout change, not this one.

**What the folder needs** (`packages/host`, S8's `contract` change after this spec, reviewed by S4; then spec 05 sections 6.2 and 6.3):
- `PupilFolder.kept(key)`: the production's kept files, taken from `meta.json`, so every kept file a listed version uses. A stray left by a crash isn't listed.
- `PupilFolder.readKept(key, name)`: one kept file's bytes.
- **`WriteOptions.kept`: `{ uses, add }`.** `uses` gives the names this version points at, and `add` gives `{ name, bytes }` for those the folder lacks. The rules:
  - **The folder checks each add.** The name must match `^sound-[0-9a-f]{32}\.(mp3|wav|m4a)$`, the bytes' SHA-256 must match the name, and the bytes must be within `FILE_LIMIT` (`too_big`). Anything else is `invalid`, and nothing is written. So "a name is its bytes" holds in the one place that writes them (S8's review).
  - An add for a name a listed version already uses is skipped.
  - A use that's neither there nor added is `not_found`, so the saver can tell an out-of-date list (3) from a fault.
- **The write returns `kept: readonly string[]`,** the kept files left after step 3, also from `meta.json`, so the saver's list is always the folder's (S5's review).
- **`meta.json` lists each version's kept files:** `current` and each backup gain `"kept": [{ "file", "bytes" }]`. A missing `kept` means none, as in today's folders. Step 3 keeps every file a listed version uses.
- **`ProductionInfo.bytes` and `BackupInfo.bytes` are the whole film's size,** the version and its kept files, worked out from `meta.json`. So the lists show what Save a copy would write.
- **Tidying re-reads `meta.json`** and keeps what both its own and the latest list name. So a window that replaced `meta.json` between this save's steps 2 and 3 keeps its version and its sounds (S8's fix, which applies to version files already).
- **Nothing new for the native layer:** kept files are ordinary files under the same five commands and the same safe-part rule.

### 1.5 Collect and Hand back

At the end of a unit, the teacher **collects** every pupil's productions into a folder they pick, one folder per pupil, and later **hands back** marked work from the same layout (decision 0065; `collect.ts`). They read each pupil's folder with `ClassFolders.folder(id)`, which doesn't change the current pupil, so autosave keeps writing where it was.

1. **Names the teacher sees:** each pupil's folder is their name, made safe for every system (`plainName`, the host's `safeFileName` rules). Two pupils with the same name get "Sam" and "Sam (2)", in class-list order, ignoring case, so Hand back finds the same pupil again. Productions with the same title in one folder get "Pip" and "Pip (2)".
2. **Collect copies each production as saved,** byte for byte. Once sounds are kept once (section 1.4.1), Collect writes each as a whole film, with its sounds put back. These are the same bytes as a whole-film save of that version.
3. **Hand back checks every file** as any picked file is checked (`openProduction`, threat PS5). It writes each good one into its pupil's folder as a new production called "<title> (handed back)", so it never overwrites the pupil's own work. The title is shortened to make room, so the whole name fits the host's 80 characters (`fitName`); so is any title a save writes. A file that fails, or whose folder names no pupil, is skipped, and the teacher sees why in plain words.

### 1.6 Voices

Each character's speak-line voice (format 1.4.0; spec 06 section 4.3; agreed with S1, 11 Nov 2026) is in `manifest.voices`, by **the name of its set-up objects**: their field name in the scene's type, exactly as written. Every object of that name, in any scene, speaks with that voice, so "the fox" in scenes 1 and 3 is one character with one voice, as a learner thinks of it, and as the caption and script name it.

- **A voice** is `CastVoice` (`voices.ts`): a preset, one of Kokoro's voices that StoryStage ships (`BASE_VOICES`), a pitch and formant from 0.7 to 1.5 and a speed from 0.8 to 1.25 (`VOICE_LIMITS`), and its accent. The accent is stored with each voice, so a film sounds the same on every device; Settings › Voices sets it for new productions and can switch the open one (spec 06 section 4.3).
- **The type lives here**, and `@storystage/speech` imports it: speech depends on the host, which depends on the Prompter, which depends on this package. Speech makes the voices (`castVoices`, `voiceFor`, `switchAccent`).
- **Only learners' choices, so dropped rather than refused.** When the file opens, a voice that doesn't fit `checkCastVoice` (a base voice we don't ship included) or whose name no scene's set-up object has is dropped, and the film opens. More than 200 voices (`VOICES_MAX`) is a malformed field, and none are kept. A character whose voice is dropped falls back to its class's preset. A name whose object has no speak line yet keeps its voice.
- **A rename takes the voice with it,** in the same undo step (section 2.1). If an object of the old name is still in another scene, it keeps its voice too. If the new name already has a voice, that voice stays.

### 1.7 Sound

Sound in a film (format 1.9.0; decision 0076, the owner's choices of 21 Nov 2026; agreed with S5 for the Sound view and the trim dialog, and S8 for the file input). A film has three tracks, **Speech**, **Music** and **Sound FX**, each with its volume in `manifest.mix` (`SoundMix`, each from 0 to 1; `SOUND_MIX_DEFAULT`, 1, 0.7 and 0.9, when there's none). The export mixes them and lowers music under speech: that's the export's rule, with no setting. Speech and effects are placed by their blocks (speak lines, `playAudio`), so they stay with the action. Music is placed on a scene's timeline (section 2.3).

**A sound** is a clip the learner imported (`SoundClip` in `manifest.sounds`, its file in `sounds/`) or a sound from Backstage's shelf, named by its Backstage id (`SoundRef`; a shelf id has slashes, a clip id never does). A shelf sound isn't packed, as a shipped model isn't, and one the shelf doesn't have plays as silence.

**Importing a sound** (`importSound`, `sound.ts`) takes a file picked with a plain file input on every host (`SOUND_ACCEPT`; spec 05 section 6.5), never trusting it:
- **MP3, WAV or M4A** (`SOUND_TYPES`), which every host decodes. The type comes from the file's first bytes (`soundTypeOf`: RIFF/WAVE, an ID3 tag or an MPEG Layer III frame, an MP4 `ftyp` with an audio brand), whatever its name says.
- **The limits** (`SOUND_LIMITS`): 25 MB and 10 minutes a file, 150 MB of imported sound in a film. The size is checked before the file is read, and again as read. The device decodes it to measure its length; one it can't decode is refused.
- **Kept as picked, never encoded again.** The export decodes and mixes, so no host needs an encoder, and nothing is lost. The clip is `sounds/<id>.<type>`, with an id such as `sn1`, the learner's `label` (from the file's name, up to 60 characters), the file's `length` in seconds and its `bytes`.
- **Trimmed once, on import.** `trim: { start, end }` is the part the film uses, in seconds into the file, set in the trim dialog (07-ux, S5) and kept, so a trimmed clip can be used again. A long file trimmed short still carries the whole file (the owner's choice).
- Refusals are in plain words (`SOUND_REFUSALS`). `withSound` adds the clip, and `withoutSound` removes it with the music cues that play it.
- **Each change is one undo step** in the production's history: the studio passes these pure changes (`withSound`, `withoutSound`, `withSceneMusic`, `withMix`) to `ProductionSession.change` with the step's label ("Add sound Birdsong", "Move Birdsong to 4 s"), and a drag is one step between `begin` and `commit`. Undoing an import takes the clip out of the manifest; its bytes stay with the studio's files until the next save, which writes only the sounds the manifest names.
- **A sound that code plays isn't removed** (agreed with S5): the studio refuses, naming where it's played, as removing a used input is refused. How a `playAudio` block names a sound is the Story API's (S6), and the check that finds its uses follows it.

**Where an imported sound came from** (format 1.11.0; the owner's choice of 28 Nov 2026, on S2's question in reviewing spec 17 section 2b). A film can be shared outside the school, and an imported sound could be a commercial song, so an import asks its licence as a model's import does (spec 17, section 6):
- **The learner picks the licence** in the trim dialog (07-ux, S5), from the models' short list: CC0, CC BY 4.0 or 3.0, CC BY-SA, CC BY-NC, **I made it** (`own-work`: we made or recorded it), or **not sure**. `SoundClip` gains `licence` (a `Licence` from `@storystage/backstage`, never `permission`, `public-domain` or `VRM-PL-1.0`, which only shipped items have), `source` (`{ url }`: required for the CC licences, optional for "not sure", none for "I made it"; and for any CC BY licence, who made it. S5's review: a learner who isn't sure often has no page to give, and shouldn't be pushed to make one up. A model's import follows the same rule, spec 17 section 6, rule 2: the owner's choice of 28 Nov 2026) and `credit`, made from these by spec 17 section 6's rule 3 with the learner's `label` as the name. Each is in the same types as a model's, so `mayDistribute` and the credits code serve both.
- **A trimmed clip is changed:** a CC BY clip whose trim is shorter than its file, by more than 0.01 s at either end (`TRIM_UNCHANGED`, S2's review: a decoded length and the dialog's handles can differ by a hair), is credited with ", changed for StoryStage" (`creditFor`, spec 17 section 3a, rule 4). The file itself is never encoded again.
- **"Not sure" and CC BY-NC keep the film in school,** as such a model does (spec 17, section 6, rule 4): `mayDistribute` refuses Export for distribution and the pathway exports for each such sound the film **uses** (S2's review), decided before anything plays, as for models (`usedModels`): a clip a music cue in a running-order scene names, or a block or value names (S6's `soundUses`). So a clip in a branch the measured run never reached still counts. The credits list only what the export mixes. The refusal names each sound and where to fix it, such as "Birdsong's licence isn't set yet. Set where it came from in Sound, then export again." (S2, spec 08, section 7). Showing it in school is unchanged.
- **The end credits list each imported sound the film plays** (S2, spec 08, section 7), by the shelf's rules (spec 17, section 2b, rule 7): under **Music** if a music cue plays it, otherwise under **Sound effects**, marked "Imported" as a packed model is. "I made it" reads "<label>, made by our class", and a learner's name is never put in it.
- **Changing the licence** after import is one undo step (`withSoundLicence`, "Change where Birdsong came from"), as the clip's other fields are set once. **S5:** the Sound view reopens the licence step for an existing clip, since that's where the refusal sends the learner.
- **Opening an older file:** the 1.10.0 to 1.11.0 migration gives each clip `licence: 'not-sure'`, no `source`, and the credit "<label>, source not checked". So a film made before keeps playing and shows in school, and its maker sets the licence before Export for distribution. `checkReferences` checks that a clip's licence is one an import may have (`IMPORT_LICENCES`), that it has a credit line, and that its page is a web address, there for a CC licence. The credit isn't made again on opening, since a maker's name is only in it, as for a model.
- **As built** (`@storystage/production`): `importSound` gives a new clip "not sure" until the licence step says. `licensedSound(clip, answers)` gives it its licence from the step's answers (`LicenceAnswers`, as a model's import takes), with the credit made from its label and trim, so the Sound view gives it once the label is final: after the trim dialog's Add has made the label free in the film ("Rain 2" beside a Rain) and before `withSound` (S5's review). `SOUND_LICENCE_PROBLEMS` are the step's words. The rules are a model's import's, shared in `@storystage/backstage` (`captureLicence`).

**When the file opens,** each clip's file must be there, its size its `bytes`, and its type by its first bytes the one its name says; otherwise the file is damaged. Whether it decodes is the player's to find: one that doesn't plays as silence. `checkReferences` checks safe ids, one of each, the file named by its id and type, the trim within the file, and the limits.

## 2. Scenes

A scene is two things, kept in step:

- **`scenes/<id>.json`** says how it starts: backdrop, cast, camera, markers (`SceneSetup`).
- **In `program.json`** it is a `type` extending `Scene`, holding its objects as fields, its script method and its listeners. `Scene.method` points at the script method, which is how a scene finds its type.

**In step** means, and `checkReferences` confirms:

- each scene's method exists, in a type extending `Scene`, and no two scenes share a type;
- each object in the set-up has a field of that name with `initial: null`, and each such field has an object, except `camera`, whose start is in `SceneSetup.camera`;
- where the field's type is a Story API class, it is the object's `class`.

**Stand-ins** (WP10.9): an object, a card's cast member or a sketch can be a `StandIn` (`{ standIn }`) where Backstage has no model. Since format 1.2.0 a stand-in may carry `size` (S6, for imported Alice worlds): its box in metres at scale 1, each side more than 0 and at most 1,000 (`STAND_IN_SIZE_MAX`), standing on its origin as a model does. The stage draws a set-up's stand-in at that size; without it, the usual box.

### 2.1 Undoing the program and the set-up together

Spec 01 leaves this here. Adding an object changes the program (a field) and the set-up. So do renaming one and deleting a scene. These must be one undo step, and moving an object on the stage has to be undoable too (WP7.3).

So the production has its own session, `ProductionSession` (`session.ts`, WP8.2), and every change goes through it, from code, the stage, the Storyboard or the Prompter:

- A **step** holds its program edits with the edits that undo them, and **the rest of the production before and after**: set-ups, cards, frames, lines and the running order. They are immutable, so holding two copies is cheap; they share everything that didn't change.
- **Undo** runs the program's inverses and restores the "before"; redo the reverse.
- **`apply`, `begin`, `commit`, `cancel`, `undo`, `redo`, `history` and `goTo` behave as `EditSession`'s do,** so the code editors' host uses the production session in its place. `step` takes a step from the scene functions below, and `change` takes a change to anything but the program, such as moving an object on the stage, which then appears in the history like any other. A group (`begin` to `commit`) can mix all three: a whole Prompter request is one undo step.
- **Renaming a scene object** is one step: a `rename` edit, and the set-up with that object's `id` changed, along with any `vehicle` pointing at it. A rename typed in the code editor does the same: the session renames the object in its scene's set-up in the same step. **Removing** the field takes the object out of the set-up, and whatever rode on it rides on the scene.
- **A scene's script method can't be removed** (`sceneMethodCheck`), and a production opened read-only refuses every change, with the reason.
- **Renaming a scene object renames its voice too** (section 1.6), in the same step.
- **A frame's automatic check goes around the history** (`annotate`; spec 08 section 9.6). Running a check isn't the learner's change, so it's no undo step: `annotate` saves each frame's latest result (its `basis` and `items`) on the frame, and undo and redo keep it, laid over what they put back. That stays right because the result's `basis` says whether it still fits what's there. The flags kept are the learner's choice: keeping one is an ordinary `change`, and a new result keeps the frame's `kept`. `null` removes a frame's result, a frame that isn't there is skipped, and opening another production forgets them all. Listeners hear it with the source `check`.

**Adding, deleting and moving a scene** are `addScene`, `deleteScene` and `moveScene` (`scenes.ts`, written by S5 for the Storyboard). Each is one step across the type, the set-up, the card, the frames and lines, and the running order, and returns the program edits it made with their inverses, for the session to hold. A new scene is a type from `newSceneType` (`SceneN`, the first free name), an empty set-up and a card, with a scene id `sN`, the first free one; it waits for the logline and synopsis (WP10.1), and a production holds at most 50 scenes. Deleting unpins lines elsewhere that were pinned to its frames and keeps the learner's recordings, no longer tied to the scene; it is refused, in the AST's plain words, while other code still uses the scene's type. Moving changes only the running order.

**Renaming a scene** (`renameScene`) changes its card's heading, which the Storyboard, the script and the running order show; its type keeps its name. **Duplicating a scene** (`duplicateScene`) places a copy straight after it in the running order, with the same transition: a copy of its type (fields, methods and listeners with new ids, named `SceneN`), its set-up, its card with a new heading, and its frames and lines with new ids (`fN`, `lN`, the first free). The copied frames' links follow the copied blocks, and the copied lines stay pinned to the copied frames. Recordings aren't copied.

**Adding, removing and changing a scene's objects** (`objects.ts`; 07-ux section 7.2, for the Production stage, the shape S5 proposed on 12 Nov 2026) are steps of the same kind, for `session.step`:

- **`addObject`** adds a field of the object's Story API class to the scene's type (`owl: Flyer`, with no initial value, since how it starts is in the set-up) and an entry in its set-up with its model (a Backstage item or a stand-in) and transform, as one step ("Add owl"). The field can be of a learner's class instead (`Owl extends Flyer`, decision 0074), when one that comes down from the object's class is given, so an owl added after the class exists is of it; the set-up keeps the Story API class. A class as a type is `typeOfClass`'s (`@storystage/story-api`): 3D text's field is `TextModel` (`title: TextModel`), as `Text` is words (format 1.10.0). The field and the set-up must agree: the field's type, or the story type its class's `extends` reach (`storyAncestor`), must be the object's class, and a 3D text whose field is words is refused in its own words.
- **Its name** comes from the model's display name, made a field name the code can use and unique in that scene's type only (`objectName`: "Woolly mammoth skeleton" is `woollyMammothSkeleton`, a second owl `owl2`). So the same character in another scene can have the same name, and with it the same voice (section 1.6) and the same place in the automatic check.
- **`removeObject`** takes out the field and the entry; whatever rode on it rides on the scene. It is refused while code uses the object, and the refusal carries the blocks that do (`objectInUse`, with `uses`), so the studio can say where, as deleting a scene is refused.
- **`setObject`** changes how an object starts (its transform, opacity, paint or pose, section 2.2): the set-up only, so the program doesn't change ("Move owl"). `withObject` gives the production alone, for `session.change`.
- A scene holds at most 100 objects (`OBJECT_LIMIT`), a guard well above what the device budget lets a scene draw.

A scene's script method can't be removed by an edit: `sceneMethodCheck` is the `check` for `EditSession` that refuses it, in plain words (`01-ast.md` section 4.5). Deleting a scene takes its whole `type`, in the production's own step (WP8.2).

### 2.2 Poses

An object can start posed (format 1.5.0; 07-ux section 7.2, the Pose panel, S5; the field is S3's, #424, agreed with S4 on 15 Nov 2026). `SceneObjectSetup.joints` holds, by joint name, **each joint's turn from its rest pose, in the joint's own axes, as a unit quaternion** `{ x, y, z, w }`, as `transform.rotation` is stored. Joints only turn (decision 0051), and a joint left out stays at rest. Joint limits aren't in the file.

A pose is the learner's choice, so, like a voice (section 1.6), **what doesn't fit is dropped when the file opens, never the file** (`keptJoints`, `pose.ts`). Each drop is listed in `dropped` (section 1.0):

- **A name that isn't a well-formed joint id** (`isJointId`): camelCase letters and digits, starting with a lower-case letter, at most 64 characters (`JOINT_ID`), as the joint map names every joint, its skeletons' and the extras, and those it names from a model's Alice joints (`jointFromAlice`: `plumageCenterTip`; `17-backstage.md` section 2a). A name needn't be in the class's skeleton: a model may have joints of its own, and the Pose panel lists the model's. Object.prototype's member names (`constructor`, `toString`, `valueOf`, `hasOwnProperty` and the rest) are refused too, since code reading a pose by name would find Object's function; `__proto__` never fits the pattern.
- **Any pose on a class with no joints** (`skeletonOf` gives none: a prop, text), which drops it all.
- **More than 256 joints in one pose** (`POSE_JOINTS_MAX`): the rest are dropped, reported as one.
- **A turn that isn't an object of exactly four finite numbers `x`, `y`, `z` and `w`, within 1e-3 of unit length** (`POSE_TOLERANCE`; `isPoseTurn`). The stage refuses a turn further off and stops the scene loading, so nothing it would refuse gets through. One within it is kept as written, not normalised: the stage makes it exact when it loads.
- **`joints` that isn't a plain object,** which drops it all.
- **A declared stand-in's pose** (`model` is `{ standIn }`), which drops it all: there are no joints to turn.

A pose with nothing left is dropped too, so a file never holds `joints: {}`. **Names must be well-formed joint ids; whether the model has the joint is the stage's to judge:** it leaves out one it lacks, and the scene plays on, as it does for a missing model (section 1.3). Saving writes `joints` as given.

**Naming a joint the model lacks** (proposed by S4, 16 Nov 2026, for S3 and S2 to agree): only the stage knows the joints of the model it loaded, and the automatic check sees the film only through the stage. So the stage reports it with the rest of what it couldn't find: `missing()` gains `{ kind: 'joint', object, joint }`, one for each posed joint the loaded model lacks, after that object's model entry and never for an object shown as a stand-in (it has no joints to turn). The automatic check (`checkFilm`, S2's) adds a note for each, as it does for a missing model, for example "Owl has no joint called tailFan, so that part of its pose isn't shown." Nothing else changes: the scene still loads and plays, and the file keeps the pose, so it comes back on a copy whose model has the joint.

**`setObject`** (section 2.1) carries a pose as `joints`, the whole pose, which replaces the set-up's, in one undo step ("Pose owl"), as it carries a transform. `{}` puts every joint back at rest, and the field goes. A pose that opening the file would drop any of is refused in plain words and changes nothing, so a saved pose always comes back.

### 2.3 Music

Music on a scene's Sound view timeline (format 1.9.0; section 1.7; 07-ux, S5) is in `Scene.music`, a list of `MusicCue`s in start order (`withSceneMusic`), at most 20 a scene:
- `sound`, a `SoundRef`; `start`, seconds from the scene's start; `from` and `to`, the part it plays **in the trimmed clip's own time**: `from` 0 is the trim's start, and `0 ≤ from < to ≤ trim.end − trim.start`. A shelf sound plays whole, so its part is within `0` and its `length` (spec 17, section 2b), checked against the shelf.
- `fadeIn` and `fadeOut` in seconds; `loop`, playing `from` to `to` again until the scene ends or another cue takes over; `volume` from 0 to 1, on top of the music track's.
- **One cue at a time.** A later cue takes over from an earlier one with a crossfade of `MUSIC_CROSSFADE_SECONDS` (1 second in this version). The later cue starts where it was put, and the earlier one plays on under it for that second (or to its own end or its scene's, if sooner), the two on equal-power curves so they don't dip together (agreed by S2, S3 and S5, 27 Nov 2026). A plain fade is a straight ramp. A cue's fade out ends wherever it stops (its own end, its scene's end, the film's end, or a loop's stop), unless a crossfade takes it (the owner's choice, 27 Nov 2026), and a cue stopped at full loudness goes silent over 10 ms, so nothing clicks. `@storystage/sound` holds these rules: `heardMusic` for the Sound view's timeline, and `musicPlays` for Rehearse and the export, which gives each cue's start and end on the film's clock, the part of its file it plays and its loudness as points to ramp between, so a film sounds as the timeline draws it. **Live** (Rehearse, `LiveSounds`), a scene's length isn't known until it ends: its music fades out by its last whole run's length, and with no whole run a cue stops at the cut. A cue that carries on doesn't fade at its scene's end. At half or double speed, music and `playAudio` sounds keep pace with the picture, so their pitch changes (the owner's choice, 27 Nov 2026); speak lines start on time at their own pitch. Live music is lowered under voiced speak lines by `duckOf`, as the export lowers it (spec 08 section 4). The runtime gets to a line only a moment ahead of the picture (its lookahead, 0.1 s), too late to go down before it or to join it to the line before, so a scene's voiced lines from its last whole run of the code as it is now are taken at its start (`spoken`), as its fade out is. Then the music goes down before each line and stays down between lines less than a second apart. Each line is also given as it's known, from the `commands` event (`speech`), so a scene with no such run is still lowered, from as soon as each line is known, over 10 ms from where the music is. A line isn't spoken again after a pause, so it doesn't lower the music then.
- **Carrying on over a cut** (`carriesOn`, the owner's choice of 21 Nov 2026): the cue plays on into the next scenes until another cue starts, in whichever scene, and crossfades there. The next scenes are those played next: in Rehearse of one scene, a cue carried in from the running order starts where the earlier scenes' last whole runs (or their planned lengths) leave it. If no later cue starts, it plays to the film's end, or stops at its `to` if it doesn't loop.
- **A cue that starts past the scene's end is kept,** never refused: only a Rehearse run knows a scene's length, and the scene may grow. The Sound view shows it greyed.
- Duplicating a scene copies its music (section 2), and removing a sound removes the cues that play it.

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
11. **The export** has no viewer, so a scene that waits on the viewer ends 5 seconds after its last stage command ends, as if it had finished, and goes on with its transition (agreed with S2, 8 Nov 2026; spec 08, section 4). A stage command that comes later, from a timer or a collision, moves that moment on, and a block that ends the scene first still does. The export dialog says so in plain words before exporting (`waitsForViewer`). The player does it when given `viewerWait` (the export passes 5 seconds). The Screening room and Rehearse leave it unset, so there a scene that waits goes on waiting.

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

**A frame's check** (format 1.3.0, optional): the frame's latest automatic check against the storyboard and the flags the learner kept, `check: { basis, items, kept }` (`FrameCheck`; spec 08 section 9.6, S2's `@storystage/check`). Each item has an `id` (unique in the frame), a `kind` (`CHECK_KINDS`), an `outcome` (`passed`, `flag` or `note`), its `words`, and the `node`, `sketch` or `line` it's about, where one applies. Within `CHECK_LIMITS`: at most 200 items, words of at most 300 characters, ids of at most 200 characters, a `basis` of at most 128 and at most 200 kept ids.

It's only a cached result, so **a check that doesn't fit this shape is dropped** when the file opens, and the frame opens without it; the file isn't refused. What it names isn't checked against the film: a stale result may name a block, sketch or line since deleted, and `kept` may hold ids that match no flag. Whether it's stale is `@storystage/check`'s to judge, from `basis`; a stale result is kept and still shows. Its words come from a file, so they're data: the studio draws them as plain text, and the Prompter's `check_frame` never passes them as instructions.

**A frame's agreed plan** (format 1.6.0, optional; spec 04 section 6.7, agreed with S5 on 17 Nov 2026): the plan the learner agreed with the Prompter for this frame, `plan: { agreedAt, shown, agreed }` (`FramePlan`). `agreedAt` is when they pressed **Build these steps**, an ISO 8601 time in UTC; `shown` is the plan as the Prompter proposed it and `agreed` as the learner built it, so a teacher can see what the learner changed. Each step is a `PlanStep`, spec 04 section 6.2's twelve plain fields (`words`, `kind`, `actor`, `action`, `target`, `details`, `line`, `sketch`, `together`, `repeat`, `holds`, `why`); the type lives in `@storystage/production`, since the format keeps it, and the Prompter uses it. The studio writes it with `withFramePlan` in the same step as the build (one undo), and checks it first with `isFramePlan`. It's a record, so later edits to the blocks leave it as it was, and removing the frame removes it. **In Plan only** (format 1.7.0, optional; spec 04 section 6.6, agreed with S7 and S5 on 20 Nov 2026) the learner builds every block, and code ticks a step off when what they built matches it. Such a plan has `done`, the ticked steps by number from 1, ascending, each once, none past `agreed`; it follows the code, so undoing a block takes its tick back, and may be empty. Present, even empty, `done` marks a plan the learner built; a plan the Prompter built has none. `agreedAt` is then when code first ticked a step. The studio keeps it with `ProductionSession.keepPlans`, beside `annotate`, outside the history (the owner's choice of 20 Nov): keeping it is no step of the learner's, so Undo takes back the block they added, not an unseen keep, and undo and redo leave the plan where it is. A learner's own step that changes the frame's plan (agreeing a new one) takes over from it, and undo can take that back.

**Repeating several steps** (format 1.8.0; spec 04 section 6.8, agreed with S7 on 21 Nov 2026): a step of kind `repeat` holds the `holds` steps right after it, as a count block holds the blocks under it, and its `repeat` is how many times they run. Every other step has `holds` 0. The format checks only what keeps a plan readable: `holds` is a whole number from 0 to 49, above 0 only on a `repeat` step; a `repeat` step holds at least one step, all within its own list (`shown` or `agreed`), and repeats at least twice. What a repeat may hold (for now, only `do` steps that don't repeat on their own, and no repeat inside another) is the Prompter's plan check (spec 04 section 6.3), so those rules can change without a new format. **Opening an older file:** the 1.7.0 to 1.8.0 migration gives every step of a frame's plan `holds` 0 (a migration's `frame` step, run on each frame file before its shape is checked), and the original is kept as for any migration.

**Limits** (`PLAN_LIMITS`), generous because the learner edits the steps: 50 steps in each list; 300 characters in each text field but the details; 20 details, each name up to 64 characters and each value up to 300; `repeat` a whole number from 1 to 1,000 (from 2 on a `repeat` step); `holds` a whole number from 0 to 49. **A plan that doesn't fit is dropped whole** when the file opens, with a line in `dropped` (section 1.0), and the frame opens without it: half a plan would mislead the teacher reading it. The file isn't refused.

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
| Voices: `checkCastVoice`'s limits and base voices; kept through an open and a save; one that doesn't fit, or whose character is gone, dropped, not the file; over 200 drops the field; a rename carries its voice in the same undo step, keeping it where the old name remains (section 1.6) | `voices.test.ts` | Unit |
| A frame's check is kept through an open and a save, stale or not; one that doesn't fit its shape or limits is dropped, not the file; what it names isn't checked (section 6) | `file.test.ts` | Unit |
| Poses: a pose saved and reopened unchanged, a model's own joint beyond its skeleton (`plumageCenterTip`) included; every joint id the joint map gives fits `JOINT_ID`; a malformed name, Object's member names (`__proto__`, `constructor`, `toString`…), a turn more than 1e-3 off unit length or not four finite numbers, joints that aren't an object, a pose on a class with no joints, a declared stand-in's pose and joints past 256 each dropped and listed in `dropped`, not the file; a turn within 1e-3 kept as written; an empty pose left out; a 1.4.0 file still opens (section 2.2) | `pose.test.ts` | Unit |
| `setObject` with a pose: one undo step, `{}` back at rest, and a pose the file would drop refused (section 2.2) | `objects.test.ts` | Unit |
| `annotate`: no undo step, kept through undo and redo, the frame's `kept` left to the history, `null` and missing frames, forgotten on load, refused read-only (section 2.1) | `session.test.ts` | Unit |
| A read-only file is never written (section 1.2) | `saving.test.ts` | Unit |
| Collect and Hand back: one folder per pupil, names made safe and unique as the teacher sees them, files copied as saved; handed-back files checked and written as new productions, the rest skipped with reasons (section 1.5) | `collect.test.ts` | Unit |
| Saving in a pupil's folder: a key for a new production, backups on a session's first save and saves asked for, the original kept once, plain-words problems, one save at a time with waiting autosaves merged; opening from the folder and the picker through `openProduction`; a copy's name (section 1.4) | `saving.test.ts` | Unit |
| Nothing in section 1.1 reaches a file: a field the types don't name is refused (section 1.0) | `file.test.ts`, `validate.test.ts` | Unit |
| Opening checks the archive, every part's shape, the script's limits and the references before anything loads; unknown entries are ignored and never written back (section 1.0) | `file.test.ts`, `validate.test.ts` | Unit |
| Adding, deleting and moving a scene keep the production sound, and their inverses restore the program (section 2.1) | `scenes.test.ts` | Unit |
| One undo step covers the program and the set-up (section 2.1) | With WP8.2 | Unit |
