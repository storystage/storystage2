# 01 Ast

- **Covers:** Node kinds, JSON schema, ids, edit operations, undo, text view, versions
- **Work package:** WP2
- **Owner:** S2
- **Status:** written for WP2.1. The code it governs is `packages/ast`.

## 0. Decisions this spec relies on

- [0010 Language](../decisions/0010-language.md): a typed AST stored as JSON with stable ids.
- [0011 Project file](../decisions/0011-project-file.md): the AST as JSON inside the `.storystage` zip, as `program.json`, one program per production (`packages/production`, `ZIP_LAYOUT`).
- [0009 Blocks](../decisions/0009-blocks.md): two editors over the same AST (`14-editors.md`).
- Spike [1.4](../decisions/spike-1.4-scheduler.md) and spike [1.5](../decisions/spike-1.5-editors.md): the scheduler and the shared drop rule this model has to serve.

**What this package may know.** `ast` depends on nothing, not even the DOM (`00-architecture.md`). So it doesn't know the Story API: the names of procedures, functions, classes, enums and events are plain strings here. Whether `cat.move` exists, and whether its `amount` may be text, is checked against the Story API metadata (WP4.2) by a check the caller passes in (section 4.5). This spec fixes everything else: the shape of a program and every rule that holds whatever the Story API says.

**Words.** Everything here is for developers. None of it reaches a learner except the refusals in section 4.4 and the labels in section 4.3, which follow `CLAUDE.md` rule 9.

## 1. Node kinds

A program is a tree of **nodes**. Every node has an `id` (section 3), a `kind`, and may have `copiedFrom`. TypeScript types: `packages/ast/src/nodes.ts`.

**Program.** The root isn't a node (it has no id), since nothing ever refers to it.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | string | Semantic version of this format (section 7) |
| `types` | list of `type` | The whole program |

A production has one program. Each scene is one `type` extending `Scene`, whose script method `Scene.method` points at (`03-production-format.md`). A learner's own class, such as a `Cat` with a `hop` procedure, is a `type` extending a Story API class, and every scene can use it.

**Declarations.**

| Kind | Fields | Notes |
|---|---|---|
| `type` | `name`, `extends`, `fields`, `methods`, `listeners` | `extends` is a type reference |
| `field` | `name`, `type`, `initial` | `initial` is an expression, or `null` for a scene object, whose start is in the scene's set-up (`SceneObjectSetup`) |
| `method` | `name`, `returns`, `params`, `body` | `returns` is a type reference (a function) or `null` (a procedure) |
| `parameter` | `name`, `type`, `default` | Belongs to a method or a listener. `default` is an expression or `null` |
| `listener` | `event`, `args`, `params`, `body` | `event` is an event kind from the Story API. `args` holds what the event needs (clicked objects, seconds between runs). `params` are the values the event gives its handler |

A scene object is a `field` with `initial: null`. Its name is the `ObjectId` the stage knows it by, in that scene's set-up, so renaming one also changes the set-up (section 4.6). A new scene has a `camera` field and an empty `myFirstMethod`; `newProgram` and `newSceneType` build these.

**Statements.** Every statement may have `enabled: false`, meaning the learner has switched it off. It is left out when the statement is on, so each program has one form.

| Kind | Fields | Notes |
|---|---|---|
| `doInOrder` | `body` | |
| `doTogether` | `body` | |
| `count` | `times`, `body` | |
| `while` | `condition`, `body` | |
| `forEach` | `item`, `items`, `body` | `item` is a `loopItem` declaration, `items` an expression |
| `eachTogether` | `item`, `items`, `body` | As `forEach`, all at once |
| `if` | `condition`, `then`, `else` | Alice's `else if` chains import as nested `if`s |
| `local` | `name`, `type`, `value`, `constant` | `value` is required (no empty slots). `constant: true` may be left out |
| `assign` | `target`, `value` | `target` is a `variableRef` to a non-constant, a `fieldRef` or an `arrayItem` |
| `comment` | `text` | |
| `call` | `target`, `callee`, `args`, `details` | A procedure call |
| `return` | `value` | An expression or `null`. Added to the workplan's list: functions need it (WP6.1) |

`loopItem` (`name`, `type`) isn't a statement, but it is a node, so a loop's variable can be renamed and referred to.

**Expressions.** No slot is ever empty: every expression slot holds an expression unless this spec says `null` is allowed. `none` is Alice's `null`, a value the learner can pick.

| Kind | Fields | Notes |
|---|---|---|
| `number` | `value` | A finite number |
| `wholeNumber` | `value` | An integer |
| `boolean` | `value` | |
| `text` | `value` | |
| `enum` | `type`, `value` | `Direction`, `forward` |
| `none` | | |
| `this` | | The object the method belongs to |
| `fieldRef` | `target`, `field` | `target` is an expression; `field` the field's id |
| `variableRef` | `variable` | The id of a `local`, `parameter` or `loopItem` in scope |
| `functionCall` | `target`, `callee`, `args`, `details` | |
| `arithmetic` | `op`, `left`, `right` | `add`, `subtract`, `multiply`, `divide`, `remainder` |
| `compare` | `op`, `left`, `right` | `equal`, `notEqual`, `less`, `lessOrEqual`, `greater`, `greaterOrEqual` |
| `logic` | `op`, `left`, `right` | `and`, `or` |
| `not` | `value` | |
| `join` | `left`, `right` | Joins text |
| `arrayOf` | `of`, `items` | `of` is a type reference, `items` a list of expressions |
| `arrayItem` | `array`, `index` | |
| `arrayLength` | `array` | |

**Parts that aren't nodes** (no id; they can't be selected or edited on their own):

- **Type reference:** `{kind: 'story', name}` for a Story API or basic type (`Number`, `WholeNumber`, `Text`, `Boolean`, `Biped`, `Direction`); `{kind: 'user', type}` for a `type` in this program, by id; `{kind: 'array', of}` for a list.
- **Callee:** `{kind: 'story', name}` (`move`) or `{kind: 'user', method}`, by id.
- **Arguments:** `args` and `details` are objects from parameter name to expression. For a Story API callee the key is the parameter's name; for a user callee it's the parameter's id. `details` holds Alice's optional keyword arguments (`duration`, `animationStyle`, `asSeenBy`).

## 2. JSON schema

The schema is `PROGRAM_SCHEMA` in `packages/ast/src/schema.ts` (JSON Schema 2020-12), exported as data so that it can be published with the Story API (WP4.8).

**Validation has two layers**, both run on every load and after every edit (`validateProgram`):

1. **Shape:** the schema.
2. **Rules** a schema can't state:
   - every id is unique across the program;
   - every reference resolves: `field`, `method`, `type`, and a `variableRef` only to a variable **in scope**;
   - a variable is in scope in the statements after its `local`, and inside them, within the same list; a parameter throughout its method or listener; a loop item throughout its loop's body;
   - names are unique: types in the program; fields and methods within a type, together; and a parameter, `local` or loop item can't take a name already in scope, so nothing is shadowed, though two loops side by side can both call their variable `item`;
   - `extends` chains have no cycles;
   - an `assign` target is one the table above allows, and never a `constant`;
   - `return` sits in a method, never in a listener or inside `doTogether` or `eachTogether`; it has a value in a function and none in a procedure. `return` inside "do together" would leave it unclear which strand ends;
   - a call to a user method has an argument for every parameter with no default, none for a parameter the method doesn't have, and no details, which only the Story API has;
   - a `functionCall` to a user method calls a function, not a procedure;
   - a method's `parameter` may have a `default`; a listener's may not, since the event supplies it.

**Why not Ajv in the app.** Ajv compiles a schema by generating code, which a strict content security policy forbids, and `ast` has no dependencies. `validateSchema` is a small interpreter of the keywords `PROGRAM_SCHEMA` uses. The tests run Ajv over the same schema and generated programs, so the schema stays a real one and the two agree.

**Limits,** as import hardening (WP8.4), so that a hostile file can't exhaust the stack: nesting depth at most 256 levels of JSON (`15-security.md` section 3.1); text at most 10,000 characters; names at most 60.

**A real function may have no `return` yet.** A learner mid-edit has a valid program. The runtime reports a function that finishes without returning (`bad_value`).

## 3. Ids

- **Short and stable.** An id is 6 lowercase letters and digits, starting with a letter (`a1f3zq`), 6 to 12 characters in all. Short ids keep the Prompter's project text small (StoryStage 1 used the same idea, spec 01 section 2.3).
- **Minted** at random, checked against every id in the program, and lengthened by one character if six tries all collide. Ids are not secrets. `mintId` takes the random source, so tests repeat.
- **Ids survive edits:** rename, move and set-argument keep them. Undoing a removal brings back the same ids, so storyboard links (`Frame.links`) and highlights still point at the right blocks.
- **Copying mints new ids.** `copyNode` gives every node in the copy a new id and sets its `copiedFrom` to the node it was copied from (the nearest source, not the first). References inside the copy follow it: a `variableRef` to a `local` in the copied block points at the copy of that `local`. References to anything outside the copy stay as they were.
- **References are by id,** never by name, so a rename changes one field.

## 4. Edit operations

Edit operations are the only way to change a program. They are plain JSON, so they can go in a Prompter plan, in a test or in a log. Each has `kind` and `label`.

### 4.1 The operations

| Kind | Fields | What it does | Inverse |
|---|---|---|---|
| `insert` | `parent`, `slot`, `index`, `node` | Puts a statement in a list. `slot` is `body`, `then` or `else` | `remove` |
| `remove` | `node` | Takes out a statement or a declaration, with everything inside it | `insert` or `declare` |
| `move` | `node`, `parent`, `slot`, `index` | Moves a statement, between lists or within one. `index` is where it ends up, counted after it has left its old place | `move` |
| `setArgument` | `node`, `slot`, `param`, `value` | Replaces an expression slot. For `args` and `details`, `param` names the entry and `value: null` takes it out. `null` also clears `initial`, `default` or a `return` value | `setArgument` |
| `declare` | `parent`, `index`, `node` | Adds a declaration: a `type` (`parent: null`), a `field`, `method` or `listener` to a type, or a `parameter` to a method or listener | `remove` |
| `rename` | `node`, `name` | Renames a `type`, `field`, `method`, `parameter`, `local` or `loopItem` | `rename` |
| `setEnabled` | `node`, `enabled` | Switches a statement off or on. Added to the workplan's six: it changes the saved program (`toggleEnabled`, WP7.6) | `setEnabled` |
| `setComment` | `node`, `text` | Changes a comment's text. Added for the same reason | `setComment` |

`index` may equal the list's length, to add at the end. Moving declarations isn't offered: nothing depends on their order.

**Removing something in use is refused.** `remove` on a field, method, parameter, type or a `local` that code still refers to breaks a reference, so validation refuses it, with the reason in plain words. Remove the uses first, in the same step. Alice refuses this the same way.

**Adding a parameter to a method** already in use needs a `default`, or the calls to it would be invalid. Since every call then has a value, no edit has to touch every call.

### 4.2 Applying

`applyEdit(program, edit)` returns the new program and the inverse. `applyEdits(program, edits)` applies several and returns the new program; it is what `TestHost`'s `apply` option wants. Programs are immutable: a change copies only the path to the node, so unchanged parts are shared and the old program stays good.

Every edit is validated when it is applied, and a list of edits is all or nothing. Each edit must leave a valid program, so in a step that removes a field and its uses, the uses go first. A full validation costs a walk over the program. If that hurts on the reference Chromebook, validation can move to the end of a step, without changing what's refused.

### 4.3 Labels

Every edit has a `label` in plain words, which is also its undo label ("Add cat", "Make cat say Hello"). `defaultLabel(program, edit)` writes one in English from the edit, naming what changed. Editors use it unless they have something better. Its wording is English only until the Story API's display words (WP4.2) arrive, and an editor that shows a translated interface passes its own. An inverse carries its original's label.

### 4.4 Refusals

A refused edit throws `EditRefused`, with `reason`, in plain words for the learner, and `code` for code to act on (`EditResult.reason`).

| Code | Example reason |
|---|---|
| `gone` | That block isn't there any more. |
| `name_taken` | There's already something called cat here. Try another name. |
| `bad_name` | Names start with a letter and use only letters, numbers and _. |
| `in_use` | cat is still used in your code. Take those blocks out first. |
| `not_here` | That can't go here. |
| `into_itself` | A block can't go inside itself. |
| `too_big` | That's too big to fit in your program. |
| `would_break` | That change would stop your program working, so it wasn't made. |

### 4.5 Checks from outside

`validateProgram` and the session take an optional `check(program)`, whose problems refuse an edit just as this package's do, and can give their own `reason`. WP4.2 supplies the Story API check here: procedures exist, argument types fit. WP8 supplies the production check: a scene's script method can't be removed.

### 4.6 What isn't in the program

The scene set-up (`scenes/<id>.json`), storyboard frames and the script aren't in the program. So:

- a `Frame.link` to a removed block dangles until the block returns on undo, and the Storyboard shows the frame as unlinked (WP10.8);
- renaming a scene object means changing the set-up in the same step. WP8.1 (`03-production-format.md`) sets out how the two undo together.

## 5. Undo

`EditSession` holds the program and its history. The studio builds `EditorHost` on it.

- `apply(edits, label, source)` is **one undo step**, all or nothing. It returns `EditResult`.
- **Grouping:** `begin(label, source)` opens a step that later `apply` calls join, and `commit()` closes it. A whole Prompter request is one step: Stop keeps what was done, as one step ("Undo this request"), and `cancel()` takes it all back. While a step is open, `undo` and `redo` do nothing and a second `begin` is refused. A step with no edits leaves no trace.
- **Undo** applies the inverses in reverse order; **redo** applies the edits again. A new edit clears the redo list.
- **History** (WP2.4): `history()` lists every step, oldest first, with its label, source and whether it is done or undone. `goTo(count)` undoes or redoes until that many steps are done, as StoryStage 1's history panel does. History lives with the open session; it is not saved in the file.
- `subscribe` hears every change, as `ProgramChange`. For undo, `edits` are the inverses that ran and `source` is `undo`.
- `load(program)` starts afresh with an empty history, for opening a file.

**The promise, tested:** any sequence of edits followed by full undo gives back the original program **byte for byte**, as `serializeProgram` writes it. `serializeProgram` sorts every object's keys by code unit, so the same program always gives the same bytes, however it was built.

## 6. Text view

`programText(program)` renders the program as read-only Python-like text, in `packages/ast/src/text.ts`, with no dependencies. It returns `{text, spans}`: each span gives a node id and where it runs in the text, so an editor can highlight the running block. `packages/text-view` (S6) builds the switchable Java-like wording and the view itself on top of this (WP7.6).

```
class Scene1(Scene):
    cat: Quadruped  # set in the scene
    score: WholeNumber = 0

    def myFirstMethod(self):
        self.cat.say(text="Hello")
        do_together:
            self.cat.move(amount=1, direction=Direction.forward, duration=2)
            # off: self.dog.turn(amount=0.25, direction=Direction.left)
        for _ in range(3):
            self.score = self.score + 1

    when mouseClickObject(objects=[self.cat]):
        self.cat.say(text="Ouch")
```

- Names come from the declarations, so a rename shows at once.
- Arguments are in sorted order, then details, so the text doesn't depend on how a program was built.
- A switched-off statement is shown as a comment starting `off:`. An empty body shows `pass`.
- A node from a newer format (section 7) shows as `# (from a newer StoryStage)`.

## 7. Versions

`SCHEMA_VERSION` is `1.0.0`. **The promise (WP2.6):**

- **Semantic versions.** A patch changes no meaning; a minor adds something an older reader can skip; a major changes something it can't.
- **Migrating keeps the original.** `openProgram` never changes what it's given. It returns the migrated program and the original, and WP8 keeps the original file beside the new one.
- **An older app opens a newer file read-only,** with a plain message: "This film was made with a newer StoryStage. You can watch it and read its code, but not change it. Update StoryStage to change it." A `readOnly` result is still checked, with unknown properties and kinds skipped, so a file can't dodge validation by claiming a future version. It can't be edited: `EditSession` refuses every edit.
- **Deprecated nodes stay readable for two major versions.** A kind deprecated in version 2 must still be accepted, by migration, until version 4.
- **A changelog:** `packages/ast/CHANGELOG.md`.

`openProgram(json)` returns one of:

| Status | Meaning |
|---|---|
| `ok` | Current version and valid |
| `migrated` | Older, brought up to date and valid. Has `from` and `original` |
| `readOnly` | Newer. Has `message` |
| `broken` | Not a program, or invalid. Has `message` in plain words and `problems` for developers |

A migration is a function from one version's JSON to the next, listed in `MIGRATIONS`, and migrations chain. Each has a test with a stored example of the older format. There are none yet: 1.0.0 is the first version.

## 8. Tests

| Rule | Test | Level |
|---|---|---|
| Full undo gives the original, byte for byte (section 5) | `properties.test.ts`: random programs and edit sequences (fast-check) | Unit, property-based |
| Every valid edit keeps the program valid (section 4.2) | `properties.test.ts`, after each edit | Unit, property-based |
| Redo after undo gives the same program | `properties.test.ts` | Unit, property-based |
| The schema is a real JSON schema and our interpreter agrees with Ajv | `schema.test.ts`, valid and damaged programs | Unit |
| Each rule in section 2 | `validate.test.ts`, one failing program per rule | Unit |
| Each operation, its inverse and each refusal (section 4) | `edits.test.ts` | Unit |
| Ids (section 3) | `ids.test.ts` | Unit |
| Grouping, history, subscribers (section 5) | `session.test.ts` | Unit |
| Text and spans (section 6) | `text.test.ts` | Unit |
| Versions and migrations (section 7) | `versions.test.ts` | Unit |
