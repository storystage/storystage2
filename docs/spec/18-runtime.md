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

A value is a number, text, true or false, nothing (`none`), an object, an enum value, or a list. Objects are equal if they're the same object; enum values if type and value match; lists only if they're the same list.

- **A field with `initial: null`** is the scene object of that name, until something is assigned to it. Assigning changes which object the field holds, as in Alice.
- **A field with a value** is worked out the first time it's read, on each object separately.
- **`and` and `or` stop early,** as in Alice.
- **What a program can't do** is a `bad_value` fault at that block: divide by zero, go off the end of a list, do arithmetic on something else, call anything on nothing, count a number that isn't whole, or end a function without a return.

## 3. Calls

- **A parameter left out** gets its default, worked out in the called method.
- **Arguments** are worked out in sorted order, so the order doesn't depend on how the program was built.
- **Story API calls** go to a `StoryLibrary`: one function per block, which emits stage commands, sleeps, asks the stage and returns a value. WP4.3 supplies it (S3). The runtime holds only what the catalog marks `runs: 'runtime'`. A block nothing runs yet is an `internal` fault at that block.
- **Random numbers** come from the run's seed, so deterministic runs repeat (WP6.5).

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
- **A click** runs `clickOnScreen` first, then `clickOnObject`, if it hit an object in `setOfVisuals` (or any object, if there's no `setOfVisuals`).
- **An arrow key** runs `keyPress`, then `arrowKeyPress`, then `moveWithArrowKeys`. Under `moveWithArrowKeys`, up and down move the object 0.25 m and left and right turn it a sixteenth of a turn, each over 0.25 seconds.
- **`multipleEventPolicy`:** `ignore` drops a firing while the last run is going, `enqueue` runs it afterwards, and `combine` runs it at once alongside.
- **`collisionStart` and `proximityEnter`** match their sets either way round, and hand over `a` from `setA` and `b` from `setB`.

**What the stage contract doesn't have yet,** for the `contract` pull request of `02-story-api.md` section 9 (S3, S6):

| Gap | Until then |
|---|---|
| A click's `x` and `y` | Handlers get 0 |
| A key's release, for `heldKeyPolicy` | Each `key` event fires, as `fireMultiple` does |
| `collisionEnd`, `proximityExit`, `viewEnter`, `viewExit` (decision 0051) | Nothing fires them |

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
| The worker's protocol, both modes, pause, speed, and every event kind the contract can fire | `serve.test.ts`, over `inMemoryPorts` | Unit |
| The TR1 evaluation programs in StoryStage 2 AST (the WP6 done-when) | With WP4.3, once the blocks they use run | Unit |
| Fast-forward to a block (WP6.4) | With WP7.4, which drives it through fixed-step `advance` | Unit |
