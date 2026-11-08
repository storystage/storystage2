# 14 Editors

- **Covers:** The editor contract, options B and C, the switch, parity through the interfaces, study mode and its pseudonymous data
- **Work package:** WP7, WP7c
- **Owner:** S5 (option B) and S6 (option C, the switch)
- **Status:** sections 1, 2 and 3a–3h written by S6, 8 Nov 2026, before the code they govern (WP7c). Section 2 is built in `@storystage/story-api/editing`; 3b, 3d (moving), 3f and 3g are built, read-only, in `packages/tiles`. Section 2 is shared, so S5 reviews it. Section 3i is S5's (option B, WP7.2, 7.6). Sections 4 to 6 come with WP7t (7.11–7.13).

## 0. Decisions this spec relies on

[0009 Blocks](../decisions/0009-blocks.md) (two editors over one program), [0036 Languages](../decisions/0036-languages.md) (words in translation files), [0044 Mock-ups approved](https://github.com/storystage/storystage2/blob/lane/d-decisions-2026-10-25/docs/decisions/0044-mock-ups-approved.md) (in #70: the Tiles look follows Alice 3's grammar, with our own artwork, until Carnegie Mellon replies), [0051](../decisions/0051-joints-and-optional-events.md) (joints turn only), and [spike 1.5](../decisions/spike-1.5-editors.md) (one drop rule and one cascade for both editors; its seven findings). The screens are the Direction A handoff: 04, 04b and 04c for Tiles, 14 for the components (`docs/design/direction-a/`).

## 1. The editor contract

`packages/editor-contract/src/contract.ts` (WP0.8). S5 and S6 own it together, and a change to it is a `contract` pull request both review.

1. **The program belongs to the studio.** An editor shows it and proposes edits. It keeps no copy of its own beyond what it draws, so switching editors (7.11) keeps the program, the undo history and, through `ViewState`, the open method, selection and focus.
2. **Every change is one labelled step.** An editor sends edits with `host.apply(edits, label, id)`. The host validates them, with S2's rules and the Story API's `checkProgram` as `check` (spec 02, section 9a), and either makes them one undo step or refuses them all with a reason in plain words. The editor shows that reason where the learner acted.
3. **An editor redraws from `subscribe`,** whatever made the change: itself, the other editor, the Prompter, undo, redo, the stage or a load. It never assumes its own edit went through until the change arrives.
4. **Highlights** (`rehearse`, `error`, `prompter`) and **commands** (`delete`, `copy`, `paste`, `duplicate`, `moveUp`, `moveDown`, `toggleEnabled`, `addDetail`, `openMenu`) arrive from the studio and work on node ids, so they mean the same in both editors.
5. **`announce`** is the only way an editor speaks to screen-reader users (section 3f), so the studio keeps one live region.

## 2. The shared editing model

Spike 1.5 found that the rule for what may be dropped where, and the cascade that asks for values on a drop, can serve both editors (finding 1). They live in `@storystage/story-api/editing`, beside the metadata, so the two editors can't drift apart, and so the parity tests (7.12) test behaviour that isn't in either editor. **S5:** option B uses these for its connection checks, its cascade and its palette.

### 2.1 The palette

For the object the learner has chosen (a scene object, a joint, or the scene itself), the palette lists its blocks. They're in two tabs as in Alice: **Actions** (procedures) and **Questions** (functions).

1. **The learner's own procedures and functions come first,** for that object's class and its parents, then the Story API's.
2. **Categories follow Alice's methods panel,** with StoryStage's new blocks in categories of their own:

    | Tab | Category | Blocks |
    |---|---|---|
    | Actions | say, think | `say`, `think`, `speakLine` |
    | Actions | position | `move`, `moveToward`, `moveAwayFrom`, `moveTo`, `place` |
    | Actions | orientation | `turn`, `roll`, `turnToFace`, `orientTo`, `orientToUpright`, `pointAt` |
    | Actions | position and orientation | `moveAndOrientTo`, `moveAndOrientToAGoodVantagePointOf` |
    | Actions | size | `setWidth`, `setHeight`, `setDepth`, `resize`, `resizeWidth`, `resizeHeight`, `resizeDepth` |
    | Actions | appearance | `setPaint`, `setBackPaint`, `setOpacity` |
    | Actions | ride on | `setVehicle` |
    | Actions | timing | `delay` |
    | Actions | sound | `playAudio` |
    | Actions | sky and light | `setAtmosphereColor`, `setFromAboveLightColor`, `setFromBelowLightColor`, `setFogDensity` |
    | Actions | camera | `setVerticalViewingAngle`, `frameShot` |
    | Actions | words | `setValue` |
    | Actions | scenes | `goToScene`, `fadeToBlack`, `crossfade` |
    | Actions | body | `straightenOutJoints`, `foldWings`, `spreadWings`, `playAnimation`, `gesture`, `showExpression`, `lookAt` |
    | Actions | moving about | `walkTo`, `runTo`, `sitOn`, `standUp`, `lieDown`, `fall`, `enterFrom`, `exitTo` |
    | Actions | hands | `touch`, `reachFor`, `pickUp`, `putDown` |
    | Questions | joints | `getJoint`, `getJointChain` |
    | Questions | size | `getWidth`, `getHeight`, `getDepth` |
    | Questions | appearance | `getPaint`, `getBackPaint`, `getOpacity`, `getValue` |
    | Questions | where things are | `getDistanceTo`, `isFacing`, `isCollidingWith`, `getVehicle`, and `isAbove` and its family |
    | Questions | ask the audience | `getBooleanFromUser`, `getStringFromUser`, `getDoubleFromUser`, `getIntegerFromUser` |
    | Questions | sky and light | `getAtmosphereColor`, `getFromAboveLightColor`, `getFromBelowLightColor`, `getFogDensity` |
    | Questions | camera | `getVerticalViewingAngle` |

    The category is a field in the metadata, with its words in the strings file. A test checks every block has exactly one.
3. **Each palette tile shows its words with `???` for each parameter,** as Alice's palette does: "cat move ??? ???".

### 2.2 Slots and the drop rule

`canDrop(program, slot, candidate)` says whether something may go somewhere. Both editors ask it while dragging, so a refused place never lights up, and again on drop.

1. **Statement slots** are the `body`, `then` and `else` lists of a method, listener or control statement. Only statements go there, and only inside a method or listener: nothing floats loose on the canvas.
2. **Value slots** are a block's parameters and details, a control statement's condition, count or list, an assignment's value and a local's start. A value goes there only if its type fits the slot's (`fits`, as in `checkProgram`), or if its type can't be known.
3. **S2's rules apply as well:** no `return` in a listener or inside "do together", and no variable outside its scope. `canDrop` asks `validateProgram` on the result, with `checkProgram`, rather than repeating those rules.
4. **A refusal has words.** `canDrop` returns the reason, and the editor announces it ("2 can't go there: it needs an object").

### 2.3 The cascade

When a block lands, the learner is asked for each parameter in order, as Alice's cascading menus do: "Who? Which way? How far?". `emptySlots(node)` says which values to ask for, in order, and `cascadeFor(program, place, mint)` gives the menu for one of them. Escape at any point cancels the whole drop, and nothing changes.

| Type | Menu |
|---|---|
| A class (`Biped`, `Thing`) | The scene's objects of that class, by name; then for each jointed one, a submenu of its joints; then `this` where it fits |
| A value type (`MoveDirection`) | Its values, in its words |
| `Number`, `WholeNumber` | Alice's common values (0.25, 0.5, 1, 2, 5, 10 for a number; 1, 2, 3, 5, 10 for a whole number), then "Other number…". Variables and parameters of that type in scope come after |
| `Text` | "Other words…", then text variables in scope |
| `Boolean` | true, false, then the questions that give true or false |
| `Paint` | The colours, then Backstage surfaces |
| A list | The lists of that type in scope, then "a new list…" |

1. **Only values that fit appear,** so a cascade answer can never be refused.
2. **A slot keeps a sensible default** where Alice has one (an `amount` of 1, a `direction` of forward), so a block is never left with an empty slot after the cascade.
3. **"add detail ▾"** lists the details the block hasn't been given, each opening its own cascade.

### 2.4 Labels

Every step's undo label is written from the Story API's words, naming what changed (CLAUDE.md, rule 9): "Make cat say Hello", "Add cat move forward 1", "Move cat say Hello into do together", "Change 1 to 2 in cat move". The words come from the strings file, so a translated interface translates its undo labels too. S2's `defaultLabel` is the fallback.

### 2.5 What's in `editing/`

| Function | What it does |
|---|---|
| `palette(program, target, self, tab)` | Section 2.1: groups of blocks, each with its `callee` and its words with `???` |
| `newCall`, `newControl` | A new block from the palette or the control bar, with every value empty (`none`) |
| `canDrop(program, place, candidate)` | Section 2.2: the edits and their label, or the reason it can't go there. `candidate` is a new statement or value, or `{existing: id}` to move a statement |
| `emptySlots`, `cascadeFor`, `answer`, `rangeAt` | Section 2.3: what to ask, the menu for each value, a typed value checked against its limit |
| `detailsToAdd` | The details a block can still take, for "add detail ▾" |
| `labelFor(program, edit)` | Section 2.4 |
| `describer(program)` | Any statement or value in words (`cat move forward 1`), its short name (`cat move`), and its type, for rows, screen-reader names and labels (section 3f) |

The joints in a cascade come from the caller (`jointsOf`), because which joints a model has is in the manifest, not the program. Backstage surfaces, sounds, scenes and clips come the same way (`references`).

**Not yet:** the control bar's **variable** and **assign** tiles, which need a name or a target before they can go in (they come with the tile editor's control bar), and a fresh name for a loop's item, so that a loop inside a loop isn't refused for both being called `item`.

## 3. Option C, the tile editor

`packages/tiles` (S6). It rebuilds the behaviour of Alice 3's tile editor in React (workplan WP7c), over section 2. The look is screens 04, 04b and 04c, with the handoff's colours (darker blue and green than Alice's, for 4.5:1 contrast) and our own artwork. The word "Alice" never appears in it.

### 3a. Layout

1. **Methods panel,** on the left: an object picker ("owl ▾", with its figure), the Actions and Questions tabs, and the palette in categories (section 2.1).
2. **Code area:** one tab per method or listener. The open method's header reads like its declaration: "owl.myFirstMethod" or "when the scene starts".
3. **Control tiles bar,** above the code: do in order, count, while, for each in, if, do together, each in together, variable, assign and comment.

### 3b. Tiles

1. **Statement rows read like code,** left to right: the target, then the block's words with each value in a pill. Values in pills are tiles themselves, so a function can go in a slot.
2. **Containers** (do in order, do together, count, while, for each, if/else) draw their body inside them, indented, with their own header row.
3. **An empty statement list** shows "drop statement here" in a dashed box 44 px high.
4. **A switched-off statement** is greyed, with a dashed outline, and its name ends "(switched off)". It's still saved (`setEnabled`). This differs from the handoff's 45% opacity, which takes the tile's words below 4.5:1, for the same reason the handoff darkened Alice's blue.
5. **Colours:** action tiles blue, question tiles green, control tiles as the handoff draws them, and "add detail ▾" in lavender.

### 3c. Pointer and touch

1. **Drag from the palette** puts a copy in the program; **drag from the program** moves the tile. The original stays in the palette.
2. **The drop line is an overlay,** with a "Drops here" pill. It never resizes the program while dragging, so nothing shifts under the pointer or finger (spike finding 5).
3. **A ghost** of the tile at 60% opacity follows the pointer.
4. **A place that refuses the tile never lights up** (section 2.2).
5. **Dropping anywhere else** cancels, and the tile goes back.
6. **Every target is at least 44 × 44 px,** for iPad and for young hands. Touch drags the same way, after a short press so that scrolling still works.

### 3d. Keyboard

Every path works without a pointer (7.8):

| Key | In the program |
|---|---|
| Tab, Shift+Tab | Between the methods panel, the control bar and the program |
| ↑ ↓ | To the previous or next statement, into and out of containers |
| ← → | Between a statement's value pills, and out to its row |
| Enter | Opens the cascade for the pill in focus, or "add detail ▾" |
| Space | Picks up the statement; ↑ ↓ then move the drop line; Space puts it down; Escape puts it back |
| Delete | Deletes the statement, with an undo label to bring it back |
| Ctrl+D, Ctrl+C, Ctrl+V | Duplicate, copy, paste (the contract's commands) |
| Ctrl+/ | Switches a statement off or on |

In the palette, Enter on a block inserts it after the statement in focus, or in the empty slot, then runs its cascade. Focus is always visible, with the handoff's ring on Tiles surfaces.

### 3e. Values

Enter or a click on a pill opens its cascade (section 2.3), upward if there's no room below. Choosing a value is one undo step ("Change forward to backward in cat move"). "Other number…" and "Other words…" open a small text field, and the value is checked against the parameter's limit (spec 02, section 2, rule 4) before it's applied.

### 3f. Screen readers

1. **The program is a tree:** `role="tree"`, with each statement a `treeitem` at its nesting level, and roving focus. Screen readers say "2 of 5" and the level from `aria-posinset`, `aria-setsize` and `aria-level`.
2. **Each statement's name is the words it shows,** details included: "cat move forward 1 how long 2". A speech-control user says what they see, so a name never differs from the visible words (WCAG 2.5.3).
3. **A container's tree item is its header row,** so its name is "do together", not its statements too. The box around it is only drawing (`role="none"`), and its statements' group sits beside the header.
4. **Each pill is named by its value and described by what it's for:** "1", described as "amount".
5. **Announcements** through `host.announce` say what happened, in the same words as the undo label, and say where focus is if it moved: "Moved cat say Hello into do together".

### 3g. Highlights

Through the contract (7.9): Rehearse outlines the running statement (a still outline when the learner has asked for reduced motion); an error marks the statement in the stop colour with the error's words beside it; the Prompter's highlight carries its AI badge. Several kinds can show at once.

### 3h. Performance

1. **Rows are render functions keyed by node id,** never components defined inside the editor, so an update doesn't remount them and lose focus (spike finding 7).
2. **An edit redraws only what changed:** a program is immutable and shares what didn't change (spec 01), so a row whose node is the same object is skipped.
3. **A method of 500 statements** stays responsive: a keystroke or drop draws within 100 ms. It's tested in CI, then on the reference Chromebook (7.10).

### 3i. Option B, Blocks

_For S5 (WP7.2, 7.6)._

## 4. The switch

_With WP7t (7.11)._

## 5. Parity through the interfaces

_With WP7t (7.12)._

## 6. Study mode and its pseudonymous data

_With WP7t (7.13)._

## 7. Tests

How each rule in this spec is tested, and at which level (`09-testing.md`).

| Rule | Test | Level |
|---|---|---|
| 2.1: every block in one category, the learner's own first, words with `???` | `packages/story-api/src/editing/palette.test.ts` | Unit |
| 2.2: statement and value slots, types, S2's rules, refusal words | `packages/story-api/src/editing/drop.test.ts` | Unit |
| 2.3: each type's menu, only values that fit, defaults, add detail | `packages/story-api/src/editing/cascade.test.ts` | Unit |
| 2.4: labels in plain words | `packages/story-api/src/editing/labels.test.ts` | Unit |
| 3b–3c, 3e: tiles, drops, cascade, switched off | `packages/tiles/src/*.test.tsx` | Component (Vitest, happy-dom) |
| 3c–3f: pointer, touch and keyboard paths; screen-reader names; axe with WCAG 2.2 AA | `packages/tiles/e2e/*.e2e.ts` | End to end (Playwright) |
| 3g: highlights through the contract | `packages/tiles/src/editor.test.tsx` | Component |
| 3h: 500 statements | `packages/tiles/e2e/performance.e2e.ts`, then the reference Chromebook | End to end, then device |
| 3f: a manual screen-reader pass (NVDA, VoiceOver on iPad) | `docs/test/` script | Manual |
