# StoryStage 2: the next generation

Andrew Dakers · exported from Claude Docs on 20 Oct 2026 (the Claude Docs version is the live one)

StoryStage 2 is a rewrite of StoryStage on web technology. Learners plan a film in the **Storyboard**, build and code it on the **Production stage**, and watch and export it in the **Screening room**, helped by an optional AI coach, **the Prompter**. On estimated durations, to be recalibrated at the first milestone, a release candidate is ready in late February 2027 and the pilot in schools ends in early April 2027. This doc sets out why, what and how. The work packages are in `docs/WORKPLAN.md`, the architecture in StoryStage-architecture.pptx and the schedule in StoryStage2-gantt.pptx.

## 1. Purpose and vision (drafts)

These are drafts for you to refine; each comes with a shorter version for slides and the website.

**Purpose (why StoryStage exists):**

> StoryStage helps young people learn to code by making films. They plan a story like a film-maker, build and program it in 3D like a theatre director, and screen it for an audience. An AI coach helps them along the way, but every word of the story stays theirs.

Short version: *Learn to code by telling stories on screen.*

**Vision (the future it works towards):**

> Every young person in the UK can turn an idea into a story they have coded themselves, screen it for an audience, and carry what they learned into the next tools they use.

Short version: *From story to screen to the next step.*

**What it stands on:**

- **Story first:** the storyboard comes before the code, because planning is how stories (and programs) get good.
- **The learner's own work:** the Prompter coaches and explains; it never writes the story.
- **For every school:** it runs on the 4 GB Chromebooks and iPads schools already have, with no StoryStage server and no tracking.
- **A pathway, not a dead end:** the ideas learners meet in StoryStage are the ones they meet next in Unreal, Unity and live-event tools.

**The teacher's job (draft, to test in five interviews, WP16.7):** *help my class plan, build and present a story with code in a few lessons, on the devices we have, without my being a specialist, and with work I can mark.*

**Who the Prompter is for (decision due at M1, WP24.3):** whole classes use StoryStage without the Prompter. The Prompter starts where an adult owns the key: after-school clubs, small groups and home use with a parent. For whole classes, the option is a classroom relay, where the teacher's app holds one key for the class, once a spike shows school Wi-Fi allows it. Simpler requests go to a lower-cost model.

**Open question:** the age range. The curriculum mapping (WP16) covers Key Stages 1 to 3, the editor study plans for ages 11 to 14, and the Prompter needs an adult account. Settle the range before the statements are final.

## 2. Where StoryStage 2 comes from

StoryStage 2 keeps the best of Alice and of StoryStage 1, and starts again on technology that runs on school devices.

- **Alice** (Carnegie Mellon University, building on Looking Glass at Washington University) proved that 3D storytelling with drag-and-drop code teaches programming well. StoryStage 2 keeps its vocabulary, its rules for how programs run, the design of its tile editor and, if CMU agrees, its models. It ships none of Alice's Java.
- **StoryStage 1** is a Java fork of Alice 3.9.1 with the Prompter, an optional Claude assistant, added. It stays in use for the Test Release 1 (TR1) pilot until StoryStage 2 replaces it. Its Prompter protocol, key handling, speech design, evaluation set and self-test carry over as designs.
- **StoryStage 2** is a rewrite in React and TypeScript, packaged as Tauri apps for every device plus a browser version without the Prompter.

**Decisions since the first version of this doc** (all by you, 17 to 18 Oct 2026):

| Date | Decision | Where it lives |
| --- | --- | --- |
| 18 Oct 2026 | After two board reviews: Linux dropped from the first release; AR, projection and the pathway held until the release candidate; a threat model, classroom ground truth, and the teacher's journey and class set-up added; the Prompter's route to groups to be decided at M1 | WP0.9, WP1.11, WP24, sections 1 and 10 |
| 18 Oct 2026 | The model gallery is renamed Backstage, with Cast, Props, Set and Backdrops sections | WP3, section 7 |
| 18 Oct 2026 | Two code editors in the first release (Blocks and Tiles), learners can switch, a pilot study picks one | WP7, WP7c, WP19, section 6 |
| 18 Oct 2026 | Projection mapping pathway, with Export to Pixera | WP23, section 8 |
| 18 Oct 2026 | AR as an audience experience and distribution format; AR trails on the roadmap | WP22, section 8 |
| 18 Oct 2026 | Work packages start as soon as their dependencies allow; about eight parallel Claude Code sessions | Workplan section 5a, section 9 |
| 18 Oct 2026 | AR design mode for learners | WP21 |
| 18 Oct 2026 | A pathway to industry tools (Unreal, Unity, Godot), with a crosswalk to VRM, H-Anim, BML and X3D | WP20, StoryStage2-crosswalk.md |
| 17 Oct 2026 | No Sims 2 models unless EA gives written permission; new sources for people and characters | WP3, WP17.7 |
| 17 Oct 2026 | StoryStage 2 on web technology, starting immediately: apps on every device with the Prompter, and a browser version without it | Workplan section 2 |
| 17 Oct 2026 | Three tabs (Storyboard, Production stage, Screening room); storyboard required before code; logline and synopsis; sketch frames only; MP4 export; `.storystage` files; all four UK nations' curricula | Workplan section 2, section 5 |

### Where StoryStage 2 sits

StoryStage 2 doesn't replace Scratch at primary school or Minecraft for engagement. Its closest competitor is CoSpaces Edu, and its niche is young people who want to tell stories with code and go on into film, animation, games or live events.

|  | Scratch | CoSpaces Edu | Minecraft Education | Roblox Studio | StoryStage 2 (planned) |
| --- | --- | --- | --- | --- | --- |
| World | 2D sprites | 3D scenes, AR and VR | 3D block world | 3D multiplayer game worlds | 3D scenes with jointed characters; AR and projection later |
| Code | Blocks | Blocks (CoBlocks); text scripting on the paid plan | MakeCode blocks and Python (Code Builder) | Luau text code only; Studio runs on Windows and Mac only | Blocks or Tiles, with a Python- or Java-like text view |
| How work is made | Free-form | Free-form, with lesson plans | Building in a shared world | Building and scripting a game, then publishing it to the platform | Storyboard, Production stage, Screening room: the film and TV production process |
| AI | None built in | Not assessed here | Teachers use Microsoft Copilot to plan lessons and write Python | Assistant builds and scripts on request, with Planning Mode and automated playtesting (April 2026) | The Prompter coaches and builds on request, with a plan the learner edits first; never writes the story |
| What a learner keeps | A project on the Scratch site | A shared scene | A world | A published experience on Roblox, which can earn money | An MP4 film; later an AR pack, a projection package and glTF files for Unreal, Unity and Godot |
| Cost | Free | Limited free plan (10 objects per scene); paid seats | About US$5 per user per year list price | Free; creators were paid about US$1.7bn in the year to June 2026, but the median paid creator earned about US$1,500 | Free without the Prompter; the Prompter needs a key |
| Accounts | Online accounts and a public community | Online accounts | Microsoft accounts | Roblox accounts; age checks for chat since January 2026, Kids and Select accounts since June 2026 | None; no server |
| Today | Very large community | Established in schools | Very large | Very large; a free UK schools programme with Digital Schoolhouse (August 2026) | Not yet built |

**For a young person aiming at an interactive media career:** Scratch teaches logic but stops at 2D. Minecraft builds engagement and Python inside one game's world. CoSpaces adds 3D, AR and text code. Roblox Studio is the strongest route into game development itself: real text code, a live audience, and a creator economy, though few creators earn much and it needs a Windows or Mac computer and an online account. StoryStage 2's case is the professional production process (storyboard, shot types, screening) and industry formats (glTF, VRM, H-Anim), with a stated route from its text view to Python and on into Unreal, Unity and live-event tools; it runs on Chromebooks and iPads with no accounts. Its weaknesses: it isn't built yet, has no community, and starts with a smaller model library.

**What StoryStage 2 takes from Roblox Studio, and what it doesn't.** Two ideas from Roblox's Assistant are adapted for learners: an editable plan before any change (Prompter, plan before change) and automated playtesting (the automatic check against the storyboard, which runs without the Prompter). StoryStage 2 does not export to Roblox (decided 18 October 2026): Roblox is a platform with its own accounts, age checks and publishing rules, which sits badly with StoryStage's no-accounts design, so the pathway stays with Unreal, Unity and Godot.

## 3. Design principles

Every work package is checked against these ten rules; when two conflict, the earlier one wins.

1. **Children's safety and privacy by default.** No accounts, no analytics, no StoryStage server. The ICO Children's code and a data protection impact assessment cover every feature that touches data (Prompter, speech, AR camera, study logs).
2. **The story is the learner's.** The Prompter coaches, explains and builds only when asked; it never writes the logline, synopsis or script.
3. **Story first.** A scene is storyboarded before it is coded; a teacher can relax this only for imported Alice worlds.
4. **Runs on what schools have.** Every rendering, speech or memory feature is measured on a 4 GB Chromebook and a non-Pro iPad.
5. **Accessible to all.** WCAG 2.2 AA, full keyboard paths through all three tabs, captions for all speech.
6. **The key stays safe.** The user's or school's own Claude key lives in the device's secure store and is used only by the app's native layer.
7. **Open standards over lock-in.** glTF models, VRM and H-Anim joint names, Fountain scripts, an open Story API specification, and export to more than one engine.
8. **Keep Alice's ideas, not its code.** Its vocabulary, semantics, editor design and (if licensed) models.
9. **Evidence before lock-in.** Spikes on real devices before building, and a classroom study before choosing the code editor.
10. **A pathway, not a dead end.** Name things the way industry does, in the text view and teacher notes.

## 4. Architecture at a glance

One React and TypeScript app runs everywhere; a thin native layer in each Tauri app holds the Claude key and talks to the Anthropic API, so no web code ever sees the key.

*[Diagram: StoryStage 2 architecture · 7 layers. Not exported; see slide 4 of `docs/slides/StoryStage-architecture.pptx`.]*

The program is stored as a typed tree (the AST) with stable ids, so both code editors, the runtime, the Prompter and the storyboard links all work on the same thing. Nothing runs on a StoryStage server. The slide version, with Alice's material marked, is slide 4 of StoryStage-architecture.pptx.

**Safe by design.** The native layer is the policy enforcement point: before adding the key, it checks every Prompter request against an allowlist (the models for each mode, a token ceiling, the pinned system prompt and tool schemas, per-minute and per-day caps) and refuses anything else with a coded error. So even a script that got into the app couldn't spend the school's key on its own requests. A threat model (WP0.9) covers every boundary: imported productions and models, learner text sent to the Prompter, sidecars and the browser version. Linux is not in the first release (decided 18 Oct 2026).

**How StoryStage 2 reaches each device**

| Device | Delivered as | Prompter | Where the key lives | To check |
| --- | --- | --- | --- | --- |
| Windows and Mac | Tauri desktop app | Yes | Windows Credential Manager, or macOS Keychain | Code signing, so Windows doesn't warn on install |
| iPad | Tauri iOS app, deployed by the school's device management | Yes | iPad Keychain | Apple developer account and App Store review |
| Chromebook | Tauri Android app, where the school allows Android apps | Yes | Android Keystore | How well 3D runs in an Android app on a low-end Chromebook; add it to the trials |
| Any device, nothing installed | Browser version | No | Not stored | Nothing extra |

A settings file is never used for the key: any program running as the same user could read it. This is the same reason the current version avoids Alice's preferences store.

## 5. The core journey: Storyboard, Production stage, Screening room

The storyboard and the scenes live together in a new StoryStage production file, and every frame links to one block of code. Each storyboard scene is a real, separate scene with its own backdrop, cast and camera. The production plays them in the storyboard's order. This follows the decision of 17 Oct 2026: StoryStage has its own format and doesn't need to stay openable in plain Alice.

*[Diagram: storyboard to code links · two scenes. Not exported; see the interactive version in the Claude Docs original.]*

The storyboard's scene order becomes the production's running order. Each scene card is a scene of its own, and each frame card is tied to one block both ways.

### What the learner sees

The core sequence is three tabs, used in order: **Storyboard**, **Production stage** (the scene view, with Backstage and the Code editor) and **Screening room**. A scene's code can't be started until that scene has been storyboarded (decided 17 Oct 2026).

**Storyboard**

- The script opens with the title, a one-sentence **logline** and a short **synopsis**. Then come the arc template (free, 3-part or 5-part, plus curriculum templates after the mapping) and the scenes.
- **Scenes:** a strip of scene cards. Each card has a scene heading (place and time), the cast, its arc part and its transition.
- **Script against scenes:** a script pane beside the boards. Action and dialogue lines sit under each scene heading, each line can be pinned to a frame, and dialogue carries the character's name, so it can become a speak line block. Fountain import and export.
- **Frames illustrated by drag and drop:** black-and-white sketches are dragged onto each frame from a 2D library that mirrors Backstage (Cast, Props, Set, Backdrops), plus storyboard marks (speech bubbles, movement and camera arrows, text). Each frame records a **shot type** (wide, medium, close-up, over-the-shoulder, follow, two-shot), which the smart-camera blocks use later. No import of outside drawings (decided): every sketch stands for a model, so the stage can be set from the frames.
- **Backstage from the Storyboard:** because learners can't bring in their own drawings, the sketch library opens Backstage in a side panel. If a character, prop or piece of set is missing, the learner searches the whole catalogue there and, if the class allows imports (section 7), brings in a model; its sketches appear in the library straight away. Where imports are off, the learner places a **stand-in**: a labelled outline ("dragon") that works on frames and on the stage, keeps its code when the real model replaces it, and goes on a list for the teacher.
- **Status on every frame:** Planned, then Staged, then Coded, then Rehearsed, and whether the learner or the Prompter wrote its code.

**Production stage**

- **The scene view:** drag Cast, Props, Set and Backdrops from Backstage onto the stage; move, rotate, resize, pose joints, and place cameras and markers.
- **The Code editor** as its second view, in two versions in the first release, Blocks and Tiles (section 6), with a read-only text view beside it.
- Opening a scene for the first time offers to **set the stage from the storyboard**: "Set up this scene from your storyboard? 3 characters, 2 props, a forest and a medium shot." The learner chooses **Place everything**, **Choose what to place** (a tick list) or **Not now** (a Set up from storyboard button stays in the toolbar). Each sketch on the scene's first frame becomes its model, roughly where it was drawn, facing the way it was drawn; cast who appear only in later frames wait just off stage, ready to enter; the backdrop comes from the backdrop sketch or the scene heading ("Forest, night"); and the camera matches the first frame's shot type. Stand-ins are placed as outlines. It is one undo, needs no Prompter, and sets up the scene, not code. If the storyboard gains new cast later, the stage offers to add them.
- Clicking a frame selects its block, and selecting a block highlights its frame. During Rehearse, a frame strip follows along.

**Screening room**

- Plays the **rough cut**: the whole running order with its transitions, at live speed, with jumps between scenes and the frame strip alongside.
- **Compare:** a frame's sketch beside a still from the rough cut, and notes per scene for retakes.
- **Export for distribution:** an MP4 rendered frame by frame at a fixed rate, so it plays smoothly even when made on a slow device, with a title card from the title and logline, end credits, and a captions file from the script's dialogue. In the first release (decided). Later, the same button offers an AR pack, a mixed-reality film and Export for projection (section 8).

### What the teacher does

Every step of the teacher's journey now has an owner in the workplan (WP24); the two open choices are decided at M1, after watching real lessons (WP1.11).

1. **Install** the app through the school's device management, and set the school lock (policy).
2. **Start a class:** choose the default code editor and whether the Prompter is on.
3. **Pupils return to their own work next lesson**, even on shared devices, and can't see each other's productions. Where the work lives (in-app class folders, a device profile per class, or school accounts) is decided in WP24.2.
4. **The Prompter, if used,** reaches the group by the route decided in WP24.3, within class caps the teacher can see.
5. **Collect the films** from the Screening room, and **export the study logs** if the class is in the study.
6. **Mark** using the storyboard PDF and frame coverage (planned, coded, by whom).

### The 2D sketch library mirrors Backstage one to one

The library has one sketch for every model in Backstage, generated from the 3D models rather than drawn by hand. Backstage will hold MakeHuman people, the commissioned storybook cast, Kenney models, museum scans and, if CMU agrees, Alice's own models (about 340 classes: 225 props, 42 bipeds, 39 quadrupeds, 14 flyers and smaller groups). No hand-drawn set could keep up.

- **How:** a tool renders each glTF model in Babylon.js as a black outline on white, in four facings (front, three-quarter, side and back) and, for characters, two or three standard poses. That is roughly 1,500 sketches, made again whenever a model is added; the same renderer runs in the app for imported models.
- **One sketch per model,** not per colour variant. Each sketch carries the model's Backstage id, such as `Quadruped/Cat/AbyssinianCat`.
- **Same sections as Backstage:** Cast, Props, Set and Backdrops, plus a small hand-made set of storyboard marks.
- **Why one to one matters:** a sketch on a frame is a casting choice. Placing a sketch already chooses the model, so the Production stage can set the cast in place. The Prompter also knows who is in each frame and where they stand from the storyboard text alone, with no picture sent to Anthropic.
- **Risk:** some models will read poorly as small outlines, so budget a manual touch-up pass.

### How the links work

| Storyboard item | Becomes in the production | Link kept by |
| --- | --- | --- |
| Production | A `.storystage` file: a zip holding the program, every scene, `storyboard.json`, the script (`script.fountain`) and the frame layouts | The file |
| Logline and synopsis | The title card and the production's description on export | The script |
| Scene | A scene type of its own, such as ForestScene, with its own backdrop, cast, lighting, camera, camera markers and script method | The scene's id, stored in the storyboard |
| Script line | A pinned frame; dialogue later becomes a speak line block | The frame's id |
| Frame | A do in order block in that scene's script method, headed by a comment such as `// Frame 2.3: the owl hands over the key` | The block's id, with the comment text as a fallback after copy and paste |
| Shot type on a frame | A smart-camera block that frames its targets (wide, close-up, follow and so on) | The frame's id |
| Sketch on a frame | The matching Backstage model in that scene's cast, placed roughly where it was drawn | The Backstage id |
| Scene order | The production's running order: scene 1, then scene 2, and so on | Reordering the cards reorders the running order, as one undoable edit |
| Transition | Cut, fade to black or crossfade, chosen on the scene card | The running order |
| Jump to a scene | A go to scene block, for interactive and branching stories, which Alice's "Design Process: Interactive Narrative" lesson teaches | The block and the scene's id |

**Why separate scenes.** Only the scene being played or edited is loaded, which matters on 4 GB PCs (TR1 measured 380 MB for one world with two models). Each scene has its own backdrop, so a beach and a forest don't have to share one world. Scenes can be reordered, copied between productions, or shared out to different pupils in a group.

When links break: a frame with no block shows "not coded yet". A block whose frame was deleted keeps its code, and its frame comment is marked "no frame". Nothing is deleted automatically.

### What carries over from Alice

StoryStage 2 contains no Alice code, but this design follows an idea Alice 3 already had and never finished. Its scene editor lists every scene field on the Program class, each generated scene saves and restores its state when switched out (`handleActiveChanged`), and `SProgram.setActiveScene` switches scenes at run time.

New in StoryStage 2:

- scenes as separate types, each with its own backdrop, cast and camera, and a scene list;
- the running order and transitions, held at the production level;
- the go to scene block;
- loading only the active scene, and preloading the next;
- the `.storystage` format.

**Alice files:** StoryStage 2 opens existing Alice `.a3p` worlds as one-scene productions (WP9), so Alice's lessons and starter projects still have a way in. A teacher can relax the storyboard rule for imported worlds.

### What the Prompter adds

- **Story coach** (Explain only): asks questions that help with the logline and synopsis (who wants what, and what stops them), and offers the arc template. The learner writes every word.
- **Script check:** points out frames with no script line and characters who never speak. It never writes lines.
- **Stage a scene** (Build it): places the cast from the frame sketches and builds the backdrop and camera. Setting the stage is where building for the learner saves the most time.
- **Code a frame** (Show me how), **with a plan first:** the Prompter proposes a short plan in plain words; the learner edits it; only then are blocks built, one step at a time (below).
- **Explain a check:** when the automatic check (below) flags a difference, the learner can ask the Prompter why, and for a plan to fix it.
- **Context:** the script, and the sketches on each frame, are added to every request as text. The Prompter knows who is where without any picture being sent.

### Plan before change

The learner agrees what will happen before any code changes: the Prompter proposes the steps, the learner edits them, and only then are blocks built. The idea comes from Roblox Studio's Planning Mode (April 2026), adapted for learners.

**An example.** Frame 2.3 has a sketch of the owl by the tree and the cat on the right, the script line "OWL: Here is the key", and the shot type medium. The learner presses Show me how, and sees:

1. The owl walks to the tree.
2. The owl turns to face the cat.
3. The owl says "Here is the key."
4. The cat jumps.
5. Hold for 1 second.

The learner swaps steps 3 and 4 (the cat should jump first), changes "jumps" to "spins", and adds "The camera moves closer". Then they press **Build these steps**: each step becomes blocks in turn, highlighted as it lands, with the step's words kept as a comment above its blocks. The whole build is one undo.

**Why it matters:**

- **The learner makes the decisions.** Without a plan, Show me how is something to watch; with one, the learner decides the order, the actions and the details before any code exists. It protects the principle that the work is the learner's.
- **It teaches the thinking behind code.** Breaking an action into ordered steps is decomposition and algorithm design, which the computing curriculum asks for. The plan is pseudocode in plain words, and comparing it with the blocks shows how one becomes the other.
- **Mistakes are caught before they're built.** If a step can't work ("the dragon isn't in this scene"), the plan says so before anything changes, not after.
- **Teachers see the learner's choices.** The agreed plan and the learner's edits are saved with the frame, so a teacher can see what the learner changed, which is evidence for marking.
- **A stricter option.** In **Plan only** mode (a teacher setting), the Prompter writes and revises the plan, but the learner builds every block themselves and ticks the steps off.
- **Lower cost.** Plans are short text, so they can come from the lower-cost model.

### Automatic check against the storyboard

StoryStage can rehearse a frame by itself and tell the learner where the result differs from the storyboard, with no Prompter and no network needed. The idea comes from Roblox Studio's automated playtesting, adapted to storyboards.

- **Where:** "Check this frame" and "Check this scene" in the Production stage; "Check the whole production" in the Screening room, which also runs before export.
- **How:** the scene runs offscreen in deterministic mode, and StoryStage compares the scene's state with the frame: who is on screen; left-to-right order and rough position against the sketch; which way each character faces; whether the shot framed its targets; whether each pinned line was said; how long the frame lasted against its plan; and errors, endless loops or characters leaving the camera.
- **The report:** a checklist on the frame card, such as "Owl ends on the left; your sketch has it on the right" or "Line 2.3 is never said". Each item links to the block and the sketch, and the frame gets a new status, Checked.
- **Why it matters:** learners get instant feedback that ties their code back to their plan, without waiting for the teacher, and practise testing and debugging, which the curriculum asks for. Because it doesn't use the Prompter, it works in the browser version and for whole classes at no cost.

For the teacher, the storyboard prints to PDF (WP10.7), and frame coverage (planned, coded, by whom) becomes the learning record proposed in the journey design.

## 6. Two code editors, then one

The first release ships two code editors that learners can switch between at any time, and a pilot study decides which one continues (decided 18 Oct 2026). The move from Alice's tiles to Blockly had not been tested against how Alice's tiles teach, so the plan tests it in classrooms instead of assuming it.

|  | **Blocks** (option B) | **Tiles** (option C) |
| --- | --- | --- |
| What it is | Blockly (Apache-2.0, maintained by the Raspberry Pi Foundation since November 2025) with a custom look | Alice 3's tile editor, rebuilt in React |
| How code looks | Text-like statement rows, not jigsaw pieces | Statement rows, as in Alice |
| No broken code | Loose blocks switched off; default values in every slot | Native: arguments asked for on drop |
| Alice's habits | Arguments on drop, "add detail", switch a statement off, one method per tab | All of them, natively |
| Accessibility | Blockly's keyboard plugin; screen-reader support planned by its maintainers | Keyboard and screen reader built in from the start |
| Cost | Lowest; most of it exists | About eight extra weeks in its own lane (WP7c) |

**What both share:** one program underneath and the same edit operations, so switching never loses or converts anything; the same undo, Rehearse highlighting and Prompter; and a read-only text view whose wording switches between Python-like and Java-like, following Alice's two formatters. Parity tests drive each editor's own interface through the same tasks and check that the programs match.

**The study, in the pilot** (WP7.13, WP19.5 to 19.8):

1. The teacher sets each class's default editor, alternated between classes so the groups are comparable; learners can still switch.
2. Three to five built-in study tasks, the same in both editors.
3. A pseudonymous log stays on the device, under a random id per session (editor, switches, task success, time, undos, help requests); the teacher exports it. Nothing is sent automatically.
4. Information sheets, parental consent for under-16s, the DPIA updated, and ethical review if a university partner can provide it.
5. Measures pre-registered and the decision rule co-designed with the pilot teachers: **task success** first (the program reaches a checkable end state, checked by the runtime), then time to success and preference, including the cost of keeping two editors. Error counts aren't used, because Tiles prevents invalid edits by design. An editor that fails the accessibility checks can't be the only one.

**Why it's worth testing:** Alice's text-like tiles have evidence behind them for the move to Java. In Dann and colleagues' study (SIGCSE 2012), students taught Alice first, then Java, averaged about 82 to 85% on the same Java test against 61% for an earlier Java-only course, with the caveat that the student groups differed. Blockly brings maintenance, touch and familiarity from Scratch at primary school.

## 7. Backstage: Cast, Props, Set and Backdrops

Backstage is the library of 3D models (renamed from "gallery", 18 Oct 2026). Each model has one home section, and search covers all four.

| Section | What goes in it | Main sources |
| --- | --- | --- |
| **Cast** | Anything that can act: people, animals, creatures | MakeHuman people (CC0), 100Avatars humanoids (CC0, VRM), Kenney and KayKit characters (CC0), the commissioned storybook cast, Alice's animals if CMU agrees |
| **Props** | Things characters pick up, use or ride: objects, tools, vehicles, signs and text | Kenney, Poly Pizza (CC0), museum scans (CC0), Alice's props |
| **Set** | Scenery that stays in place: buildings, trees, rocks, rooms | Kenney, Poly Pizza, museum scans, Alice's scenery |
| **Backdrops** | Ground, sky, lighting and fog, from Alice's starting templates | Built in, with CC0 skies and ground textures from Poly Haven and ambientCG |

- **No Sims 2 models** unless EA gives written permission: their licence allows use only unmodified and with programs written with Alice 3.0, and StoryStage 2 is neither (WP17.7).
- **Not in the shipped catalogue:** Mixamo (its files can't be redistributed) and general Sketchfab models (licences vary, some non-commercial). Quaternius only if its current licence allows redistribution inside StoryStage.
- **A recognisable cast:** 12 to 20 public-domain storybook characters (for example Alice, Sherlock Holmes, Robin Hood, Anansi), commissioned as original designs, each cleared for trade marks and later illustrations first (WP3.6, WP17.8).
- **One skeleton vocabulary:** humanoids use VRM bone names, mapped to H-Anim, so one animation library plays on every character; animals keep Alice's joint sets, published as an open extension (StoryStage2-crosswalk.md).
- **The same sections everywhere:** the sketch library, the Prompter's catalogue and the film credits all group models as Cast, Props, Set and Backdrops.

### Storyboard sketches from the models

Every model's black-and-white storyboard sketches are drawn from the model itself, not sourced separately, so sketch and model always match. StoryStage renders the model offscreen as a dark outline with a few interior lines on white, in four facings (front, three-quarter, side, back) and, for characters, two or three standard poses. The same renderer runs when the library is built and inside the app, so imported models get sketches too. Learners don't import outside drawings (decided); when something is missing, they open Backstage from the Storyboard and bring in a model, or use a stand-in (section 5).

### Bringing in new models

Backstage ships with a curated catalogue: every item licence-checked, within the device budget, mapped to the skeleton vocabulary, with sketches, and suitable for children. A class can start with no network. On top of that, a teacher can let models be imported:

- **Who:** a teacher setting, `backstage.import`: off, teacher only (the default), or learners. Imports go into the class's Backstage, not the shipped catalogue.
- **What happens on import,** on the device with no server: the file is checked; reduced to fit the device (fewer triangles, smaller textures) with the open-source glTF Transform library; a character's skeleton is mapped to the vocabulary, or it becomes a "prop only" if it can't be; and its sketches are drawn. A plain-words report shows what changed, for example "Reduced from 180,000 to 12,000 triangles; textures from 4K to 1K". glTF, GLB, VRM and OBJ files are accepted; FBX files are converted first.
- **Licences, as a skill:** the learner records where the model came from and its licence. Credits for CC BY models go into the film's credits automatically. Non-commercial or "not sure" models can be used in class but can't go into the industry exports or public distribution, and the app says why.
- **No open gallery browsing inside the app:** big model sites aren't moderated for children. An optional search of Poly Pizza's CC0 models only (`backstage.search`, off by default) will be decided after the data protection impact assessment.

## 8. Beyond the first release

One production can reach an audience four ways, and each teaches something different: a film is directed through a camera, while in AR and projection the audience chooses where to look. These strands start after the release candidate (only their spikes run earlier), so they don't compete with the first release for your review time, and ship in release 1.1.

| Strand | What learners get | Work package |
| --- | --- | --- |
| **Cinema** | MP4 export with a title card, credits and captions | WP11 (first release) |
| **AR design mode** | Place the set on a real table, walk round it and rehearse; Android through WebXR, iPad through a native ARKit plugin | WP21 |
| **AR for audiences** | Watch a production as a tabletop or life-size play in the StoryStage apps; an AR pack (GLB for Android, USDZ for iPad, a web page and QR codes) that opens without StoryStage; a mixed-reality film | WP22 |
| **Projection mapping** | Stage a production on a real object, preview it with virtual projectors, project it in class, and export it for Pixera (or the free MapMap) | WP23 |
| **Pathway to industry tools** | "Under the hood" names in the text view; export to Unreal, Unity and Godot; a pathway guide to UK games, screen and live-event careers | WP20 |

**Limits worth knowing:** Google's Scene Viewer plays only a model's first animation and works best under about 10 MB; Pixera runs only on Windows with an NVIDIA graphics card, and its project file format isn't published, so Export to Pixera is a package plus a build script and a one-page operator guide.

**Safeguards across all of them:** camera images never leave the device and never go to the Prompter; recording mixed-reality film is off unless a teacher allows it; AR packs default to first-name or anonymous credits; a flashing check runs before every export.

*[Diagram: StoryStage 2 roadmap · 4 releases. Not exported; see slide 10 of `docs/slides/StoryStage-architecture.pptx` and workplan section 6b.]*

**AR trails** (release 2) pin productions to places: a history trail round the school grounds, or a museum or heritage-site trail. Visitors find a printed marker or reach a location and the scene plays there. They start in the apps (browsers can't yet track images), markers come before GPS, and location is checked on the device only, never stored or shared.

**To consider for StoryStage 2.1 (release 1.1): a soundtrack.** Should learners be able to import, or create, music and sound effects for their scenes? Questions to settle first:

- **Import:** music and effects from CC0 and Creative Commons sources (for example Freesound), with the same licence capture and automatic credits as Backstage. Commercial music is the hard case: a school's licences may cover use in class, but not a film shared beyond the school.
- **Create:** a simple loop and pattern maker inside StoryStage, music made in free tools such as Chrome Music Lab or BandLab and imported, or AI-generated music (with its own licence and safeguarding questions).
- **Where it lives:** a sound track per scene in the Screening room, with fades and music lowered automatically under dialogue, plus sound-effect blocks tied to frames; music shown in captions.
- **Fit:** it builds on the voice-over and lip sync item (release 1.2), so the two should be planned together.

## 9. Delivery plan

On estimated durations, with about eight Claude Code sessions in parallel, the release candidate is ready on 26 Feb 2027 and the pilot ends on 9 Apr 2027. Week 0 is Monday 19 Oct 2026. The estimates are rough; `schedule.py` regenerates the dates as real durations are measured.

- **26 work packages, 13 milestone gates (M0 to M12).** Milestones are gates, not phases: each work package starts as soon as its own dependencies are done, so several milestones are in progress at once.
- **Contracts and a threat model first.** Shared interfaces and stub packages (WP0.8), including a fake stage and the editor contract, let the runtime, Story API, Storyboard, Prompter and both editors start without waiting for each other; the threat model (WP0.9) comes before any file import or key handling.
- **Critical path:** repository and contracts, spikes, stage core, Story API blocks, Production stage, storyboard links and story coach, gate tests, release candidate, pilot. A slip anywhere on it moves the release; everything else has slack.
- **Long lead times start on day one:** classroom observation, the CMU and EA letters, the storybook-cast commission, interface mock-ups, curriculum mapping, code signing and app-store accounts.
- **Later strands wait:** AR, projection mapping and the pathway start after the release candidate and finish by about 13 May 2027, for release 1.1.
- **Capacity is measured, not assumed:** the first two weeks record actual durations and your review hours, and the plan is recalibrated at M1. Parallel sessions run in the cloud, not on the 4 GB development PC.

| Parallel sessions | Release candidate | Pilot ends |
| --- | --- | --- |
| 8 (recommended) | week 18.5 (26 Feb 2027) | week 24.5 (9 Apr 2027) |
| 6 | week 22 | week 28.5 |
| 5 | week 25.5 | week 32 |
| 4 | week 30 | week 36.5 |

More than eight sessions doesn't help: the dependencies set the pace. Your reviews and decisions are the real limit, so six may be the practical choice. A six-week pilot from late February runs into the Easter holidays; either allow for the break or start in the summer term.

*[Diagram: Milestone gates by earliest date · 13 gates. Not exported; see `docs/slides/StoryStage2-gantt.pptx` and workplan section 5a.]*

The gates cluster in February because so much runs in parallel; the full work-package schedule is on the one-slide Gantt chart (StoryStage2-gantt.pptx).

## 10. Risks and decisions for you

The biggest risks are licences for the familiar models, performance on low-end school devices, and your own review time; each has a fallback.

| Risk | Effect | Response |
| --- | --- | --- |
| CMU won't confirm Alice's models; EA won't permit the Sims | Fewer familiar models | MakeHuman people, the storybook cast, Kenney and museum scans (WP3.5 to 3.7) |
| Low-end Chromebooks or iPads too slow | Poor experience where schools need it most | Spikes measure first (WP1); quality settings; smaller models |
| Android apps blocked on school Chromebooks | No Prompter there | The browser version still works; managed Play for schools |
| Your review time with many parallel sessions | The critical path slips | Cap the sessions at what you can review; small pull requests; contracts reviewed first |
| The Tiles editor runs late | The study has one editor | Its own lane with about 3 weeks of slack; fall back to study schools only |
| Learners stay with the default editor | The study can't decide | Alternate defaults between classes; measure task performance, not just preference |
| The Prompter writes the learner's story | Defeats the storyboard's purpose | Story-coach rules, a "doesn't write the story" test category, the Explain-only lock |
| A script inside the app uses the key for its own requests | Cost, and unfiltered chat outside the Prompter's rules | The native layer checks every request against an allowlist and caps (15.2); threat model (0.9); human security review before the pilot |
| A shared production tells the Prompter to break its rules | Story-coach rule undermined | Learner text sent as delimited data (13.2); a prompt-injection test category (13.7) |
| The Prompter costs too much for a whole class, or the key can't reach a class set | Prompter limited to small groups | Routes A to C (24.3); simpler modes on a lower-cost model; whole classes use StoryStage without the Prompter |
| Pupils lose work, or see each other's, on shared devices | Lost lessons; privacy breach | Decide where work lives (24.2) before saving is built; save banners in the browser version (8.4) |
| A bad update reaches every school device mid-term | Lessons disrupted | Pilot and stable channels, version pinning, staged rollout, a rollback drill (15.7) |
| AR and projection viewers' limits | Exports simpler than the production | Bake one clip per scene; size checks before export; the full production plays in StoryStage |

**Decisions for you:**

- [x] Drop Linux from the first release (decided 18 Oct 2026)
- [ ] Approve or rewrite the purpose and vision statements (section 1), and settle the age range
- [ ] Watch two or three TR1 lessons and talk to two school IT managers (WP1.11)
- [ ] Interview five teachers on the job they'd hire StoryStage for (WP16.7)
- [ ] Decide how the Prompter reaches a group: clubs and home, a classroom relay, or keys by device management (WP24.3, at M1)
- [ ] Decide where a pupil's work lives between lessons on shared devices (WP24.2, at M1)
- [ ] Choose the reference Chromebook and iPad (WP1.1)
- [ ] Send the CMU and EA letters (WP17.1, 17.7)
- [ ] Set the budget for the storybook cast commission (WP3.6)
- [ ] Record your review hours for the first two weeks, then confirm how many parallel sessions you can review (WP1.12, section 9)
- [ ] Approve the editor study design, co-designed with pilot teachers, and look for a university partner (WP19.5, 19.6)
- [ ] Arrange a human security review of the key handling before the pilot
- [ ] Choose the pilot window around the Easter holidays
- [ ] Decide who runs StoryStage after the pilot: maintainer, funding and support (for example a university partner, an education charity, or a relationship with CMU's Alice team)
- [ ] Find a Windows PC with an NVIDIA card, or a venue partner, to test Export to Pixera (WP23)
- [ ] Buy code-signing certificates and open the Apple and Google developer accounts (WP15.4, 15.5)

## Appendix: background research, 17 October 2026

These reviews were written on 17 Oct 2026, before StoryStage 2 was planned in detail. They are kept as the evidence behind the decisions. Where a later decision changed one, sections 1 to 10 say so: most importantly, the code editor is now two editors with a study (section 6), and the model library is Backstage (section 7).

### A1. The comparison note, checked

The note gets each product's general shape right, but four facts are wrong or out of date. Two products may no longer be available in full, and one licence has changed.

| Product | What the note says | What I found | What StoryStage should take |
| --- | --- | --- | --- |
| [Alice 3](https://github.com/storystage/storystage) | Fully open source; plans scene states step by step; no AI or speech | The code is under a BSD-style CMU licence, but it bans "Alice" in a fork's name, and the Sims 2 art is EA-licensed for non-commercial use only. Alice has **no storyboard tool**: storyboarding is paper-based in its lessons. Only one scene per world is exposed, and teachers use camera-jump workarounds | The base itself. Its unused multi-scene support is covered in section 4 |
| [Storytelling Alice](https://www.cs.cmu.edu/~caitlin/research.htm) (not in the note) | — | CMU research version for middle-school girls: a "back of the DVD box" pitch, then scenes, then 6–9 frames per scene. It added character-level animations and Stencils, tutorials overlaid on the real interface (26% faster, fewer mistakes than paper) | **The model for the storyboard**, and Stencils-style guidance as a Prompter mode |
| [CoSpaces Edu](https://forum.edu.delightex.com/t/coding-with-python-in-cospaces/3214) | Speech-to-text; CoBlocks, JavaScript, Python | CoBlocks, TypeScript/JavaScript, and Python since 2022. I found no evidence of built-in speech-to-text; it should be treated as unconfirmed | A path from blocks to typed code, which Alice's "Java Code On The Side" view already starts |
| [Krikey AI](https://www.krikey.ai/) | Text or voice prompt to animation | Text or video to animation, automatic lip sync, AI voices in 20+ languages, MP4/FBX export, a school offering; free tier and US$15/month Pro | Lip sync on dialogue and **film export**, both done on the PC |
| Plotagon Story | Script to 3D movie | Plotagon Studio has been discontinued and its servers shut down ([user forum](https://forums.justuseapp.com/en/post/3ZAN5LHSZ6/shutdown-permanently)). The phone app's status is unclear | Script-to-scene: dialogue lines become say blocks with timing. A warning about depending on a vendor's servers |
| Scratch | Native speech-to-text; core code BSD/Apache | The editor moved to **AGPL-3.0** ([Scratch Foundation](https://scratchfoundation.org/open-source-license); reported Nov 2024; the scratch-gui and scratch-vm repos now carry AGPL). I could not confirm a speech-to-text extension in Scratch's standard extension library | Remix culture and one-click sharing. Not its code |
| [Toontastic 3D](https://en.wikipedia.org/wiki/Toontastic_3D) | Free; 3- and 5-part story arcs | Removed from the iOS App Store in 2022; Android availability unconfirmed. I found nothing open-sourced | **Story-arc prompts** (beginning, middle, end, or setup, conflict, challenge, climax, resolution) as storyboard templates, and voice-over recorded while the scene plays |

Three lessons run through all of these. First, the products that let children make films (Toontastic, Plotagon, Krikey) hide the code. The products that show the code (Alice, Scratch, CoSpaces) have no real story-planning tools. **StoryStage can be the one tool that does both.** Second, two of the six have shut down or shrunk because they depended on a company's servers. StoryStage's design (runs on the PC, the user's own key, ordinary blocks) protects against that. Third, none of them links the story plan to the finished film. That link is what section 4 designs.

### A2. Open-source parts we could use

Of the six products in the note, only Scratch publishes usable code, and its AGPL-3.0 editor is a web app in JavaScript. Lifting parts of it into a Java desktop fork would cost more than it saves. The table below lists parts that do fit StoryStage. Licences were checked in each project's repository on 17 Oct 2026, unless marked.

| Part | Licence | What it would do in StoryStage | Fit |
| --- | --- | --- | --- |
| [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync) | MIT, dependencies permissive | Turns a recorded or spoken line into mouth shapes over time. Alice's bipeds, flyers and quadrupeds already have a mouth joint (`getMouth()`), so the timings can become ordinary turn blocks on that joint | Good: a separate command-line program, like whisper.cpp. Needs a check of how well a jaw-only mouth looks |
| [Kokoro TTS](https://github.com/hexgrad/kokoro) | Apache-2.0 | More natural voices for the Prompter and for characters' dialogue, recorded into the world as audio | Possible: an 82-million-parameter model. Test speed on the 4 GB PC before adopting |
| [Piper](https://github.com/OHF-Voice/piper1-gpl) | GPL-3.0 (active, last commit 15 Oct 2026) | The same job as Kokoro, already named as "later option" in the proposal | Only as a separate program; GPL needs care in an EULA-licensed bundle |
| [Fountain](https://fountain.io/) | Open plain-text format | The storyboard's script: scene headings, action, character and dialogue lines that a child or teacher can also type in Word. StoryStage imports and exports it | Good: no code dependency, and it opens in screenwriting apps |
| JCodec | BSD 2-clause (checked 17 Oct 2026) | Pure-Java MP4 export from the Screening room. Alice 3.9.1 has no working video export, so this is new | Good: needed for Export for distribution. FFmpeg is the fallback |
| openhtmltopdf | Already bundled in Alice (`PrintPdfOperation`) | Prints the storyboard as a PDF for display or marking, at no extra cost | Already there |
| [Storyboarder](https://github.com/wonderunit/storyboarder) | Unclear: no licence file, an EULA in the build, and a README pointing to a blog post. Last commit June 2022 | Design ideas only: boards generated from a script, a 3D "shot generator", camera-angle suggestions, animatic timing | Inspiration, not code |
| [Blockly](https://github.com/google/blockly) | Apache-2.0 (active) | Only relevant if a later StoryStage moves to the web | Not for the Java fork |

The main speech parts are already chosen: whisper.cpp for input, system voices for output. Rhubarb and a recorded voice-over would close the biggest gap the note shows against Toontastic and Krikey, characters who speak with moving mouths, without adding a server.

### A3. How this fits the earlier plans

The note's ideas mostly extend plans already made rather than replace them. The one genuinely new layer is the production: a storyboard and several scenes above a single world. The earlier plans are the [Claude in Alice proposal](https://claude.ai/artifact/PinTBu8FKteWAW1MCiFz94) (15–16 Oct), the workplan's "later releases" and today's learner-journey design.

| Earlier idea | Where it came from | What the note adds | Status |
| --- | --- | --- | --- |
| Stage 3, "Write code": procedures, teacher mode, starter projects | Proposal; workplan §1 | Each storyboard scene becomes a procedure, so writing procedures has a story reason | Builds on |
| Tweedle import, so Claude can write whole methods | Proposal; workplan | Needed for script-to-scene (Plotagon): a scene's dialogue built as one method | Builds on |
| Paper planning stays the learner's own work | Journey design, stages 1–3 | Puts the storyboard inside the app (Storytelling Alice), but still drawn and written by the learner. Frames are illustrated with a 2D sketch library that mirrors the 3D gallery | Changes it: the plan moves into the app |
| Story coach that asks, never writes | Journey design (proposed) | Toontastic's arc templates give the coach its questions | Builds on |
| Learning record for the teacher | Journey design (proposed) | Storyboard coverage (which frames are coded, by the learner or by the Prompter) is a natural, privacy-light record | Builds on |
| Piper as a later, nicer voice | Proposal, Voice | Kokoro (Apache-2.0) is a licence-simpler alternative; character voices and lip sync are new | Extends |
| Spoken, captioned steps; accessibility gap for screen readers | Proposal; spec 03 | Voice-over recording and lip sync add a new way to make a film without much drag-and-drop | Extends |
| "Show me how" | Spec 01; TR1 | Stencils-style overlays that highlight the real control, from Storytelling Alice | Extends |
| macOS/Linux bundles, public website | Workplan | Sharing a finished film (MP4) for showing and sharing, like Scratch | Extends |
| One world, one scene | Alice 3.9.1 as shipped | Multi-scene productions with cuts and a running order | **New** |

Nothing in the note conflicts with the fixed decisions in the workplan: the user's own key, no StoryStage server, three off switches, and ordinary undoable blocks. The design below keeps all four.

### A4. Platform choices, as reviewed on 17 October 2026

Agreed on 17 Oct 2026: StoryStage 2 goes ahead in this direction, with four changes. Make it StoryStage 2, a rewrite that keeps the ideas and the Prompter design, rather than an upgrade of the fork. Decide it before the storyboard is built in Java, so nothing is built twice. Keep the Java fork running for the TR1 pilot until StoryStage 2 can replace it.

The four changes:

- **Keep Alice's own models:** convert them to glTF instead of replacing the whole gallery.
- **Deliver it as an app on every device, so the API key stays in the device's secure store, with an optional browser version that has the Prompter switched off.**
- **Pick React,** not React or Svelte.
- **Filter out the network voices.**

| Move | Verdict | What I found |
| --- | --- | --- |
| 1. UI in React or Svelte | Yes: choose **React** | A larger contributor pool than Svelte, and maintained integrations for both Blockly and Babylon.js. Supporting both would double the work |
| 2. Web first, plus a Tauri desktop shell | Yes | Tauri 2 builds desktop (Windows, macOS, Linux), iOS and Android apps from the same web code. The key goes in the OS credential store, not a settings file, and the Claude calls are made from the app's native layer, so no script in the page can read the key. Linux's WebKitGTK has no WebGPU, so the shell falls back to WebGL2 there |
| 3. Chromebooks and iPads | Yes, but **through the app, not the browser** | In a plain browser the key would sit in browser storage, where any script on the site could read it. Anthropic named the header that allows browser calls `anthropic-dangerous-direct-browser-access`. So the Prompter runs only in the app: on iPads as a Tauri iOS app, and on Chromebooks as a Tauri Android app where Android apps are allowed. The browser version keeps everything except the Prompter, and the "no StoryStage server" decision stands |
| 4. Babylon.js | Yes; its licence is **Apache-2.0, not MIT** | Still permissive, and actively developed (last commit 16 Oct 2026). WebGPU runs on Chrome and ChromeOS since version 113 and on iPadOS 26. WebGL2 covers older devices |
| 5. glTF, with a new CC0/CC-BY library | Yes to glTF; **change the library plan** | Kenney is CC0 and ships glTF. Quaternius now issues packs under its own licence (QAL v1.0), which bans redistributing them as a standalone pack, and its main character pack isn't offered as glTF. Better first step: convert Alice's own models (about 340, CMU-licensed per the proposal) to glTF and drop only the Sims models. That keeps the named joints (head, mouth, arms) that blocks and the Prompter rely on, keeps `.a3p` import, and keeps the 1:1 sketch library. Then add CC0 characters, with budget for rigging |
| 6. Blockly, strictly typed, with a text view | Yes | Apache-2.0 and translatable. Typed connections plus StoryStage's own checks keep the "can't build a broken program" feel. Keyboard access comes from a separate plugin still in development (last commit Apr 2026), so accessibility needs testing, not assuming |
| 7. Typed AST as JSON, a text view, an interpreter in a Web Worker | Yes | Keep node ids stable, because the Prompter and the storyboard links depend on them. The worker sends commands to the stage, and a cooperative scheduler runs **do together**. A fixed time step also gives smooth MP4 export |
| 8. Prompter carries over | Yes | The tool schemas move almost unchanged. The block catalog is generated from the new API instead of Alice's annotations |
| 9. whisper.cpp in WebAssembly | Yes | MIT, with an official WebAssembly example. Test the tiny model's memory and speed on a 4 GB Chromebook and older iPads |
| 10. Browser speech synthesis | Yes, **with a filter** | Chrome's "Google" voices on desktop need the internet. Use only voices marked `localService`, and fall back to captions |
| 11. Local project zip; optional Google Drive or OneDrive | Yes | Each needs a registered sign-in app and consent screen. A web app likely used by children falls under the ICO's Children's code (15 standards), and edtech providers may be in scope, so do a data protection impact assessment before launch |
| 12. Vitest, Playwright, a built-in self-test | Yes | Keep the 47-request evaluation set and the self-test. Playwright can run the 3D stage in CI with software rendering |

Sources for this section: [Babylon.js](https://github.com/BabylonJS/Babylon.js), [whisper.cpp](https://github.com/ggml-org/whisper.cpp), [Tauri plugins](https://github.com/tauri-apps/plugins-workspace), [Blockly keyboard navigation](https://github.com/google/blockly-keyboard-experimentation) (licences and last commits checked 17 Oct 2026); [WebGPU support (web.dev)](https://web.dev/blog/webgpu-supported-major-browsers); [browser speech voices (Readium)](https://readium.org/speech/docs/WebSpeech.html); [Claude API browser access (Simon Willison)](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access); [ICO Children's code](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code); [free rigged characters guide (Cinevva)](https://app.cinevva.com/guides/free-rigged-3d-character-models).

## Sources

- software\_comparison.md (the handover note, read 17 Oct 2026)
- [storystage/storystage](https://github.com/storystage/storystage), commit 325c73d: `AbstractSceneEditor.java`, `BootstrapUtilities.java`, `SProgram.java`, `CodeOrganizer.java`, `XmlProjectIo.java`, `PrintPdfOperation.java`, `SBiped.java`, docs/spec, docs/WORKPLAN.md, TR1 results
- [Claude in Alice proposal](https://claude.ai/artifact/PinTBu8FKteWAW1MCiFz94) and [StoryStage Learner Journeys](https://claude.ai/artifact/WdjoYYAFRhiZE9J5cDHMen)
- [Caitlin Kelleher, Storytelling Alice research](https://www.cs.cmu.edu/~caitlin/research.htm)
- [Alice teachers list: scene changes in Alice 3](https://lists.andrew.cmu.edu/pipermail/alice-teachers/2015-April/002715.html)
- [Scratch Foundation: AGPL licence](https://scratchfoundation.org/open-source-license)
- [Toontastic 3D (Wikipedia)](https://en.wikipedia.org/wiki/Toontastic_3D)
- [Plotagon shutdown thread](https://forums.justuseapp.com/en/post/3ZAN5LHSZ6/shutdown-permanently)
- [Krikey AI](https://www.krikey.ai/)
- [CoSpaces coding forum thread](https://forum.edu.delightex.com/t/coding-with-python-in-cospaces/3214)
- [Storyboarder 2.0 (CG Channel)](https://www.cgchannel.com/?p=116167)
- Repositories checked for licences: [Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync), [Kokoro](https://github.com/hexgrad/kokoro), [piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), [Blockly](https://github.com/google/blockly), [Storyboarder](https://github.com/wonderunit/storyboarder), [scratch-gui](https://github.com/scratchfoundation/scratch-gui)
- [Fountain](https://fountain.io/)

Added 18 Oct 2026, for sections 1 to 10:

- StoryStage2-workplan.md, StoryStage2-crosswalk.md, StoryStage-architecture.pptx and StoryStage2-gantt.pptx (18 Oct 2026)
- [Mediated Transfer: Alice 3 to Java (Dann et al., SIGCSE 2012)](https://www.alice.org/wp-content/uploads/2017/04/MediatedTransfer.pdf)
- [Raspberry Pi Foundation: the new home for Blockly](https://www.raspberrypi.org/blog/new-home-for-blockly/)
- [VRM 1.0 humanoid specification](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/humanoid.md)
- [HAnim 2.0 (ISO/IEC 19774) concepts](https://web3d.org/documents/specifications/19774/V2.0/Architecture/concepts.html)
- [MakeHuman licence FAQ](https://static.makehumancommunity.org/oldsite/faq/can_i_sell_models_created_with_makehuman.html)
- [Google: Scene Viewer](https://developers.google.com/ar/develop/java/scene-viewer)
- [Apple: AR Quick Look](https://developer.apple.com/augmented-reality/quick-look/)
- [WebXR browser support (May 2026)](https://www.testmuai.com/learning-hub/webxr-compatible-browsers/)
- [Pixera: supported file formats](https://pixera.helpjuice.com/supported-file-formats)
- [Pixera: system requirements](https://pixera.helpjuice.com/project-management/pixera-system-requirements)
- [Pixera: API commands](https://pixera.helpjuice.com/api-commands)
- [MapMap (GPL-3.0)](https://github.com/mapmapteam/mapmap)
- [Unreal Engine: importing glTF](https://dev.epicgames.com/documentation/unreal-engine/importing-gltf-files-into-unreal-engine)
- [Unity glTFast](https://github.com/Unity-Technologies/com.unity.cloud.gltfast)

Added for "Where StoryStage 2 sits" (18 Oct 2026):

- [Common Sense Education: CoSpaces Edu review](https://www.commonsense.org/education/reviews/cospaces-edu)
- [Minecraft Education per-user licence listing](https://secureframe.com/marketplace/microsoft/minecraft-education-per-user/education)
- [Minecraft Education: Prompt Lab, Copilot and Code Builder](https://new.minecraft.net/en-us/blog/prompt-lab-2)
- [Digital Schoolhouse and Roblox classroom programme (Aug 2026)](https://gamedev.net/news/5043-ukie-backed-digital-schoolhouse-partners-with-roblox-to-provide-suite-of-tools/)
- StoryStage2-board-review-visionaries.md and StoryStage2-board-review-code-bench.md (18 Oct 2026)

Licence of [JCodec](https://github.com/jcodec/jcodec) checked in its repository on 17 Oct 2026. The gallery counts come from `core/models` in the StoryStage repository.
