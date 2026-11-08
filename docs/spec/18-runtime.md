# 18 Runtime

- **Covers:** The interpreter's rules: time, order, values, events, limits, and the points spike 1.4 left for WP6
- **Work package:** WP6
- **Owner:** S2
- **Status:** written for WP6. The code it governs is `packages/runtime`.

## 0. Decisions this spec relies on

- [0010 Language](../decisions/0010-language.md): an interpreter in a Web Worker, with a scheduler for do together.
- Spike [1.4](../decisions/spike-1.4-scheduler.md): a cooperative, discrete-event scheduler, and the six design rules in `docs/spikes/REPORT.md`.
- `01-ast.md`, `02-story-api.md`, and threat F7 in `15-security.md`.

## 1. Time and order

- Scene time is whole microseconds, so sums of durations never drift.
- Every run has a total order, **(time, thread number)**, so a program always gives the same commands, whether it's paced by the wall clock or by `advance`.
- A thread is a strand of the program. The entry method is one, each child of a `doTogether` or `eachTogether` is one, and each run of a listener is one. Children start in list order at the moment their parent reaches them. `doTogether` ends when its last child ends.
- Time passes only when a thread sleeps, in a Story API call. Everything else takes no scene time.
- **Asking the stage stops everything.** When a thread asks a question ("distance to"), no thread runs until the answer comes. It's slower than letting others run on, but the answer can't then depend on the order of messages, so runs repeat.

## 2. Values

A value is a number, text, true or false, nothing (`none`), an object, an enum value, a joint, or a list. Objects are equal if they're the same object; enum values if type and value match; joints if they're the same joint of the same object; lists only if they're the same list.

- **A joint** (`02-story-api.md` section 5) is an object and one of its joints, `{ kind: 'joint', object, joint }`. The Story API's blocks turn, roll and point it, but it doesn't move (decision 0051). `getJoint` makes one from a `JointId` without asking the stage, so a joint the model hasn't got is the stage's `unknown_joint` when a block uses it (the editor says `noSuchJoint` before that). `getJointChain` asks the stage (`jointChain`) and gives the chain's joints from the root out, or an empty list. Both are the runtime's (`runs: 'runtime'`), in `JOINT_LIBRARY`; anything else is a `bad_value` fault at the block, and an answer to another question a `protocol` fault.
- **A field with `initial: null`** is the scene object of that name, until something is assigned to it. Assigning changes which object the field holds, as in Alice.
- **A field with a value** is worked out the first time it's read, on each object separately.
- **`and` and `or` stop early,** as in Alice.
- **What a program can't do** is a `bad_value` fault at that block: divide by zero, go off the end of a list, do arithmetic on something else, call anything on nothing, count a number that isn't whole, or end a function without a return.

## 3. Calls

- **A parameter left out** gets its default, worked out in the called method.
- **Arguments** are worked out in sorted order, so the order doesn't depend on how the program was built.
- **Story API calls** go to a `StoryLibrary`: one function per block, which emits stage commands, sleeps, asks the stage and returns a value. A question (`yield { kind: 'ask', query }`) resumes with the stage's whole answer, a `StageQueryResult` such as `{ kind: 'distance', value: 2.5 }`, not its `value` alone. WP4.3 supplies it (S3): `STORY_LIBRARY` in `@storystage/story-api`, which fits the runtime's type as it is. A block refuses a value it can't use by throwing `StoryFault`, and the runtime reports that as a `bad_value` fault at the block, with the block's own words in `detail`, whether it refuses straight away or after waiting. The runtime holds only what the catalog marks `runs: 'runtime'`. A block nothing runs yet is an `internal` fault at that block.
- **Random numbers** come from the run's seed, so deterministic runs repeat (WP6.5).

### 3.1 Ending a scene (WP8.3)

Agreed with S4 on 8 Nov 2026. The player's side, which decides what plays next and how, is `03-production-format.md` section 3.1 (`playback.ts`). The runtime only reports which block ran.

- **`load` names the production's scenes,** in `scenes`. A scene in code is text (`02-story-api.md` section 3a), so the runtime can check it against this list.
- **`goToScene(scene)`, `crossfade(scene; duration)` and `fadeToBlack(; duration)`** each end the run at once: every strand stops, including blocks alongside in a do together, and no more of the scene's code runs. A block in a listener does the same, which is how a story branches.
- **The worker** sends the commands so far, then `sceneChange` with the scene time and a `RuntimeSceneEnding`. Nothing follows it: no `finished`, no `stopped`. `RuntimeSceneEnding` is the production's `SceneEnding` without `finished`, declared here because the runtime can't depend on `production`.
- **Defaults and faults.** `duration` defaults to 1 second. An unknown scene, a scene that isn't text, or a negative duration is a `bad_value` fault at that block.
- **The next scene** comes in a new `load`, which the same worker accepts after a scene change, a stop or a fault. It starts afresh, at scene time 0. Nothing carries over between scenes: each is its own type.
- **A scene that ends by itself** is the player's to see, from `finished`. The runtime sends nothing more.

The catalog still marks the three blocks `runs: 'needs:sceneChange'`. They're the runtime's now, so S6 can mark them `runs: 'runtime'`.

## 4. Limits

So that a program can't hang the app (WP6.3, F7). Each is a fault at the block concerned, and Stop always works, by ending the worker.

| Limit | Value | Fault |
|---|---|---|
| Turns of one loop with no time passing | 100,000 | `infinite_loop` |
| Statements and loop turns at one moment of scene time, across all threads | 1,000,000 | `time_slice` |
| Calls in progress in one thread | 200 | `recursion_limit` |
| Characters in one text | 1,000,000 | `bad_value` |

A loop that takes time can run for ever: that's a film of a spinning windmill. A fault stops the whole run, as an exception does in Alice, and the studio explains it in plain words with the block highlighted.

## 5. Events

Listeners are those of the scene's type (`02-story-api.md` section 6). Their `args` and `details` are read once, as the run starts.

- **`sceneStart`** listeners and **timers** start with the entry method. A timer waits its seconds, fires, and repeats. It must be above zero.
- **Stage events** are handled at the worker's present, not at their `at`, which may be slightly behind it because the worker runs ahead of the clock.
- **A click** runs `clickOnScreen` first, then `clickOnObject`, if it hit an object in `setOfVisuals` (or any object, if there's no `setOfVisuals`). Both get the click's `x` and `y`: fractions of the picture from its left and bottom edges, as the stage gives them.
- **A key** runs `keyPress`, then `numberKeyPress` or `arrowKeyPress` if it's a digit or an arrow, then `moveWithArrowKeys` for an arrow. Under `moveWithArrowKeys`, up and down move the object 0.25 m and left and right turn it a sixteenth of a turn, each over 0.25 seconds. Holding an arrow keeps it going, because the browser repeats the key.
- **`heldKeyPolicy`.** The browser repeats a held key, so the stage sends `key` again and again, then `keyRelease`. A key's first `key` since its release is a press, and the rest are repeats. `fireMultiple` (the default) fires on the press and every repeat, `fireOnceOnPress` on the press only, and `fireOnceOnRelease` on the release only. Each key is followed separately.
- **`multipleEventPolicy`:** `ignore` drops a firing while the last run is going, `enqueue` runs it afterwards, and `combine` runs it at once alongside.
- **`collisionStart`, `collisionEnd`, `proximityEnter` and `proximityExit`** match their sets either way round, and hand over `a` from `setA` and `b` from `setB`. A proximity listener fires only for the stage events at its own `distance`.
- **`viewEnter` and `viewExit`** fire for an object in their `set`, handing it over as `model` (decision 0051).

**What the stage watches.** Proximity and view tests cost something on every frame, so the stage tests only what it's told (`Stage.watch`). As the run starts, once the listeners' arguments are read, the worker sends `watch`, before any commands:

- one proximity watch (`a`, `b`, `distance`) for each `proximityEnter` or `proximityExit` listener;
- one view watch (`objects`) for each `viewEnter` or `viewExit` listener.

It's sent even when it's empty, so the main thread can always hand it on. A distance below zero, or a set that isn't a list of objects, is a `bad_value` fault at the listener. Collisions need no watch.

## 6. What spike 1.4 left open

| Question | Answer |
|---|---|
| Reading the scene back | Section 1: everything waits for the answer. The worker can't run ahead of a question, so a program that asks a lot runs close to the clock |
| Moving while turning | The stage's answer, not the runtime's. Commands are relative and additive, as the spike's rule 4 says; the stage works out the path (`stage-commands.ts`) |
| Events while the last run is going | `multipleEventPolicy` (`02-story-api.md` section 6): `ignore` by default, as in Alice |

## 7. Tests

| Rule | Test | Level |
|---|---|---|
| Time, order, asking, faults, stop | `scheduler.test.ts` | Unit |
| Every statement and expression kind, values, calls, limits, determinism, highlighting | `interpreter.test.ts`: small programs, each run and checked | Unit (the semantics suite) |
| `STORY_LIBRARY` fits, runs, and its refusals are bad values at the block (section 3) | `story-faults.test.ts` | Unit |
| The worker's protocol, both modes, pause, speed, every event kind, `heldKeyPolicy` and the `watch` message (section 5) | `serve.test.ts`, over `inMemoryPorts` | Unit |
| Ending a scene: the message, stopping every strand, defaults, faults, and loading the next scene into the same worker (section 3.1) | `serve.test.ts`, "ending a scene" | Unit |
| The TR1 evaluation programs in StoryStage 2 AST (the WP6 done-when): the 21 rows of `docs/eval/requests.jsonl` that build code, and the `penguin-animated` start. Each passes its row's code checks, is valid, and runs on `STORY_LIBRARY` sending the commands it should, `anim-06`'s head turn included | `tr1.test.ts` | Unit |
| Joints: `getJoint` and `getJointChain` through `serve`, on the Story API's blocks | `joints.test.ts` | Unit |
| Fast-forward to a block (WP6.4) | With WP7.4, which drives it through fixed-step `advance` | Unit |
