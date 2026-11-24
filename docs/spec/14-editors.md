# 14 Editors

- **Covers:** The editor contract, options B and C, the switch, parity through the interfaces, study mode and its pseudonymous data
- **Work package:** WP7, WP7c
- **Owner:** S5 (option B) and S6 (option C, the switch)
- **Status:** sections 1, 2 and 3a–3h written by S6, 8 Nov 2026, before the code they govern (WP7c). Section 2 is built in `@storystage/story-api/editing`; 3a–3h are built in `packages/tiles`, except the object picker's figures (3a.1), which wait for the stage's thumbnails, and the Chromebook run of 3h.3 (7.10). An error's words beside its statement (3g) came with the contract's `HighlightMark` (#233); the **variable** and **assign** tiles and fresh loop item names (2.3) on 10 Nov 2026. Section 2 is shared, so S5 reviews it. Section 3i written by S5, 8 Nov 2026, before its code (option B, WP7.2, 7.6). Section 4 written by S6, 17 Nov 2026, before its code (WP7t, 7.11); S5 reviews it, as the switch sits in the Code editor. Section 5 written by S6, 17 Nov 2026, before its code (WP7t, 7.12); S5 reviews it, as its tests drive Blocks. Section 6 written by S6, 17 Nov 2026, before its code (WP7t, 7.13, with 24.6), with the owner’s four choices that day; S5, S8, S2, S7 and D review it.

## 0. Decisions this spec relies on

[0009 Blocks](../decisions/0009-blocks.md) (two editors over one program), [0036 Languages](../decisions/0036-languages.md) (words in translation files), [0044 Mock-ups approved](https://github.com/storystage/storystage2/blob/lane/d-decisions-2026-10-25/docs/decisions/0044-mock-ups-approved.md) (in #70: the Tiles look follows Alice 3's grammar, with our own artwork, until Carnegie Mellon replies), [0051](../decisions/0051-joints-and-optional-events.md) (joints turn only), [0064](../decisions/0064-no-loose-blocks.md) (a block dropped outside a method goes back, in both editors), and [spike 1.5](../decisions/spike-1.5-editors.md) (one drop rule and one cascade for both editors; its seven findings). The screens are the Direction A handoff: 04, 04b and 04c for Tiles, 14 for the components (`docs/design/direction-a/`).

## 1. The editor contract

`packages/editor-contract/src/contract.ts` (WP0.8). S5 and S6 own it together, and a change to it is a `contract` pull request both review.

1. **The program belongs to the studio.** An editor shows it and proposes edits. It keeps no copy of its own beyond what it draws, so switching editors (7.11) keeps the program, the undo history and, through `ViewState`, the open method, selection and focus.
2. **Every change is one labelled step.** An editor sends edits with `host.apply(edits, label, id)`. The host validates them, with S2's rules and the Story API's `checkProgram` as `check` (spec 02, section 9a), and either makes them one undo step or refuses them all with a reason in plain words. The editor shows that reason where the learner acted.
3. **An editor redraws from `subscribe`,** whatever made the change: itself, the other editor, the Prompter, undo, redo, the stage or a load. It never assumes its own edit went through until the change arrives.
4. **Highlights** (`rehearse`, `error`, `prompter`, `link`) and **commands** (`delete`, `copy`, `paste`, `duplicate`, `moveUp`, `moveDown`, `toggleEnabled`, `addDetail`, `openMenu`) arrive from the studio and work on node ids, so they mean the same in both editors.
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
| A listener's list detail (which keys, which objects) | Each key or object, making a list of one, then the lists of that type in scope; no empty list |

1. **Only values that fit appear,** so a cascade answer can never be refused.
2. **A slot keeps a sensible default** where Alice has one (an `amount` of 1, a `direction` of forward), so a block is never left with an empty slot after the cascade.
3. **"add detail ▾"** lists the details the block hasn't been given, each opening its own cascade. A detail only the script sets (`fromScript`: the speak line's `line`, `06-speech.md` section 4.1) is never listed, and where a block has one, both editors show it as the words "from the script" (`words.fromScript`), not a value to change: Tiles as words in the row, Blocks as a fixed block that carries the line's id.
4. **Turning arrows on left and right** (owner, 16 Nov 2026, after Blockly's appearance guide and Blockly Games' maze): a turn's or a roll's left is drawn "left ↺" and its right "right ↻" (U+21BA, U+21BB), in both editors (on Tiles' pill and Blocks' value chip) and in the shared menus, as children often mix the two up. `arrowOf(type, value)` and `Choice.arrow` give the arrow. It is drawn only: a screen reader reads ↺ as "anticlockwise open circle arrow", so names, undo labels and the text view keep the plain words, and a speech-control user still says "left".
5. **A listener's keys or objects are chosen one at a time** (the owner, 24 Nov 2026, after S5 found in #672 that no editor could put a key in the list). Its detail's menu offers each key or object, and choosing one makes a list of one ("when space bar is pressed"). **"or ▾"** after the last adds another ("when W or up arrow is pressed"), offering those not chosen yet; an item's menu offers the others not chosen, and **Take … out**. Taking the last one out takes the detail out, so the editors never leave an empty list, which would never run. The shared edits are `itemChange` (change, add past the last, or take out with `null`), `addItemPlace` (where "or ▾" adds) and `listDetailOf` (story-api `editing`), each one undo step named by the item: "Add up arrow to when W is pressed", "Take W out of when W or up arrow is pressed".

### 2.4 Labels

Every step's undo label is written from the Story API's words, naming what changed (CLAUDE.md, rule 9): "Make cat say Hello", "Add cat move forward 1", "Move cat say Hello into do together", "Change 1 to 2 in cat move". The words come from the strings file, so a translated interface translates its undo labels too. S2's `defaultLabel` is the fallback.

### 2.5 What's in `editing/`

| Function | What it does |
|---|---|
| `palette(program, target, self, tab)` | Section 2.1: groups of blocks, each with its `callee` and its words with `???` |
| `newCall`, `newControl`, `newLocal`, `newAssign` | A new block from the palette or the control bar, with every value empty (`none`). A variable is made once it has a name and a type, and an assignment once it has its variable |
| `namesAt(program, place)`, `freshName`, `readyFor` | The variables a block at a place would see (with whether each may be changed); a name numbered until it's free; a new loop given an item name that's free where it goes |
| `canDrop(program, place, candidate)` | Section 2.2: the edits and their label, or the reason it can't go there. `candidate` is a new statement or value, or `{existing: id}` to move a statement |
| `emptySlots`, `cascadeFor`, `answer`, `rangeAt` | Section 2.3: what to ask, the menu for each value, a typed value checked against its limit |
| `detailsToAdd` | The details a block can still take, for "add detail ▾" |
| `itemChange`, `addItemPlace`, `listDetailOf` | Section 2.3, item 5: one of a list's items changed, added past the last, or taken out (a listener's last takes its detail out); where "or ▾" adds; whether a list is a listener's keys or objects |
| `labelFor(program, edit)` | Section 2.4 |
| `menuFor(program, node)`, `changeFor` | Section 2.6: a statement's menu, and the edit for each of its items |
| `describer(program)` | Any statement or value in words (`cat move forward 1`), its short name (`cat move`), and its type, for rows, screen-reader names and labels (section 3f) |

The joints in a cascade come from the caller (`jointsOf`), because which joints a model has is in the manifest, not the program. Backstage surfaces, sounds, scenes and clips come the same way (`references`).

**Variables.** The control bar's **variable** tile asks first for a name and what the variable holds (a number, a whole number, words, true or false, or an object), refusing a name that's empty, too long, not a name, or already in scope there (`namesAt`). Then the cascade asks what it starts as, like any value. The **assign** tile ("set") asks first which variable it sets, from those in scope that may change (not a loop's item or a constant), then its new value; where there's none it says so and puts nothing in. Escape at either question puts nothing in. A new loop's item takes a name that's free where the loop goes (`readyFor`: `item`, then `item2`), so a loop inside a loop isn't refused for both being called `item`.

### 2.6 A statement's menu

Both editors offer one menu for a statement (`editing/menu.ts`, moved there from Blocks on 17 Nov, when the parity tests found Tiles had no way to the commands by pointer). In order:
- **Switch off** or **Switch on**;
- **Add detail:** for each detail the block can still take, which asks for its value as "add detail ▾" does;
- **Take out** for each detail it has (never the script's line);
- **Move up** and **Move down**, where it can go;
- **Duplicate**;
- **Delete**.

Each is one step with the shared label, the same as the key for it (section 3d). Blocks opens it as Blockly's block menu (3i.7); Tiles on a row (3c.7). Both open it by right-click, by a long press on a touch screen, and from the keyboard.

## 3. Option C, the tile editor

`packages/tiles` (S6). It rebuilds the behaviour of Alice 3's tile editor in React (workplan WP7c), over section 2. The look is screens 04, 04b and 04c, with the handoff's colours (darker blue and green than Alice's, for 4.5:1 contrast) and our own artwork. The word "Alice" never appears in it.

### 3a. Layout

1. **Methods panel,** on the left: an object picker ("owl ▾", with its figure), the Actions and Questions tabs, and the palette in categories (section 2.1).
2. **Code area:** one tab per method or listener. The open method's header reads like its declaration: "owl.walkAround", or an event handler's words, "when the screen is clicked". In Tiles an event's header ends with **"add detail ▾"** while the event takes details it hasn't got (which keys, which objects, when a key is held), as a row does; Blocks has them in the event block's menu (24 Nov 2026: Tiles had no way to add one).
   - **A scene's script method reads "When the scene starts"** (the owner's choice, 21 Nov, through S3), on its tab, its header, its tree's name, Blocks' method block and wherever a drop says where it goes. The code keeps Alice's name for it, `myFirstMethod`: Alice import (spec 19), the text view, the AST's `newSceneType` and the Prompter's `Scene.myFirstMethod` are unchanged. The editors get the program, not the production's scenes, so it's told by name: `myFirstMethod` in a type extending `Scene`. `isSceneScript`, `methodTitle` and `methodTitleIn` in `@storystage/story-api/editing` give it, for Tiles, Blocks and the studio's tab row alike.
   - **"when the scene starts" isn't offered as a new event** in Tiles' "add event ▾" or the studio's New menu: the script method already is that, and two of them would give a learner two places for the same thing. A `sceneStart` handler a film already has (Alice import keeps one that does more than call `myFirstMethod`, spec 19 §5) reads **"also when the scene starts"** on its tab, header and block (`listenerWords`, the `listener.sceneStart` words). The event's own words, "when the scene starts", stay for the catalogue and the Prompter's plan steps. Agreed with S5, 21 Nov: no number on a second tab, which would read as a copy of the first.
   - **The text views show what runs it** (the owner, 21 Nov): above each scene's script method, the listener Alice's own code has, `when sceneStart():` calling `self.myFirstMethod()` (Python-like) or `this.onSceneStart(() -> { this.myFirstMethod(); });` (Java-like). StoryStage makes that call itself, so the program has no such listener; it's words only, and its lines belong to the method, so the method's text shown alone starts with them. Without it nothing in the text says what runs `myFirstMethod`, where real Python or Java would have to call it. The Prompter's program text (`programText`) is unchanged.
   - **The script isn't a block to call:** the palette's "your own" leaves it out, as a call would run the scene's script again, and from inside it would never end. A call a film already has reads "run “When the scene starts” again" after its target, as every call has one ("the scene run “When the scene starts” again" in Tiles; Blocks keeps its "this" slot). Alice import leaves out a kept `sceneStart` handler's call to it, with a line in the report, as StoryStage runs the script anyway and the call would run it twice (spec 19, section 6).
   - **Inputs** (decision 0074, workplan 7.14): a learner's procedure or function can take inputs, which Alice and the code call parameters. Learners see "input", with "parameter" in brackets where it's first offered ("Add an input (parameter)…"; the owner, 21 Nov). An input has a name, checked as a new method's is and against the method's own inputs, locals and loop items, and a type: a number, a whole number, text, or true or false. Adding one gives every call already in the code a starting value (1, 1, empty text, true), as Alice does, so the film still runs; removing one takes its value out of every call, and is refused while the method reads it, showing where. Each is one undo step ("Add input steps to waddle"), and New can add a method with its inputs as one. The scene's script takes none. Tiles shows a method's inputs after its name ("steps: whole number"), and a call has a pill for each; the text views show them as Python and Java would. The shared edits are `addParameter`, `renameParameter` and `removeParameter` (story-api `editing`), and the words are its `parameter.*` strings, so both editors say the same.
   - **A character's own moves** (decision 0074, workplan 7.14): the learner teaches the penguin to waddle, and every penguin in every scene can. As in Alice, each model has one class, named after it and extending its Story API class (`Penguin extends Animal`; "Penguin2" if another type has the name), made the first time it's taught, with every object of the model in every scene made of it (`retype`, spec 01 section 4.1), as part of the same undo step as the first move. The editor passes those objects' fields from the set-ups, as the program doesn't know models (`classFor`; `fieldTypeFor` gives an object added later its class). A model's class is the one its objects are of already, found from those fields, and its name only finds it the first time: a model's name can change, from a stand-in's label or a missing model's id to Backstage's own name, and the class stays. With the penguin chosen, "your own" offers its moves after the scene's; inside one, `this` is "this penguin" and its blocks are its Story API class's. A class of 3D text extends `TextModel`, and its objects' fields are `TextModel` until it has one (`typeOfClass`; format 1.10.0). New's "Move for penguin…" and the tab row are S5's (07 §7.3).
   - **A block's sound** (decision 0076, workplan 7.17): `playAudio`'s sound is chosen from the film's sounds, the shelf's and the learner's own, by label ("Splash"), and written as what a music cue's `sound` holds, an imported clip's id (`sn1`) or a shelf sound's Backstage id (spec 03 section 1.7), as text, as Story API section 8 has it. The block shows the label. With no sounds yet, the menu says so ("No sounds in this film yet. Add one in Sound, from the shelf or your own.") rather than opening empty. The studio gives the editors its sounds and labels (`references` and `referenceWord` in the editing model's options) and refuses to remove an imported sound the code still names, showing where (`soundUses`). A sound the film no longer has plays as silence (spec 03 section 1.7). A sound is worded by the place it's for, so a block not in the film yet and the undo label of the choice show the label too, and words that only look like an id don't.
   - **An input left at its default** reads as the default ("rex hop height 2"), in the describer's words and so in the palette, rows' names and undo labels. Only an input with no value and no default reads "???".
   - **A click listener names what's clicked** (the owner, 23 Nov 2026): with its `setOfVisuals` detail it reads "when cat is clicked", or "when cat or chair is clicked", in the describer's words and so in tab names and undo labels, and Tiles' row has a pill for each object. With none chosen it reads "when an object is clicked", as a click on anything runs it. **An empty list** (from a film made before 24 Nov, since the editors no longer make one) reads as the event too, "when an object is clicked", and the program check marks it: "No objects chosen, so this never runs. Choose one, or take the setting out." (`noObjectsChosen`; `noKeysChosen` for keys; the owner, 24 Nov 2026). Tiles shows its pill after the event's words, to choose one. A listener detail with a phrase of its own (`listener.<event>.<detail>`) takes it.
   - In the studio, the Code editor's own tab row and its New menu (S5, 07-ux §7.3) serve both editors, so under it Tiles draws no tabs and no "add event ▾" of its own (WP7t, agreed with S5 on 16 Nov); it opens a method through the contract's `openMethod`. Tiles keeps its own tabs on its test page.
3. **Control tiles bar,** above the code: do in order, count, while, for each in, if, do together, each in together, variable, assign ("set") and comment.
4. **Undo and redo are the studio's:** Tiles has no Ctrl+Z or Ctrl+Y of its own and lets them reach the studio's window handler, outside its text fields (a test keeps it so).

### 3b. Tiles

1. **Statement rows read like code,** left to right: the target, then the block's words with each value in a pill. Values in pills are tiles themselves, so a function can go in a slot. **A value made of others** ("score + 1", "cat is touching chair", "a list of cat fox", "item 1 of things") is a pill holding its own words and a pill for each value in it, nested as deep as the value is, as Blocks nests its value blocks (WP7t, parity task 6). Its own words ("+", "cat is touching") are the button that changes the whole value; each value inside changes on its own, in one step. Only those are buttons, since a button can't hold another, so the row's name is still the words it shows (3f.2). A list's items are changed by making the list again with that item changed, as the AST sets a list as a whole.
2. **Containers** (do in order, do together, count, while, for each, if/else) draw their body inside them, indented, with their own header row.
3. **An empty statement list** shows "drop statement here" in a dashed box 44 px high.
4. **A switched-off statement** is greyed, with a dashed outline, and its name ends "(switched off)". It's still saved (`setEnabled`). This differs from the handoff's 45% opacity, which takes the tile's words below 4.5:1, for the same reason the handoff darkened Alice's blue.
5. **Colours:** action tiles blue, question tiles green, control tiles as the handoff draws them, and "add detail ▾" in lavender.

### 3c. Pointer and touch

1. **Drag from the palette** puts a copy in the program; **drag from the program** moves the tile. The original stays in the palette. **A question** from the Questions tab goes onto a value instead, any pill it can replace, a value inside a value too, and never between statements: the pill it would replace is outlined, drawn over it so nothing moves, and a pill that can't take it isn't (3c.4). Dropped, it asks for its own values through the cascade, as when it's put in by keyboard (WP7t, parity task 6).
2. **The drop line is an overlay,** with a "Drops here" pill. It never resizes the program while dragging, so nothing shifts under the pointer or finger (spike finding 5).
3. **A ghost** of the tile at 60% opacity follows the pointer.
4. **A place that refuses the tile never lights up** (section 2.2).
5. **Dropping anywhere else** cancels, and the tile goes back.
6. **Every target is at least 44 × 44 px,** for iPad and for young hands. A touch drags from a tile's grip, so the rest of a row still scrolls the program.
7. **A row's menu** (section 2.6) opens on a right-click, or a long press by touch or pen: held for half a second and moved no more than 10 px, as Blockly's is (the owner's choice, 17 Nov, over a ⋯ button on each row). A press that moves is a scroll or a drag, not a menu. The menu is named for its statement ("Menu for penguin move"), and Escape or a click outside closes it with nothing changed.

### 3d. Keyboard

Every path works without a pointer (7.8):

| Key | In the program |
|---|---|
| Tab, Shift+Tab | Between the methods panel, the control bar and the program |
| ↑ ↓ | To the previous or next statement, into and out of containers |
| ← → | Between a statement's value pills, those inside a value too, in reading order, and out to its row |
| Enter | Opens the cascade for the pill in focus, or "add detail ▾" |
| Space | Picks up the statement; ↑ ↓ then move the drop line; Space puts it down; Escape puts it back |
| Delete | Deletes the statement, with an undo label to bring it back |
| Ctrl+D, Ctrl+C, Ctrl+V | Duplicate, copy, paste (the contract's commands) |
| Ctrl+/ | Switches a statement off or on |
| Alt+↑, Alt+↓ | Moves a statement one place up or down in its list |
| The Menu key, Shift+F10 | Opens the row's menu (section 3c.7) |

In the palette, Enter on a block inserts it after the statement in focus, or in the empty slot, then runs its cascade. Focus is always visible, with the handoff's ring on Tiles surfaces.

### 3e. Values

Enter or a click on a pill opens its cascade (section 2.3), upward if there's no room below. The menu marks the value there now and opens on it, so the arrows start from where the learner is; a detail's menu also offers taking the detail out. Choosing a value is one undo step ("Change forward to backward in cat move"). "Other number…" and "Other words…" open a small text field, and the value is checked against the parameter's limit (spec 02, section 2, rule 4) before it's applied.

### 3f. Screen readers

1. **The program is a tree:** `role="tree"`, with each statement a `treeitem` at its nesting level, and roving focus. Screen readers say "2 of 5" and the level from `aria-posinset`, `aria-setsize` and `aria-level`.
2. **Each statement's name is the words it shows,** details included: "cat move forward 1 how long 2". A speech-control user says what they see, so a name never differs from the visible words (WCAG 2.5.3).
3. **A container's tree item is its header row,** so its name is "do together", not its statements too. The box around it is only drawing (`role="none"`), and its statements' group sits beside the header.
4. **Each pill is named by its value and described by what it's for:** "1", described as "amount". Inside a value, "2" in "2 + 3" is described as "first value", and the "+" that changes the whole as what the whole is for.
5. **Announcements** through `host.announce` say what happened, in the same words as the undo label, and say where focus is if it moved: "Moved cat say Hello into do together".

### 3g. Highlights

Through the contract (7.9): Rehearse outlines the running statement (a still outline when the learner has asked for reduced motion); an error marks the statement in the stop colour with the error's words beside it; the Prompter's highlight carries its AI badge; `link` marks the blocks the current frame links to (WP10.8), in Direction A's Coded colour. Several kinds can show at once.

The contract's `highlight(marks, kind)` takes each node with its words, `{node, message?}`, so the two can't drift apart. In Tiles an error's words sit beside its statement in a chip of the program's own colour, so the stop colour reads at 4.5:1 on any tile, and they're part of the row's name. Blocks marks the blocks, and showing the words there is S5's (3i).

### 3h. Performance

1. **A row is one memoised component, defined once and keyed by node id,** never a component defined inside the editor's render, so an update doesn't remount it and lose focus (spike finding 7).
2. **An edit redraws only what changed:** a program is immutable and shares what didn't change (spec 01), so a row whose node is the same object, with the same focus, highlights and names, is skipped. **A row's place in its list isn't part of that:** each list sets its rows' `aria-posinset`, `aria-setsize` and `data-index` on the page once it's drawn, so a statement put in at the top, or moved past 500 rows, redraws only itself (and the row the tab stop moves from). A pass before drawing works out the focus order and each row's pills, so a skipped row is still known to the keyboard. The palette and the control bar are drawn again only when what they show changes.
3. **A method of 500 statements** stays responsive: a keystroke or drop draws within 100 ms. It's tested in CI, then on the reference Chromebook (7.10). The test times each key, press, release and click with Event Timing, on the production build, two ways: to the next frame drawn, which is what the learner sees, and to the end of the editor's work on it. On real hardware the time to the frame is held to 100 ms. CI's browser draws in software, on the CPU, so CI holds the editor's work to 100 ms and reports the time to the frame.
   - **A stand-in for the Chromebook (18 Nov):** the same test on the owner's PC, in Edge drawing with the GPU, three runs each, the slowest time to the frame, before and after the changes below:

     | Input | Full speed, before | CPU slowed 4×, before | Full speed, after | CPU slowed 4×, after |
     |---|---|---|---|---|
     | Arrow keys | 32 ms | 72 ms | 32 ms | 56–64 ms |
     | Changing a value from its menu | 40–56 ms | 192–208 ms | 40–56 ms | 152–176 ms |
     | Moving a statement by keyboard | 40–48 ms | 152–200 ms | 32 ms | 96–136 ms |
     | Dropping a dragged statement | 24–48 ms | 112–136 ms | 32–48 ms | 96–112 ms |
     | A new block from the palette | 72 ms | 360–480 ms | 48–56 ms | 232–312 ms |

     **What changed (profiled with the CPU slowed):**
     - **React Aria's `TabPanel` walked the whole method after every change.** It looks for something that can take focus, to decide whether the panel needs a tab stop of its own. While a menu is open, everything outside it is inert, so the walk found nothing and went through all 5,600 elements, after each change to the page. Tiles' method tabs keep React Aria's tabs but draw their own panel, named from the selected tab, beside `Tabs` (React Aria draws what's inside `Tabs` twice). **The studio's code tabs (S5's `CodeEditor`) wrapped both editors in the same `TabPanel`;** they use `@storystage/ui`'s `useTabPanel` now (#527), as Tiles does (#528).
     - **A row's place** is set by its list, not drawn by the row (item 2).
     - **`canDrop` checks only the statement an edit makes or changes** (`checkProgram`'s `only`): the statement put in or moved, or the statement a value goes into (a value's fit is checked at its statement), or the field, parameter or event handler a value outside a statement goes in. Each node is checked on its own, against declared types, so nothing else can change; what a statement leaving its place could break is the AST's rules, which `applyAll` checks first. `programTypes` is worked out once for each program.
     - **The AST checks only what an edit adds or takes away** (S2's #529): one index for each program, the depth from the place a part goes, the rules only when the edit could break one, and the same edit on the same program giving the same program, so what `canDrop` worked out carries over to the session.

     **With #529 and these together** (18 Nov, slowed fourfold, three runs): a value 136–152 ms, a move 136 ms, a drop 96 ms, a new block 232–312 ms; at full speed all within 72 ms. **What's left** isn't the program's size: it's React drawing the editor again after each change (about 69 ms of a value's slowed time), and React Aria building each question's menu as a new block asks it (about 70 ms of a new block's), which costs the same in a method of any length. A method of 500 statements is far longer than a lesson's, which are tens of statements, and whether the Chromebook is four times slower than the PC is for the device run (7.10) to show.
4. **Whole-program work is done once for each program:** the shared model keeps its index, types, describer and the problems a program already has with the program (`editing/cache.ts`), since a long method asks for them on every row.
5. **A keyboard move checks a place only when a step reaches it,** not every place when the statement is picked up. **A drag checks a place once,** when the pointer has stayed on it for 60 ms, so sweeping across rows checks nothing. A drop checks at once.
6. **Top-level rows off screen** aren't styled or laid out (`content-visibility: auto`). They stay in the accessibility tree.

### 3i. Option B, Blocks

`packages/blocks` (S5). Blockly 13 (Apache-2.0, unmodified, in `NOTICE`), made to look and behave like Alice's tiles (WP7.6), over section 2. The look is screen 02's palette and code area. Blockly loads on demand with the Code editor (`07-ux.md` section 7.3), so the Storyboard opens without it.

1. **Blocks from the metadata.** One block type for each Story API entry, generated from `ENTRIES`: a statement for a procedure, a value for a function, with its target first ("owl"), then its words and parameters in the metadata's order, worded from `STORY_WORDS`. The control statements and expressions of spec 01 section 1 have one block type each. A test fails if an entry or a node kind has no block.
2. **The palette is section 2.1's,** for the chosen object, in the same tabs and categories as Tiles, drawn as Blockly's open flyout with each category's words as a heading, and the control blocks after the actions. Its blocks are the shared model's new blocks (`newCall`, `newControl`), their values drawn as Blockly's shadow blocks. A block dragged out takes the program's own ids when it lands. The control statements use the shared model's words (`control.*`), so Blocks and Tiles read alike. Blockly 13 marks each connection's highlight as a `figure`, which the palette's list may not hold, so the editor hides those from screen readers (to report to Blockly). **The control blocks are Tiles' control bar's, in its order** (section 3a): the control kinds, then **variable** and **set**, then the note. Dropped, variable and set ask Tiles' own question first (`NewVariable`: a name and what it holds; `ChooseVariable`: which variable that may change, or "There's no variable here to set"), then the cascade asks for the value, named as Tiles names it (the variable's name, or the slot's words such as "how many times").
3. **Types on every connection.** Each input's check is its type from the metadata, with the class chain for objects, so Blockly itself refuses a number in an object slot (spike 1.5). `canDrop` (section 2.2) has the final word, on drop.
4. **No loose blocks** (decision 0064, section 2.2.1): a block dropped outside a method doesn't stay there. It goes back where it came from, or, from the palette, isn't added, and the learner hears "Blocks go inside a method". Blockly's own loose blocks are never left on the workspace (spike finding 2).
5. **An Alice-like renderer.** A custom renderer draws statement rows that read like a line of code: rounded rows, the target as a chip, each value as a chip with a ▾ menu, do in order and do together as labelled containers, and "add detail ▾" at the end of a row. **Following Blockly's appearance guide and Blockly Games (the owner's choice, 16 Nov, over an earlier "no jigsaw tabs"),** statements keep Blockly's notch where they stack, so stacking is found and a row never looks like a value. Every block has a visible outline, so two of one colour stacked together stay two, and C-shaped blocks keep the gap below their last statement. Colours follow screen 02 (moves blue, speech pink, camera amber). The other families take Blockly Games' hues, darkened to 4.5:1: loops green (hue 120), questions purple (290), and looks indigo, apart from questions. Sound and time are teal and the learner's own procedures slate. Conditionals and loops differ in colour, as Blockly's block guide asks: `if` keeps the control colour. All are design tokens in `@storystage/ui`, checked by its contrast test in both themes (`07-ux.md` sections 2 and 4). Blocks and Tiles look different on purpose, so learners know which they're using.
6. **Values on drop, through the cascade** (section 2.3): dropping a block from the palette asks for each parameter in order before anything is added, and Escape cancels the drop. Blockly fires its events a moment after the drop (spike finding 3), so the editor waits for the drop to finish before asking, and its tests wait for the cascade. The menus are drawn by the same React component as Tiles' (one cascade for both editors, spike finding 1). **A drag moves one statement** (the owner's choice, 17 Nov 2026), with what's inside it, as Tiles and Alice move one: the blocks under it close up behind it. Blockly's own drag takes every block under it too, and moves one only with Ctrl held, which an iPad hasn't got. This is Blockly's drag strategy with `shouldHealStack` overridden (3i.12), so Blockly's keyboard move (M) moves one statement too.
7. **Switch off and on:** the block's menu and the `toggleEnabled` command set the statement's `enabled`. A switched-off block is drawn faded and dashed, and is named "switched off" for screen readers.
8. **One method per tab:** each method or listener is its own Blockly workspace, mounted when its tab opens. The workspace is built from the method (`toBlocks`), and each gesture (a drag, a cascade, a value change) becomes edit operations (`toEdits`), applied through `host.apply` as one step with section 2.4's label. A change from elsewhere (undo, the Prompter, Tiles) rebuilds only the method it touched and puts focus back on the same block.
9. **Keyboard:** Blockly 13's own keyboard navigation, on by default (registering it again throws, spike finding 4): Tab reaches the palette, then the workspace; the arrow keys move between blocks and connections. Added on top: Enter on a palette block picks it up in Blockly's keyboard move, an arrow chooses its place and Enter puts it there, then the cascade asks for its values, as a drop does; the contract's commands have the same keys as in Tiles (Ctrl+/, Ctrl+D, Alt+↑ and Alt+↓; Delete is Blockly's). Each step is said aloud, and focus stays on the block, or goes to the method, also when a move is refused and the block goes back. Each block's accessible name is its code in words, as in section 3f ("owl move forward 1"), and each drop or refusal is announced through `host.announce`.
10. **Highlights** through the contract, as section 3g: Rehearse outlines the running block (a still outline with reduced motion), an error marks it in the stop colour with its words beside it, the Prompter's highlight carries its AI badge.
11. **Touch:** Blockly's drags work by touch on the iPad and Chromebook. The long frames at the start of a drag (spike finding 6) are measured on the reference devices before a budget is set; a method of 500 statements stays responsive, as section 3h asks of Tiles.
12. **Only Blockly's public API** (Blockly's guide, "Using Blockly APIs", docs.blockly.com/guides/programming/using_blockly_apis/): the editor uses public members, and protected ones only inside its own subclasses (the renderer extends zelos's renderer, constants and path object). It overrides only by subclassing, never patches Blockly's code, and never calls a member marked `@internal`, private or deprecated in Blockly's type definitions, nor one not exported. Where Blockly offers no public way, the editor goes without or uses one Blockly does offer (its own menu key opens a block's menu, not the internal `showContextMenu`). Its own changes to Blockly's drawing, such as hiding a connection highlight from screen readers, touch only the page, are marked "to report to Blockly", and go when Blockly is fixed. Blockly is upgraded only after checking that every member used is still public.

## 4. The switch

Workplan 7.11, written by S6 on 17 Nov 2026 before its code. The switch sits in S5's Code editor (`07-ux.md` section 7.3), so S5 reviews this section. The look is screens 04 (the switch) and 05 (its dialog).

1. **Where it is.** At the start of the Code editor's bar: the word "Code" above a **Blocks | Tiles** switch (a segmented control, 44 px; the chosen side is chalk), as "Blocks for" sits above its object, then the note "⇄ Blocks and Tiles edit the same code." (screen 04's header, in the bar). It is in the bar, not on a row of its own above it, so the code stays where it was: a row of its own pushed the method 60 px down, past the window's edge for a drag from the palette (found 17 Nov, with S5's tests). The bar serves whichever editor shows, as agreed with S5 on 16 Nov. That bar holds "Blocks for" and its object, Actions and Questions, Show as text and its wording, the method tabs and New. So under it Tiles draws no object picker, tabs or method tabs of its own (`new TileEditor({ studio: true })`). It takes the palette's object and tab from the bar through `setPalette(target, tab)`, as Blocks does. Its palette list and control tiles bar stay its own.
2. **A view change, never a conversion.** The program and the undo history are the studio's (section 1.1), so a switch changes neither. A step made in one editor undoes in the other. Where the learner was passes across as `ViewState`: the studio keeps what the editor's `unmount` returns and mounts the other editor with it. That way the same method is open, and the same statement is chosen and has focus. Rehearse's, the error's, the link's and the Prompter's highlights are given to the new editor. Each editor loads on demand, so the Storyboard opens without either.
3. **Which editor opens.**
   - The learner's last choice on this device opens.
   - Before they choose, the class default from policy (`editor.default`, spec 05 section 3.3) opens. With no policy, that is Blocks.
   - When the teacher locks it (`editor.locked`), the default always opens, and the learner's choice is kept for later. The switch still shows both names, so learners know which one they're using, but it can't be changed. Beside it is the neutral note (`07-ux.md` 12a), "Set to {editor} by your school", with the editor's name filled in ("Set to Blocks by your school"). It is never styled as an error.
4. **The first switch explains** (screen 05). A dialog titled "⇄ Switching to Tiles" (or to Blocks):
   - It opens with "Blocks and Tiles are two ways of showing the same instructions, like one story in a picture book or a chapter book. Your program stays the same."
   - Next, the open method's first three statements, side by side in each editor's look, then "and 2 more".
   - Then a confirmation: "✓ Your program is kept. 5 steps, same order. Nothing has changed." The steps are the open method's statements, nested ones included, counted from the one program both editors draw.
   - The buttons are **Show me Tiles** (primary, with focus) and **Stay with Blocks**, with a tick box, "Don't explain this again".
   - It explains again until that box is ticked. Escape is Stay.
   - It is never shown when the switch is locked.
5. **Keyboard and screen readers.** The switch is a radio group named "Code editor": Tab reaches it, and the arrow keys choose. With the dialog, focus goes to its primary button. After a switch, focus goes to the statement that had it, or into the editor, and the studio says "Now showing Tiles. Your program is the same." through `announce`.
6. **Each editor keeps its own name and look** (section 3i.5), from `displayName`. The Code region's name says which is showing ("Code for scene 1, in Tiles").
7. **Study mode** (section 6) logs each switch, with which editor and when, never the program.

## 5. Parity through the interfaces

Workplan 7.12, written by S6 on 17 Nov 2026 before its code. The tests drive Blocks, so S5 reviews this section. Both editors build on one shared model (section 2), so edits made by a script would come out the same by construction. These tests prove the two *interfaces* agree, so only a learner's own means count: the pointer, touch and the keyboard, through each editor's palette, rows, menus and keys.

1. **Where.** `apps/studio/e2e/parity.e2e.ts`, in the built studio with both real editors, switched with the studio's own switch (section 4). The tasks start from the example film's scene 1, whose method has one statement ("penguin say Oh no, the ice is moving!"). Each task starts on a fresh page, from where the tasks before it end: that film is written by the test and opened with Film › Open a copy. So one failing task doesn't hide the rest.
2. **Four ways through each task.** Every task is done four times: in Blocks by pointer, in Blocks by keyboard, in Tiles by pointer and in Tiles by keyboard. Each way uses only what that editor offers a learner there (section 3c–3e for Tiles, 3i.6–3i.9 for Blocks). Touch is the pointer's path on a touch screen, so the device runs cover it (7.8, 7.10), not these tests.
3. **What's compared.** The program, as the learner would keep it: Film › Save a copy (the system's file picker stood in for in the page, as the M3 gate does), read back with `openProduction`. The ids of nodes made during the task are random, so each one is renamed by where it first appears in the saved program, and every reference to it is renamed with it; the example's own ids stay as they are. After that renaming, the four programs must be **identical**, and identical to what the task asks for (the program the test writes for it, with S2's edits). The last step's undo label must be the same in all four as well (section 2.4), and so must the number of undo steps the task took, counted by undoing until there's nothing left to undo. They're counted in the studio's one history, with the stage's Undo (`07-ux.md` section 7.5), never in an editor's own: Blockly keeps an undo stack of its own, and the test doesn't read it.
4. **The tasks.** Each is something a learner does in a first lesson, and they follow on, each from where the one before ends, and between them they use the palette, the cascade, values, details, containers, moves and the contract's commands:
    1. **Add from the palette:** the penguin moves forward 2, at the end of the method (the palette, a drop or Enter, and the cascade).
    2. **Change a value:** that move's forward becomes backward (a value's menu).
    3. **Add a detail:** the say takes "how long" 2 ("add detail ▾" and its cascade).
    4. **A container:** a "do together" at the end, with the say moved into it (Tiles' control bar or Blocks' palette's control group, then a move into a container).
    5. **The commands:** the move is duplicated, the copy moved up one place and switched off, and the original deleted (Ctrl+D, Alt+↑, Ctrl+/ and Delete by keyboard; the block's menu or the row's by pointer).
    6. **A question in a slot:** the say's "how long" becomes "penguin distance to fox" (the Questions tab, and a function dropped on a value, or put in the value in focus).
    7. **Variables:** a whole-number variable "steps" starting at 3, and a "count" whose count is `steps` (Tiles' variable tile or Blocks' variable block, and the cascade's variables in scope).
5. **The round trip.** Every kind of node made in one editor renders, and can be edited, in the other.
    1. Each task's result, made in one editor, is shown in the other through the switch. Every node the task made is drawn there: Tiles' `data-key` and Blocks' `data-id` are the program's node ids.
    2. Then one edit is made on each statement it made, in the other editor, by keyboard: switched off and on again (Ctrl+/). The program after is the same as before, and the history has two more steps.
    3. A film whose code holds every statement and expression kind (`sampleProgram`, the sample Blocks' mapping test uses, 3i.8) is opened with Film › Open a copy and shown in each editor. The sample has two deliberate misfits, and the studio takes no step that leaves the Story API's check failing, so the test puts them right first and keeps every kind of node. Every node in it is drawn in both. In each, every statement is then switched off and on again by keyboard, and the program stays the same. Its speak line's `fromScript` detail is drawn in both as the words "from the script" (section 2.3.3) and left alone: only statements are switched.
6. **Every block in both.** For each object in scene 1 (the scene itself, the camera, the penguin and the fox) and each tab (Actions, Questions), the two palettes list the same blocks in the same order, read from what each editor draws (Tiles' palette list, Blocks' flyout). Both match `palette(program, target, self, tab)` (section 2.1), so a block missing from one editor fails the test, naming the block. Blocks is read by each flyout block's `data-callee` (`story:move`, `user:<method id>`, `control:doTogether`), in the flyout's order, not by its accessible name, which Blockly words itself. On the Actions tab, Blocks' flyout ends with a control group, where Tiles has its control tiles bar: the two are compared too, in the same order.
7. **When the editors disagree,** the test fails with the two programs' text (`programText`) side by side, so the difference reads as code. The fix goes in the editor that's wrong, or in the shared model if both are. A test is never loosened to let the two differ. Until it's fixed, a way that makes a different program runs as an expected failure, naming what differs and whose it is, so it still runs and says when it's fixed; a way an editor doesn't offer yet is skipped (`fixme`), naming whose it is. `docs/lanes.md` lists what is open.

## 6. Study mode and its pseudonymous data

Workplan 7.13 (and the export, 24.6), written by S6 on 17 Nov 2026 before its code. It builds what the editor study’s draft protocol asks of the study build (`docs/study/protocol.md` section 12, #166) and fits the draft consent sheets (`docs/study/information-and-consent.md`). The owner made four choices on 17 Nov: the tasks use models the library ships, the teacher ticks who takes part once in the class list, a task holds the editor itself, and help is a task’s Hint or Learn. Reviews: S5 (the study bar, the task card and the Settings card are in the studio), S8 (the class list’s tick, the store, the export), S2 (the check’s trace, 6.4), S7 (the Prompter held off, reading aloud) and D (the protocol and the consent sheets, which change to match 6.2 and 6.3).

The rules live in a new package of S6’s, `packages/study` (`@storystage/study`): the log, the session, the tasks with their checks, and the export file. S5 draws them in the studio, and wires the studio’s events to the session’s calls (6.6), as agreed on 17 Nov.

1. **Off unless the school switches it on.** Study mode is on only when the policy in force has `study.enabled: true` from a trusted source (spec 05 section 3.3: a learner’s own file can’t switch it on). With it off, none of this section shows, and no log is started or written. Switching it off doesn’t delete logs already kept: Settings’ Study card stays until they are exported or deleted (6.8).

2. **Who takes part.** Only learners whose parent or carer consented, and who agree on the day (`information-and-consent.md`).
   - **With a class list:** in Class set-up’s pupil list, the teacher ticks **Taking part in the study** beside each pupil who may take part, once. The ticks are the study’s own list of pupil ids, kept in the study’s store on the device (6.7), never in a pupil’s folder, a production, Collect, an export or a log. A removed pupil’s tick goes with them: ticks not in the class list are dropped whenever they’re read, so a pupil restored from the bin is ticked again only by the teacher.
   - **With no class list** (a club, or home): when a film opens, a dialog asks the adult **Is this learner taking part in the study?**, **No** first and with focus. The answer lasts until the app closes.
   - A learner not taking part sees nothing of the study, and no log is kept for them.

3. **A session and its code.** A session starts when a ticked pupil’s folder opens (or the adult answers Yes), and ends when the folder closes, another opens, or the app closes.
   - Each session has a new random **code** of eight letters and digits (no 0, O, 1, I or L), drawn evenly from 31 symbols with `crypto.getRandomValues`: about 40 bits, so two sessions in a study of thousands hardly ever share one. It isn’t made from the device, the pupil, the time or anything else, so sessions can’t be joined up. Nothing on the device links a code to a pupil.
   - The **study bar**, one row of about 40 px in a Shell slot of its own under the header and above the stage (S5: never the notice slot, whose notes come and go), in a taking-part session only, shows "Study session K7P3-QX2M" and **Study tasks**. So a school that keeps a private list of codes (the consent sheets) can write one down. StoryStage never sees that list.
   - A session that opens no study task and makes no switch keeps no log at all.

4. **The study tasks.** **Study tasks** lists five tasks, the same in both editors, each about 10 minutes for a 9-year-old. Each opens its own prepared film, in memory only: nothing of the task is saved, saving pauses while it is open, and it never reaches the pupil’s folder. The learner’s own film and its undo history are kept aside, untouched, and closing the task returns them as they were. Each uses only blocks both editors have (section 5.6) and models the library ships (the owner’s choice, 17 Nov; the draft protocol’s animals aren’t in it).

   | Task | The learner makes | Concept | Success, at the end of the scene’s run | Editor |
   |---|---|---|---|---|
   | T1 Say hello | Teddy walks to the tree, then says "Hello" | Sequence | Teddy is within 2 m of the tree (on the ground, centre to centre), faces it within 45°, and says "Hello" (compared as captions are, spec 08 section 9.4) no earlier than he first gets there | Held to the class default |
   | T2 Together | Polybot moves to the fence while Teddy turns to watch | Do together | Polybot ends within 1.5 m of the fence; Teddy ends facing Polybot within 30°; Polybot’s moving and Teddy’s turning overlap for at least half a second | Held |
   | T3 Three jumps | Dino kid jumps three times | Repetition | Dino kid leaves the ground by at least 0.3 m exactly three times, coming back down each time, and ends on the ground | Held |
   | T4 Click me | When Autumn the dog is clicked, she says "Woof" | Events | In a run with a click on Autumn 1 second in, she says "Woof" after the click and not before it | Free |
   | T5 Fix it | Red Riding Hood turns the wrong way: make her face Grandmother | Debugging | Red Riding Hood ends facing Grandmother within 30° | Free |

   - **The task card,** in the Prompter’s place, on the right of the Production stage (its column, folding as it does), while a task is open: its title, its instruction in words and a picture, **Read it to me** (S7’s `readAloud` in `@storystage/speech`, on-device voices only, spec 06 section 2; not shown when `chooseVoice` finds none, checked again when the voices change; stopped when the card closes), **Hint** (one hint per task, in words), **Check my step** and **Stop this task**.
   - **Check my step** plays the scene offscreen as the automatic check does (spec 08 section 9.2: deterministic, fixed steps, on the hidden stage the frame check’s `useCheckRun` already makes), through the check’s trace (below), and tests the task’s success. Success says "You did it!". Otherwise it says "Not quite yet. Rehearse it and watch what happens." It never says what’s wrong, which would be help that isn’t counted. A run stopped by an error says the error’s words, as the check does.
   - **The check’s trace:** S2's `@storystage/check` gains `traceScene({ production, stage, startWorker, scene, events?, signal? })`, giving the run it already makes for a frame check (each step’s transforms, which blocks ran and when, what was said, and any error), with `events` played in at their times (T4's click, through `Playback.event`). The study’s success tests read it; the study never runs the program another way.
   - **Fifteen minutes:** a task still open after 15 minutes ends with "Time’s up for this task. Well done for trying."
   - **Then two questions,** after every task, however it ended: **How easy was that?** (three faces: Hard, OK, Easy) and **Which way of coding would you choose next time?** (Blocks, Tiles, Don’t mind). Each can be skipped. The answers are logged, never shown again.
   - A task done in this session is ticked in the list and can’t be done again in it. Nothing records which tasks a pupil did in other sessions: the teacher says which tasks a lesson does.

5. **The editor and the Prompter during a task.**
   - **T1 to T3 hold the class’s default editor** (`editor.default`), as a lock does (section 4.3): the switch shows both names and can’t change, with the neutral note "Set to Blocks for this study task". Closing the task gives the switch back to the policy and the learner’s choice. T4 and T5 leave the switch as the policy has it, so learners can switch. No policy change is needed between lessons (the owner’s choice, 17 Nov).
   - **The Prompter is held off** while a task is open, so it can’t confound help and no request goes to Anthropic as part of the study. The studio holds it off by giving the panel the level Off while a task is open (spec 04 section 4.5), and refreshes it as a task opens and closes; a level turning Off stops a request already running (S7). The task card takes the panel’s place on the right while a task is open (6.4), so no note is needed: the panel isn’t there to be used. It comes back when the task closes.

6. **What the log holds.** Only these, each with `t`, milliseconds since the session started:

   | Event | Fields | For |
   |---|---|---|
   | `session` | the date (`YYYY-MM-DD`, no time), the app’s version, the study class code and age band from Settings (6.8), the policy’s `editor.default` and `editor.locked`, and the editor showing | Who’s comparable with whom |
   | `task` | the task (`T1`–`T5`), the editor showing, and whether it’s held | Time to success starts here |
   | `switch` | from and to (`blocks`, `tiles`) | Switches, in a task or not |
   | `edit` | none: one for each undoable step | "Not attempted" (no edits) |
   | `undo`, `redo` | none: one for each step | Undo rate |
   | `help` | `hint` or `learn` | Help requests |
   | `check` | `success`, `notYet` or `error` | Task success; checks before success |
   | `end` | `success`, `timeUp` or `stopped` | |
   | `answer` | `ease` (`hard`, `ok`, `easy`, `skipped`) or `choice` (`blocks`, `tiles`, `dontMind`, `skipped`) | Ease; preference |

   - **Never in it:** names, pupil ids, the class list, program content of any kind (no code, node ids, words said, error words or labels), pictures, camera, voice, the device’s name or any identifier of it, the time of day, and anything typed. An edit, undo or check is counted, never described.
   - Outside a task only `session` and `switch` are logged.
   - **A task with no `end`:** if the app or the window closes while a task is open, the task has no `end` event (closing a folder ends it as `stopped`). Whoever reads the logs counts a task with no `end` as stopped, at its last event.
   - **Where they come from** (S5 wires them): each step the studio’s one history takes in a task is `edited()`, each Undo `undone()` and each Redo `redone()`; Learn opening is `help('learn')` and the task card’s Hint `help('hint')`; the switch is `switched(from, to)`; Check my step’s result is `checked(...)`. The task card opens and ends the task, and the questions’ dialog gives `answer(...)`.

7. **Where it’s kept.** In the study’s own store on the device: a `FileStore` (`packages/host`, spec 05 section 6.1) rooted in a `study` folder beside the class folders, from S8’s host as `host.classes.study()` (#491: the class folders’ store, in a `study/` folder beside the pupil folders, with no new native commands). One file per session (`<code>.json`), written after each event, so a crash keeps what happened, plus the ticks (6.2). It’s never in a pupil’s folder, so Collect never carries it, and nothing sends it anywhere: there’s no network code in `packages/study`. The diagnostic bundle says only whether study mode is on, as now.

8. **Settings’ Study card** (in Class set-up, behind its teacher check, screen 11's "Study logs"), shown while study mode is on or logs are kept:
   - **Study class code** and **Age band** (6–8, 9–11, 12–13), which the study team gives the teacher at recruitment. They go in each new session’s `session` event. The code is a short label (up to 12 letters, digits and dashes), never the class’s name.
   - **Sessions on this device:** each session’s code and date, with how many tasks it did, and **Delete** for each (a pupil who withdraws, by the school’s private list), asked first and not undoable.
   - **Export study logs:** saves one file through the system’s picker, `study-logs-<date>-<random>.json`: `{ "format": "storystage-study-log", "version": 1, "export": <a new random id>, "sessions": [...] }`, every session kept on the device, each as its events. Once the file is saved, it asks **Delete these logs from this device?** (**Delete from this device**, primary, and **Keep for now**), as the protocol asks (section 12.5). The teacher exports from each device; there is no gathering across devices in the first release.
   - Leaving study mode on and exporting again later gives only the sessions kept since.

9. **Screen readers and the keyboard.** The study bar is a labelled region ("Study"); the task card is a region named for its task; Check my step’s result is announced through `announce`; the two questions are radio groups in the design system’s Dialog, each with Skip as one of its radios, so each question is one Tab stop, and focus goes to the first. Every task can be done by keyboard alone in both editors, as parity proves (section 5).

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
| 3i.1: a block for every entry and node kind | `packages/blocks/src/blocks.test.ts` | Unit |
| 3i.8: `toBlocks` then `toEdits` gives back the same method, for the example programs and one using every node kind; each gesture gives the same edits and label as the scripted edit | `packages/blocks/src/mapping.test.ts` | Unit |
| 3i.3–3i.7: typed connections, no loose blocks, the cascade on drop, switched off | `packages/blocks/src/*.test.ts` | Component (Vitest, happy-dom) |
| 3i.6, 3i.9: pointer, touch and keyboard paths, the cascade, names; axe with WCAG 2.2 AA | `packages/blocks/e2e/*.e2e.ts`, with the M2 gate (`docs/test/M2-one-scene.md`) | End to end (Playwright) |
| 4: the switch, its dialog, the hand-over, one history, the lock | `apps/studio/src/production/editorSwitch.test.tsx`, `apps/studio/e2e/switch.e2e.ts` | Component, then end to end |
| 5.2–5.4, 5.6: the tasks four ways, the same program and labels; the same palettes | `apps/studio/e2e/parity.e2e.ts` | End to end (Playwright) |
| 5.5: the round trip, every kind of node drawn and edited in the other editor | `apps/studio/e2e/parity.e2e.ts` | End to end (Playwright) |
| 6.2, 6.3, 6.6: who takes part, the session code, what the log holds and never holds (each event against a list of what may be in it) | `packages/study/src/*.test.ts` | Unit |
| 6.4: each task’s success test, passing on the task done right and failing on the film as it opens and on near misses, through the real runtime | `packages/study/src/tasks.test.ts` | Unit |
| 6.7, 6.8: the store, the export file, delete after export, delete a session | `packages/study/src/*.test.ts`, `apps/studio/src/study/*.test.tsx` | Unit, component |
| 6.1–6.5, 6.9: off without trusted policy; a ticked pupil’s session, a task done in each editor by keyboard, the held editor, the Prompter held off, the questions, then the export’s file read back | `apps/studio/e2e/study.e2e.ts`; the teacher’s export in the M7 gate (`gates/m7-pilot-ready.e2e.ts`) | End to end (Playwright) |
