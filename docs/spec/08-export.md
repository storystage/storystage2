# 08 Export and the Screening room

- **Covers:** Playing a production, the rough cut, compare, retake notes, export, captions, titles, credits
- **Work package:** WP11 (11.1 to 11.4; 11.6 is WP11c), and the driver Rehearse uses (WP6.4, WP7.4)
- **Owner:** S2 (S1 for the encoder, 11.3 and 11.5)
- **Status:** written for WP11b. The code it governs: `packages/playback`, `packages/screening`, and `packages/export` outside `encoder/`.

## 0. Decisions this spec relies on

- [0017 Export](../decisions/0017-export.md): MP4 export in the first release.
- [0067 Playback and Screening room packages](../decisions/0067-playback-and-screening-packages.md): where this code lives.
- [0049 Models in the production file](../decisions/0049-models-in-the-production-file.md): packed models carry their credits.
- [Spike 1.8](../decisions/spike-1.8-mp4.md): the encoder, WebCodecs first.
- `03-production-format.md` section 3.1: how a production plays, scene by scene (`packages/production`, `player.ts`).
- `07-ux.md` sections 1 and 7.4, and mock-ups 03 (the Screening room) and 09 (export).
- `18-runtime.md`: the runtime and its messages.

## 1. Playing a production (`packages/playback`)

The driver plays a production, or one scene, on the page. It joins three things it doesn't own:

- the **runtime** in a Web Worker (`serve`, spec 18);
- the **stage** (`Stage`, S3);
- the production's **player** (`ProductionPlayer`, S4), which decides what plays next.

The driver owns only the wiring. The rough cut, Rehearse (WP7.4) and the export all use it.

**One path, live or not.** The runtime always runs in fixed steps. Each frame (`frame(t)`, with `t` the film's time), the driver:

1. advances the runtime to the scene's time plus a lookahead of about 100 ms, and waits for its answer, so the runtime runs ahead of the picture (spike 1.4, rule 1);
2. seeks the stage to the scene's time;
3. gives the player the scene's time, `now(t)`, which it keeps calling after the runtime has finished, until the player says `end`.

The scene's time starts at 0 on each `load`. Live play calls `frame` every frame with a clock's time (`LiveClock`). The export, measuring and tests call it once per frame at a fixed rate. So pause and speed belong to the clock, and live play and the export take the same path.

Once the scene's code has stopped (a `stop`, a `sceneChange` or an `error`), the driver stops advancing the runtime, which would never answer. The picture and the player carry on alone, through a fade out or the rest of a crossfade, until the next scene loads.

**What the driver does with each runtime message.**

| Message | What the driver does |
|---|---|
| `commands` | Hands them to `stage.schedule`, then to the player |
| `ask` | Sends `stage.answer(query)` back to the runtime as `answer` |
| `watch` | Hands it to `stage.watch` |
| `highlight` | Tells its listeners the whole set of blocks running now (several, inside a do together), each time it changes. Rehearse passes them straight to the editor contract's `highlight(nodes, 'rehearse')` |
| `finished`, `sceneChange` | Passes them to the player, and tells its listeners |
| `error` | Passes it to the player, which stops. Tells its listeners, with the block, the code and the error in plain words (6.3), so the studio needs no table of its own |
| `stopped` | Ignores it |

**What it does with each player action.**

| Action | What the driver does |
|---|---|
| `load` | `stage.load(setup)` and schedules the action's commands. Then sends the runtime `load` and `start`, and starts the scene's clock at 0 |
| `stageCommands` | Hands them to `stage.schedule` |
| `crossfade` | Reported as an event. The `load` that follows passes its length to the stage (`stage.load(setup, { crossfade })`), which draws the old scene fading out over the new one |
| `stop` | Sends the runtime `stop` |
| `preload` | Hands the next scene's set-up to the stage's `preload` (S3), so a cut or crossfade doesn't wait. Not waited for; it never fails play |
| `next` | Ends a Rehearse run and tells its listeners "Next: <heading>" |
| `fault` | Tells its listeners. The player sends `end` straight after |
| `end` | Ends play, and tells its listeners once, however play ended. Its `fadeOut` is always empty: the player sends any fade first |

**Rules.**

- **One worker, scene after scene.** The driver reuses one runtime worker: a new `load` resets it (spec 18 section 3.1).
- **Only the current scene's messages.** After sending a `load`, the driver drops everything from the worker until that `load`'s `loaded` comes back. Messages from one worker arrive in order, so the old scene's leftovers can't reach the new one.
- **Stage events** (clicks, keys, collisions, proximity, view) go to the runtime as `event`, at the worker's present.
- **Listeners.** Callers subscribe to the driver's events rather than asking it: running blocks, scene started, finished, next (with the next scene's heading, for the studio's own words around it), error, ended. Each subscription returns a function that stops it.
- **Its stage and worker.** The driver takes the stage it's given: Rehearse gives it the scene view's own. Disposing of it stops listening and ends the worker, for when the learner leaves the Production stage.
- **Controls (6.4):**
    - **Pause** and **speed** (½×, 1×, 2×) are the clock's: the driver isn't called while paused.
    - **Restart** starts a new driver, and with it a new player, with the same seed and the same first scene. Each scene's seed is the run's seed plus its start number, so a player that has already run would give different seeds.
    - **Stop** works from outside at any moment: the studio stops a rehearsal when the code changes. It reloads the scene's set-up, so the stage is exactly as it started, rather than undoing anything.
- **Fast-forward.** The driver plays in fixed steps without drawing, then carries on live. It goes:
    - **to a time,** for the rough cut's jumps within a scene;
    - **to a block,** for Rehearse's "Rehearse to here": it stops when the picture reaches the first moment that block is running. If the block never runs, it plays to the end and says so in its result (`reached: false`), so the studio can say "That block didn't run this time". Give the driver `trace: true` for this: it then finds the block at the moment it starts from the runtime's `ran`, even a block that starts and ends between frames, which the `running` snapshots miss.
- **Measuring.** A fixed-step run that draws nothing gives the timeline:
    - when each scene starts and how long it lasts;
    - when each block ran;
    - every `say`, `think` and speak line, for captions.

    The rough cut and the export start with one. A deterministic run (6.5) gives the same timeline every time.

    It's `measure` in `packages/playback`: the driver in fixed steps at 30 a second, with the runtime's `trace`, so a block's time is when it started, even one that starts and ends between frames (spec 18, section 1). A scene that waits on the viewer is measured with `viewerWait` of 0, so it ends after its last stage command and the run goes on; it's marked `waits`. A line a scene change cuts short is cut short in the timeline too. The run stops at the 10-minute cap, or at an error, which the timeline gives in plain words.

**Rehearse (WP7.4)** is the driver with one scene, live, on the scene view's own stage, from the scene's set-up. A block that ends the scene (`goToScene`, `crossfade`, `fadeToBlack`) ends the rehearsal and says what would play next (spec 03 section 3.1, rule 9).

The worker's own file is `packages/runtime/src/worker.ts`: `serve(self, STORY_LIBRARY)`. The driver starts it with `new Worker(new URL(…), { type: 'module' })`.

## 2. The rough cut (11.1)

The Screening room's left column, as on screen 03, at the widths in `07-ux.md` section 1.2: a right column of 560, 544 or 420 pixels, and the player at 16:9 in what's left.

- **The player** fills the column at 16:9, with a label in its top corner: "Scene 2 · Frame 2.3". **Play** and **Pause** share one button.
- **The bar under the player** is the whole film, from the measuring run:
    - one segment per scene, numbered in running order; each segment's name is its number and heading;
    - the time so far and the length, as "0:38 / 1:12".

    It's a slider, with `aria-valuetext` such as "0:38 of 1:12".
- **Jumping:** clicking a scene's segment or card plays from that scene's start. Clicking inside a segment fast-forwards to that point (section 1). Arrow keys on the bar move by 5 seconds, and Home and End go to the ends.
- **The running order strip** shows one card per scene: its number, heading, length and status. Dragging a card changes the running order, and so does the keyboard, in the Storyboard's own way (`07-ux.md` sections 1.3 and 6.4: the handle, Enter, the arrows, Enter). It's one undo step, through the production's session (WP8.2).
- **A scene that waits on the viewer** (`waitsForViewer`) has no fixed length. Its segment ends in a small "waits for a click" mark, and the time shows "1:12+".
- **The current frame** is the frame linked to the block that ran most recently. If no block is linked, it's the frame whose planned length covers this moment, counting from the scene's start.
- **The place:** the studio shares one current scene and frame between its tabs. The Screening room is told it, and tells the studio when it changes, through a type of the same shape as the studio's (`{ scene, frame }`), since it can't import the studio.
- **Full screen** shows the player alone. Escape leaves it.
- **Captions** show under the picture while playing (section 6). They're always on in the Screening room (`CLAUDE.md` rule 7).
- **Errors** stop play. They show in plain words, the block's frame is marked, and **Fix on the Production stage** opens that block: the Screening room calls `onOpenProductionStage(node)` with the block, and the place if it changes, so the Code editor can open the block's method and put focus on it.

## 3. Compare and retake notes (11.2)

The right column, as on screen 03.

- **Compare with storyboard** shows two pictures side by side for the current frame, with arrows to step through frames:
    - **Your sketch:** the frame's layout, drawn as the Storyboard draws it.
    - **Film still:** the stage's picture (`Stage.picture`, 5.7) at the moment the frame stands for. That's when its linked blocks first ran in the measuring run, or else the end of its planned span.
- **No still is ever sent anywhere.** It's drawn on the device and thrown away. The Prompter never sees it (owner, 31 Oct 2026).
- **Retake notes:** each scene has a note, in the learner's own words, kept with the production on its storyboard card (`SceneCard.retakeNotes`, spec 03, S4's #231). It's typed, or dictated (decision 0060), and written through the production's session, so it has undo like everything else. Its length limit is spec 07's (section 6.9).
- **The automatic check** (11.6) sits under Compare. It's WP11c. Until then its panel says "Coming soon".
- **In code:** `Compare`, `RetakeNotes` and `CheckSoon` in `packages/screening`. The sketch is the studio's read-only `FramePicture` (S5), through `drawFrame`. The still comes from `ScreeningPlayer.still`: in the scene on the stage it's drawn without moving the film; for a frame in another scene, the film moves there first. Compare starts on the first frame and follows the frame playing until the learner chooses one with the arrows. Retake notes are for the frame compared's scene, written with `studio.commit` under one key per scene, so a run of typing is one undo step; they don't measure the film again, since only the program, the set-ups, the running order and the script change what plays.

## 4. Export for distribution (11.3)

**Export film** opens a dialog, as on screen 09.

- **Choices:**
    - **Title card:** on by default, with a byline the learner types, such as "A film by Willow Class".
    - **Captions on the picture:** on by default. The caption files (section 6) are always saved beside the film, either way.
    - **Resolution:** 720p (the default) or 1080p.
    - **File size:** an estimate from the length and the resolution.
    - The choices are locked while exporting.
- **Progress** comes in three steps, as drawn: drawing every frame, adding captions and credits, and saving the MP4 file. A film with speak lines has a step before them, preparing the voices. A bar shows the time left. **Stop export** stops at once and keeps nothing. **Keep working** closes the dialog while the export goes on.
- **Frames.** The driver plays the production in fixed steps at 30 frames a second, on a second stage that's never shown. For each frame:
    - the stage draws (`renderFrame`);
    - the export adds the captions, and the title or credits where they fall;
    - S1's `exportMp4` encodes it.
- **Waiting for the scene.** Each new scene waits for its stage to be ready before its first frame (spike 1.4, rule 5).
- **Measuring first.** The export measures the film on the same hidden stage, with the export's own `viewerWait` of 5 seconds, so its timeline is the film it makes: the length, and the lines the captions come from. A film that stops with an error, or that the player gives up on, isn't exported: the dialog gives the error in plain words.
- **In code:** `exportFilm` in `packages/export`. The title card fades in from black and out into the film over half a second each way. The credits roll at about 3 seconds a screenful of 12 rows, with a screen more to clear.
- **Sound: speak lines** (spec 06 sections 4.5 to 4.7). Each speak line the measuring run spoke (a line of `kind: 'caption'`) is voiced at its caption's start, on the film's clock after the title card, with the sound the studio's line cache made for it (`LineCache` in `@storystage/speech`, S1). The export is the same as Rehearse:
    - **Which sound:** the export asks the studio for each line's sound by its scene, speaker (`object`), words, script line and the block's own time in seconds (`seconds`, before any cut at the scene's end), so it finds the sound Rehearse plays. Choosing the character's voice is the studio's, not the export's. `exportFilm` takes `voices: { sampleRate, prepare(lines, signal), sound(line) }`: `prepare` is given every line the film speaks, and `sound` gives a line's samples, already fitted to its time, or `undefined`.
    - **One at a time:** a line is cut where the next speak line starts, as Rehearse's `LinePlayer` does, and where the scene ends, fading out over 10 ms so the cut doesn't click.
    - **Preparing first:** before drawing anything, the export has the studio prepare every line's sound (`voices.prepare`, which the studio does with `LineCache.prepare`), shown as a first step, **Preparing the voices**. A line that couldn't be made, or isn't ready, is silent, and keeps its caption (rule 7). When it's done, the dialog says how many lines are silent.
    - **The track:** one channel at 48 kHz, encoded as AAC. The cache's sounds (24 kHz) are resampled to it, since AAC encoders in browsers take 44.1 or 48 kHz. A film with no voiced line has no sound track. On a device that can't encode AAC, the film is saved silent, and the dialog says so; Opus as a fallback is still the owner's and S1's choice.
    - **Not yet:** the learner's recorded lines and narration, which need their times in the film first, and music.
- **A scene that waits on the viewer** can't be exported as it plays, because there's no viewer. The dialog says so first, in plain words. The export gives the player `viewerWait` of 5 seconds (`PlayerOptions`, S4): such a scene ends as if it had finished 5 seconds after its last stage command, and goes on with its transition. A later command (a timer, a collision) moves that moment later. Agreed with S4, who changes spec 03 rule 11 to match. The rough cut and Rehearse leave it unset, so there a scene waits for the viewer.
- **Length cap:** 10 minutes. A longer film stops at the cap with a plain message.
- **Licences (3.12).** If the production uses a model whose licence is non-commercial or "not sure", **Export for distribution** is refused before it starts, with the reason and the models named. Watching the rough cut is never refused.
- **Before exporting,** the whole-production check runs and lists its flags, and the learner can export anyway (11.6, with WP11c).
- **Saving** uses the host's file saving (decision 0028): the MP4 and its two caption files, named after the title. Nothing leaves the device unless the learner sends it. The host's picker saves one `.storystage` file at a time, so a way to save the three together (`saveFilm`) is asked of S8; until it's there, the browser saves them into a folder the learner picks where it can (Chrome, Edge), or else as one `.zip`, so "allow multiple downloads?" can never lose the captions. A learner who backs out of saving keeps the film made, and **Save it** tries again.
- **In the studio:** the export runs in the Screening tab (`ExportJob`, `ExportDialog` in `packages/screening`). **Keep working** closes the dialog and the export goes on anywhere in the studio: the App keeps it (`exportSlot`), above the tabs, and stops it when the studio closes. Its hidden stage draws with WebGL2, for the same pixels on every machine.

## 5. Titles (11.4)

- **The title card** comes first, for 4 seconds: the production's title, and the byline under it. It fades in from black and fades into the first scene.
- **An empty title** gives "Untitled film". An empty byline leaves its line out.

## 6. Captions (11.4)

**Where they come from:** every `say` and speak line in the measuring run, with its start and length. A `think` is a thought, not speech, so it isn't captioned. A speak line's words are its script line's words.

**Who says it:**

- the character's name from the script, if a dialogue line in that scene has the same words (ignoring case, spacing and the marks at the end);
- otherwise the object's name, with its first letter in capitals.

It's written as "OWL: Here is the key." in capitals, as a script writes names.

**Rules.**

- A caption lasts as long as its bubble or line, and at least 1 second.
- Two at once are stacked, earliest first, and at most two show at a time: when more overlap, the two that started last.
- On the picture they sit centred near the bottom, in Atkinson Hyperlegible on a dark panel, sized to the picture's height (decision 0031).
- **WebVTT** (`.vtt`) and **SRT** (`.srt`) files hold the same captions. Times are `00:00:01.000` in WebVTT and `00:00:01,000` in SRT. The text is escaped, so a learner's `<`, `>` and `&` stay text.
- Times count from the start of the film, title card included.

## 7. Credits (11.4)

The credits roll after the last scene, upwards at a steady pace, about 3 seconds a screenful, with lines in this order:

1. **Story and code:** the names the learner chose, from the production's manifest (`manifest.credits.names`, spec 03, S4's #231). Left out if there are none. The title card's byline is written from them too.
2. **Cast, Props, Set and Backdrops:** each model the production uses, its credit line from Backstage, grouped by S4's `creditsBySection`. A packed model (decision 0049) is marked "Imported". Shipped models from one source are grouped, as "Cat, Owl and Robot from the StoryStage Cast": the lines whose words after "by" or "from" are the same. A CC BY model's line gives its licence's name and deed.
3. **Sound:** each recording's label, if there are any.
4. **Notices** a licence requires, such as Carnegie Mellon University's acknowledgement for models made from Alice's, each once. Each model's record will say which notice it needs (spec 17, section 3a, rule 5); until it does, the caller passes `notices`.
5. **Made with StoryStage 2.**

The credits are the same whatever language the interface is in, apart from the headings.

## 8. Tests

| Rule | Test | Level |
|---|---|---|
| The driver's wiring, both modes, dropping the old scene's messages, asks, `watch`, events, listeners, controls, fast-forward to a time and to a block (section 1) | `packages/playback`, against `FakeStage` and `serve` over in-memory ports | Unit |
| The measuring run gives scene times, block times and lines, the same every time | `packages/playback` | Unit |
| The rough cut: segments, jumping, current frame, a scene that waits, errors (section 2) | `packages/screening`, with Testing Library | Unit |
| Compare picks the right moment for a frame (section 3) | `packages/screening` | Unit |
| Export: frame count, title card and credits where they fall, cancel, refusal for licences (section 4) | `packages/export`, with a fake encoder | Unit |
| Captions: who says it, timing, stacking, WebVTT and SRT, escaping (section 6) | `packages/export` | Unit |
| Sound: each speak line at its caption's start after the title card, cut by the next line and the scene's end with a fade, silent lines counted, no track with no voiced line, silent with a note when AAC can't be encoded (section 4) | `packages/export`, with a fake line source and encoder | Unit |
| Credits: order, grouping, imported models, notices (section 7) | `packages/export` | Unit |
| A three-scene production exports to an MP4 that plays, with captions and credits (WP11 done-when) | Playwright in CI, then the owner's device run on Windows, macOS, iPad and ChromeOS | End to end, device |
| Keyboard path through the Screening room, axe clean, at the three sizes | Playwright | End to end |

## 9. The automatic check against the storyboard (11.6)

WP11c, decision 0071: `packages/check` (`@storystage/check`). It compares what the code does with what the storyboard planned, from the scene's state rather than from pictures. It works without the Prompter and without a network. No picture is taken, and nothing is sent anywhere.

### 9.1 Where it runs

- **Check this frame** and **Check this scene**, on the Production stage (S5): the frame's scene, or one scene.
- **Check the whole film**, in the Screening room: every scene in the running order. It runs before **Export for distribution** and lists any flags; the learner can export anyway (section 4).

### 9.2 How it runs

The driver plays the scene offscreen in fixed steps on a hidden stage, in deterministic mode (6.5), with the runtime's `trace` (spec 18 section 1). A scene that waits on the viewer goes on after `viewerWait` of 5 seconds, as in the export. At the end of each frame, it asks the stage where things are, using questions it already answers (`transform`, `isVisible`, `size`, `lens`); it also notes when each character was last on screen during the frame. As S3 describes the stage:

- **On screen** is worked out here, not asked: `isVisible` only says a character is showing (its opacity above 0). A character is on screen when it's showing and its middle (its origin, at its base, plus half its height up) is in front of the camera, nearer than 256 m (the stage's far clipping), and inside the picture.
- **The picture:** the camera looks along its +Z with +Y up, in a right-handed scene, so its +X is on the picture's **left**. The lens is the vertical viewing angle in **turns** (radians = lens × 2π), and the horizontal angle follows from the picture's 16:9 shape.
- **Facing:** a model faces its own +Z, so its facing is its rotation applied to (0, 0, 1).

### 9.3 A frame's span in the film

The frames of a scene, in storyboard order, share the scene's run:

- **A frame starts** when the first of its linked blocks (`Frame.links`, 10.8) first starts in the scene's run, unless that's before the frame before it starts. Otherwise it starts where the frame before was planned to end (that frame's start plus its planned length); the first frame starts with the scene.
- **A frame ends** where the next frame starts. The last frame ends with the scene. A frame whose next frame starts no later than it does ends at its own start plus its planned length, but no later than the scene's end.

### 9.4 What it compares

Each comparison gives an item: **passed**, or a **flag**. A few give a **note**, which is never a flag. The tolerances are chosen so that a frame that matches its storyboard gives no flags.

- **Who is on screen.** The characters are the frame's sketches whose `item` is the model of an object in the scene's set-up, or one of the scene card's cast; marks (`mark/…`) and backdrop sketches (`backdrop/…`) aren't characters. A cast member sketched with no object in the set-up isn't on screen, and is flagged. When two objects share a model, they're matched to the sketches in left-to-right order. A character sketched but not visible at the frame's end is flagged. A character who was visible during the frame but isn't at its end has **walked off camera**, and that's what the flag says. A character visible but not sketched is a note.
- **Where they are.** Each character's place on the picture comes from its position, the camera's transform and the lens. It's flagged when it's on the opposite side of the middle from its sketch, with both more than 15% of the picture's width from the middle (a **mirrored position**). For two characters both on screen, their left-to-right order is compared with the sketch's, and swapped characters are flagged, unless they're within 10% of the picture's width of each other.
- **Which way they face.** A character's facing towards the camera is front (within 30°), three-quarter (30° to 75°), side (75° to 120°) or back (beyond 120°), and for a side view, left or right. Unflipped, a side or three-quarter sketch faces the picture's left, and `flipped` turns it to the right (the sketch renderer's `VIEWS`, `packages/sketches/src/render.ts`). It's flagged only when it's two steps or more from the sketch's facing (front against side or back, say), or a side view faces the other way from the sketch's (`flipped`).
- **The shot.** It checks that every character the shot frames is on screen. A close-up should fill at least 40% of the picture's height with its first character; a wide shot should leave each character no more than 60% of it. Medium and two-shots are checked for the characters on screen only.
- **Pinned script lines.** Each dialogue line pinned to the frame (`pinnedFrame`) should be said (a `say`, or a speak line's `caption`) with the same words, compared as captions compare them (section 6), during the scene's run. A line never said in the scene is flagged. A line said in another frame of the scene is a note ("said in frame 2.4").
- **Speak lines** (spec 06 section 4.1). Each speak line spoken during the frame (a `say` whose bubble is `caption`) is compared with the script, once for each block. The block is the `speakLine` block whose run started at the caption's start; the item names it (`node`), so the frame card can link to it.
    - With a line (`line`, the script line it was made from): when the line's words and the block's are the same, compared as captions compare them, it's passed, unless that line is pinned to the frame and so already has its item. When they differ, it's flagged, whichever of them changed since the block was made. The frame card offers **Use the new words** (`scriptWords`, section 9.7, an undoable edit) and **Keep these** (keeping the flag). A line no longer in the script is a note.
    - Without a line: dialogue the script hasn't got. That's allowed, so it's a note, not a flag. If its words are one of the scene's dialogue lines, it's passed instead, and names that line.
    - A block that never runs is spoken in no frame, so it gives no item. It's flagged when it's more than half as long again, or less than half, with a second's grace either way. So a frame twice its planned length is flagged, and one a little over is not.
- **Problems while it runs.** An error that stops the run, endless loops included, is flagged on the frame it happened in, with its words (6.3). A model the stage couldn't find (section 1's `missing`) is a note on every frame of the scene.

### 9.5 The words

Plain words, as screen 07's checklist draws them, with the character's name from the script where it has one and otherwise from the set-up:

| Item | Passed | Flag |
|---|---|---|
| On screen | "Owl is on screen" | "Owl isn't on screen at the end of this frame" |
| Off camera | | "Owl walks off camera during this frame" |
| Position | "Owl is on the left, as in your sketch" | "Owl ends on the left; your sketch has it on the right" |
| Order | | "Owl and Fox are the other way round from your sketch" |
| Facing | "Owl faces the camera, as in your sketch" | "Owl faces away; your sketch has it facing the camera" |
| Shot | "The close-up frames Owl" | "The close-up doesn't fill the picture with Owl" |
| Line | "Line 2.3 is said" | "Line 2.3 is never said" |
| Speak line | "Owl says line 2.3 as written" | "Owl's words aren't the same as line 2.3 in the script" |
| Length | "This frame lasts about 3 seconds, as planned" | "This frame lasts 6 seconds; you planned 3" |
| Problem | | the error's own words (6.3) |

Each item says which block (`node`) and which sketch (`sketch`) or line (`line`) it's about, so the frame card can link to them.

### 9.6 The result, saved in the film

Each frame's latest result is saved on the frame (`Frame.check`, a production format change for S4), with the flags the learner chose to keep:

- `basis`: a hash of what the result depends on: the program, the scene's set-up, the frame itself and the frames beside it, the script lines pinned to it, and the other script lines its items name (a speak line's, so a change to that line's words makes the result stale). When it no longer matches, the result is **stale**. It still shows, marked as from before the last change, but the frame isn't Checked.
- `items`: each item's `id` (stable across runs, such as `onScreen:owl` or `line:<lineId>`), `kind`, `outcome` (`passed`, `flag` or `note`), `words`, and `node`, `sketch` and `line` where they apply.
- `kept`: the `id`s of the flags the learner chose to keep. A kept flag stays in the checklist but doesn't hold the frame back.

A frame is **Checked** (07-ux section 2.3) when its result isn't stale and every flag in it is kept. A flag not kept marks it **Look at**. The Prompter's `check_frame` (spec 04) reads this result. It doesn't run the check.

Agreed with S4 for the format (1.3.0, `CHECK_KINDS`, `CHECK_OUTCOMES`, `CHECK_LIMITS` in `@storystage/production`):

- **Limits:** at most 200 items a frame, each `id` unique in it; `words` at most 300 characters (a problem item carries the error's words); `id`, `node`, `sketch` and `line` at most 200 each; `basis` at most 128; `kept` at most 200 ids. `node`, `sketch` and `line` aren't checked against the program or the frame: a stale result may name something since deleted, and the frame card just doesn't link it. A kept id that matches no flag is allowed, and is simply ignored: it isn't pruned, since only the learner's own steps change `kept`.
- **A `check` that doesn't fit the shape** is dropped quietly when the file opens; the frame opens without it and the file isn't refused. A **stale** result is kept: only this package can tell stale, from `basis`.
- **Undo:** running a check doesn't add an undo step. Its result (`basis` and `items`) is written outside the history with `ProductionSession.annotate` (#338) and stays across undo and redo, which `basis` keeps correct. `annotate` leaves each frame's `kept` alone. Keeping a flag, or letting it go, is the learner's choice, an undoable step through `change`.
- **The words are data.** In a file someone has edited by hand, `words` can say anything. The studio draws them as plain text, and the Prompter's `check_frame` passes the result inside its `<check_result>` data block (spec 04 section 2.4), never as instructions.

### 9.7 The package's API

Agreed with S5, who builds the frame card, the frame strip and the Check buttons on it:

- **Running:** `checkFrame({ production, stage, startWorker, frame, signal?, onProgress? })` and `checkScene({ …, scene })`, and the Screening room's `checkFilm`. As with `exportFilm`, the caller makes, prepares and disposes of the hidden stage, one a run; the runner never disposes of it. A run gives each frame's `CheckResult` (`basis` and `items`, the stored shape without `kept`), ready for `annotate`. `onProgress(done, total)` counts frames, for "Checking frame 2 of 5…".
- **Writing back:** results go to `session.annotate(results)` (S4's, not an undo step). Keeping a flag is `keepFlag(production, frame, itemId, keep)`, a pure helper giving the next production, for the studio's undoable `commit`, labelled "Keep the flag on frame 2.3".
- **Status,** cheap enough for every frame on every render: `frameStatus(frame, production)` gives `'checked'`, `'lookAt'` or `null` (no result, or a stale one, so the frame shows the studio's own status); `checkState(frame, production)` gives `{ stale, flags, kept }` or `null`. `basis` is cached per program and scene.
- **Order:** `ITEM_ORDER` lists flags first, then notes, then passed items, so every view lists them the same way.
- **Use the new words:** `scriptWords(production, item)` gives the edit that puts a speak line's script words into its block (`setArgument` on the block's `text`), for the studio's undoable step labelled "Use the script's words for line 2.3"; `null` when the item isn't a speak line whose line is still in the script.
- **Rehearsed** (07-ux section 2.3) stays the studio's: a Rehearse run doesn't compare anything with the storyboard. A frame counts as rehearsed when a Rehearse run's `ran` events include one of its `links`; a frame with no links, when the run reaches the scene's end. So unlinked frames still move on.

### 9.8 Tests

| Rule | Test | Level |
|---|---|---|
| Spans from links and planned lengths (9.3) | `packages/check` | Unit |
| Each comparison, its tolerances, and its words (9.4, 9.5) | `packages/check`, from scene states made in the test | Unit |
| The done-when: five planted differences (a missing character, a mirrored position, an unsaid line, a frame twice its planned length, a character off camera) each flagged, and no flags on a matching frame | `packages/check`, through the runner on `FakeStage` and the real runtime | Unit |
| A stale result, kept flags and Checked (9.6) | `packages/check` | Unit |
| Speak lines: the same words, changed words, a line taken out of the script, and words not in the script, each on the frame it's spoken in, with its block; `scriptWords` (9.4, 9.7) | `packages/check`, through the runner on `FakeStage` and the real runtime | Unit |
