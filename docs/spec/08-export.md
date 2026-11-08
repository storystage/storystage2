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
| `highlight` | Tells its listeners which blocks are running (Rehearse highlights them) |
| `finished`, `sceneChange` | Passes them to the player, and tells its listeners |
| `error` | Passes it to the player, which stops. Tells its listeners, with the block and the code, so the studio can say it in plain words |
| `stopped` | Ignores it |

**What it does with each player action.**

| Action | What the driver does |
|---|---|
| `load` | `stage.load(setup)` and schedules the action's commands. Then sends the runtime `load` and `start`, and starts the scene's clock at 0 |
| `stageCommands` | Hands them to `stage.schedule` |
| `crossfade` | Tells the stage to fade the old picture out over the new one |
| `stop` | Sends the runtime `stop` |
| `preload` | Hands the next scene's set-up to the stage's `preload` (S3), so a cut or crossfade doesn't wait. Ignored until the stage has one |
| `next` | Ends a Rehearse run and tells its listeners "Next: <heading>" |
| `fault` | Tells its listeners. The player sends `end` straight after |
| `end` | Ends play, and tells its listeners once, however play ended. Its `fadeOut` is always empty: the player sends any fade first |

**Rules.**

- **One worker, scene after scene.** The driver reuses one runtime worker: a new `load` resets it (spec 18 section 3.1).
- **Only the current scene's messages.** After sending a `load`, the driver drops everything from the worker until that `load`'s `loaded` comes back. Messages from one worker arrive in order, so the old scene's leftovers can't reach the new one.
- **Stage events** (clicks, keys, collisions, proximity, view) go to the runtime as `event`, at the worker's present.
- **Listeners.** Callers subscribe to the driver's events rather than asking it: running blocks, scene started, finished, next, error, ended. Each subscription returns a function that stops it.
- **Controls (6.4):**
    - **Pause** and **speed** (½×, 1×, 2×) are the clock's: the driver isn't called while paused.
    - **Restart** starts a new driver, and with it a new player, with the same seed and the same first scene. Each scene's seed is the run's seed plus its start number, so a player that has already run would give different seeds.
    - **Stop** works from outside at any moment: the studio stops a rehearsal when the code changes. It reloads the scene's set-up, so the stage is exactly as it started, rather than undoing anything.
- **Fast-forward.** The driver plays in fixed steps without drawing, then carries on live. It goes:
    - **to a time,** for the rough cut's jumps within a scene;
    - **to a block,** for Rehearse's "Rehearse to here": it stops at the first moment that block is running. If the block never runs, it plays to the end and says so.
- **Measuring.** A fixed-step run that draws nothing gives the timeline:
    - when each scene starts and how long it lasts;
    - when each block ran;
    - every `say`, `think` and speak line, for captions.

    The rough cut and the export start with one. A deterministic run (6.5) gives the same timeline every time.

**Rehearse (WP7.4)** is the driver with one scene, live, on the scene view's own stage, from the scene's set-up. A block that ends the scene (`goToScene`, `crossfade`, `fadeToBlack`) ends the rehearsal and says what would play next (spec 03 section 3.1, rule 9).

The worker's own file is `packages/runtime/src/worker.ts`: `serve(self, STORY_LIBRARY)`. The driver starts it with `new Worker(new URL(…), { type: 'module' })`.

## 2. The rough cut (11.1)

The Screening room's left column, as on screen 03.

- **The player** fills the column at 16:9, with a label in its top corner: "Scene 2 · Frame 2.3". **Play** and **Pause** share one button.
- **The bar under the player** is the whole film, from the measuring run:
    - one segment per scene, numbered in running order;
    - the time so far and the length, as "0:38 / 1:12".
- **Jumping:** clicking a scene's segment or card plays from that scene's start. Clicking inside a segment fast-forwards to that point (section 1). Arrow keys on the bar move by 5 seconds, and Home and End go to the ends.
- **The running order strip** shows one card per scene: its number, heading, length and status. Dragging a card changes the running order, as on the Storyboard; it's one undo step, through the production's session (WP8.2).
- **A scene that waits on the viewer** (`waitsForViewer`) has no fixed length. Its segment ends in a small "waits for a click" mark, and the time shows "1:12+".
- **The current frame** is the frame linked to the block that ran most recently. If no block is linked, it's the frame whose planned length covers this moment, counting from the scene's start.
- **The place:** the studio shares one current scene and frame between its tabs. The Screening room is told it, and tells the studio when it changes, through a type of the same shape as the studio's (`{ scene, frame }`), since it can't import the studio.
- **Full screen** shows the player alone. Escape leaves it.
- **Captions** show under the picture while playing (section 6). They're always on in the Screening room (`CLAUDE.md` rule 7).
- **Errors** stop play. They show in plain words, the block's frame is marked, and **Fix on the Production stage** opens that block.

## 3. Compare and retake notes (11.2)

The right column, as on screen 03.

- **Compare with storyboard** shows two pictures side by side for the current frame, with arrows to step through frames:
    - **Your sketch:** the frame's layout, drawn as the Storyboard draws it.
    - **Film still:** the stage's picture (`Stage.picture`, 5.7) at the moment the frame stands for. That's when its linked blocks first ran in the measuring run, or else the end of its planned span.
- **No still is ever sent anywhere.** It's drawn on the device and thrown away. The Prompter never sees it (owner, 31 Oct 2026).
- **Retake notes:** each scene has a note, in the learner's own words, kept with the production on its storyboard card (`SceneCard.retakeNotes`, spec 03, S4's #231). It's typed, or dictated (decision 0060), and written through the production's session, so it has undo like everything else. Its length limit is spec 07's (section 6.9).
- **The automatic check** (11.6) sits under Compare. It's WP11c. Until then its panel says "Coming soon".

## 4. Export for distribution (11.3)

**Export film** opens a dialog, as on screen 09.

- **Choices:**
    - **Title card:** on by default, with a byline the learner types, such as "A film by Willow Class".
    - **Captions on the picture:** on by default. The caption files (section 6) are always saved beside the film, either way.
    - **Resolution:** 720p (the default) or 1080p.
    - **File size:** an estimate from the length and the resolution.
    - The choices are locked while exporting.
- **Progress** comes in three steps, as drawn: drawing every frame, adding captions and credits, and saving the MP4 file. A bar shows the time left. **Stop export** stops at once and keeps nothing. **Keep working** closes the dialog while the export goes on.
- **Frames.** The driver plays the production in fixed steps at 30 frames a second, on a second stage that's never shown. For each frame:
    - the stage draws (`renderFrame`);
    - the export adds the captions, and the title or credits where they fall;
    - S1's `exportMp4` encodes it.
- **Waiting for the scene.** Each new scene waits for its stage to be ready before its first frame (spike 1.4, rule 5).
- **Sound:** the learner's recorded lines and narration, mixed at their scene times. Speak line's voices come with WP14. AAC first, Opus if AAC can't be encoded (the export audio choice still open with S1 and the owner).
- **A scene that waits on the viewer** can't be exported as it plays, because there's no viewer. The dialog says so first, in plain words. The export gives the player `viewerWait` of 5 seconds (`PlayerOptions`, S4): such a scene ends as if it had finished 5 seconds after its last stage command, and goes on with its transition. A later command (a timer, a collision) moves that moment later. Agreed with S4, who changes spec 03 rule 11 to match. The rough cut and Rehearse leave it unset, so there a scene waits for the viewer.
- **Length cap:** 10 minutes. A longer film stops at the cap with a plain message.
- **Licences (3.12).** If the production uses a model whose licence is non-commercial or "not sure", **Export for distribution** is refused before it starts, with the reason and the models named. Watching the rough cut is never refused.
- **Before exporting,** the whole-production check runs and lists its flags, and the learner can export anyway (11.6, with WP11c).
- **Saving** uses the host's file saving (decision 0028): the MP4 and its two caption files, named after the title. Nothing leaves the device unless the learner sends it.

## 5. Titles (11.4)

- **The title card** comes first, for 4 seconds: the production's title, and the byline under it. It fades in from black and fades into the first scene.
- **An empty title** gives "Untitled film". An empty byline leaves its line out.

## 6. Captions (11.4)

**Where they come from:** every `say` and speak line in the measuring run, with its start and length. A `think` is a thought, not speech, so it isn't captioned. A speak line's words are its script line's words.

**Who says it:**

- the character's name from the script, if a dialogue line in that scene has the same words;
- otherwise the object's name, with its first letter in capitals.

It's written as "OWL: Here is the key." in capitals, as a script writes names.

**Rules.**

- A caption lasts as long as its bubble or line, and at least 1 second.
- Two at once are stacked, earliest first, and at most two show at a time.
- On the picture they sit centred near the bottom, in Atkinson Hyperlegible on a dark panel, sized to the picture's height (decision 0031).
- **WebVTT** (`.vtt`) and **SRT** (`.srt`) files hold the same captions. Times are `00:00:01.000` in WebVTT and `00:00:01,000` in SRT. The text is escaped, so a learner's `<`, `>` and `&` stay text.
- Times count from the start of the film, title card included.

## 7. Credits (11.4)

The credits roll after the last scene, upwards at a steady pace, about 3 seconds a screenful, with lines in this order:

1. **Story and code:** the names the learner chose, from the production's manifest (`manifest.credits.names`, spec 03, S4's #231). Left out if there are none. The title card's byline is written from them too.
2. **Cast, Props, Set and Backdrops:** each model the production uses, its credit line from Backstage, grouped by S4's `creditsBySection`. A packed model (decision 0049) is marked "Imported". Shipped models from one source are grouped, as "Owl, Cat and Robot from the StoryStage Cast".
3. **Sound:** each recording's label, if there are any.
4. **Notices** a licence requires, such as Carnegie Mellon University's acknowledgement for models made from Alice's. Each model's record says which notice it needs.
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
| Credits: order, grouping, imported models, notices (section 7) | `packages/export` | Unit |
| A three-scene production exports to an MP4 that plays, with captions and credits (WP11 done-when) | Playwright in CI, then the owner's device run on Windows, macOS, iPad and ChromeOS | End to end, device |
| Keyboard path through the Screening room, axe clean, at the three sizes | Playwright | End to end |
