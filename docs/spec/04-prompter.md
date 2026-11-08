# 04 Prompter

- **Covers:** Protocol, context, tools, modes, story coach, plan before change, errors (from StoryStage 1 spec 01)
- **Work package:** WP13.1
- **Owner:** S7
- **Status:** written (WP13.1). Tool and procedure names follow Alice's vocabulary and stay provisional until specs 01 and 02 are written; section 11 lists what other sessions need to settle.
- **Carried over from:** StoryStage 1 spec 01 (Prompter protocol); see `docs/carried-over/` and its note on what changes. Section 10 lists every difference.

## 0. Decisions this spec relies on

- [0005 API key](../decisions/0005-api-key.md): the key stays out of web code.
- [0019 Prompter model](../decisions/0019-prompter-model.md): `claude-opus-5-5`, configurable in one place.
- [0022 Off switches](../decisions/0022-off-switches.md) and [0028 Host interface](../decisions/0028-host-interface.md): the browser version has no transport; the studio learns what exists from its host.
- [0030 Age range](../decisions/0030-age-range.md): 6 to 13, provisionally.
- [0034 Teacher Prompter levels](../decisions/0034-prompter-levels.md): Off, Explain only, Plan only, Full.
- [Spike 1.6](../decisions/spike-1.6-key-path.md): the key path through Rust and a Tauri channel.
- `docs/decisions.md`, "Prompter: plan before change" and "Prompter models by mode".
- `CLAUDE.md` rules 1 to 4 and 9.

## 1. Protocol

### 1.1 Where a request is made

`packages/prompter` builds each request in TypeScript, without the key, and hands it to a `PrompterTransport` (`packages/prompter/src/transport.ts`). In the Tauri apps the native layer checks it (section 1.8), adds the key and streams the reply back as `PrompterEvent`s. In the browser version the transport is `offTransport`, so no Prompter feature appears. Tests use `tools/fake-claude`.

### 1.2 Request settings

The body is a Messages API request. These settings hold for every mode unless the next table changes them.

| Setting | Value | Why |
|---|---|---|
| `stream` | `true`, always | Long tool inputs; the Stop button |
| `thinking` | Not sent | Adaptive thinking is the default on these models and can't be turned off on Opus 5.5 |
| `tool_choice` | Not sent (`auto`) | Opus 5.5 rejects forced tool choice |
| Sampling (`temperature`, `top_p`, `top_k`) | Never sent | Rejected |
| `tools` | The whole list in section 3, every request, in every mode | `tools` is part of the conversation's prefix (section 1.5); section 4 says how modes limit them |
| Each tool | `strict: true`, `eager_input_streaming: true` | Schema-shaped inputs, streamed. Inputs are still validated before running, because streamed input can be cut off |
| `cache_control` | `{ "type": "ephemeral" }` at the top level | Automatic caching; the stable content comes first |

**Thinking blocks.** Under the default display they arrive with empty text and a `signature`. They count towards `max_tokens`. The conversation keeps them exactly as they came, including the empty ones: never drop or rewrite a block because its text is empty. The panel never shows them. Read content by block `type`, never by position.

### 1.3 Settings by mode

One table in `packages/prompter/src/models.ts`, the one place decision 0019 asks for. Nothing else names a model.

| Mode (`PrompterMode`) | Model | `output_config.effort` | `max_tokens` | `fallbacks` |
|---|---|---|---|---|
| `explain` | `claude-opus-5-5` | `low` | 16000 | `"default"` |
| `storyCoach` | `claude-opus-5-5` | `low` | 16000 | `"default"` |
| `scriptCheck` | `claude-opus-5-5` | `low` | 16000 | `"default"` |
| `showMeHow` | `claude-opus-5-5` | `medium` | 32000 | `"default"` |
| `buildIt` | `claude-opus-5-5` | `medium` | 32000 | `"default"` |

**Moving to mode routing (WP24.3).** The decision is a lower-cost model for Explain, the story coach and the script check, and the evaluation set runs on a model before requests move to it (13.7). The table starts on one model and changes to `claude-haiku-5-5` for those three modes once the set has run on it. When it does:

- `fallbacks` comes off those three rows and so does the beta in section 1.4, because Haiku 5.5 has no server-side fallback. A refusal there goes straight to the learner (section 7).
- Haiku's lower price holds only for prompts of 100,000 input tokens or fewer, which is one reason for the conversation limit in section 1.5.
- Each model keeps its own prompt cache, so a learner switching between modes pays for a cache write on each model. The evaluation run should report this.

### 1.4 Refusal fallback

Requests on Opus 5.5 set `fallbacks: "default"` with the beta `server-side-fallback-2026-07-01`. If a safety classifier declines a request, the API runs it again on a suitable model in the same stream. This stops a wrong decline from becoming an outage in a lesson.

- Beta names can't go in the body: they're an `anthropic-beta` header, which the native layer adds. `PrompterRequest.betas` lists them, and the native layer checks that list against its allowlist.
- A `fallback` content block marks the switch; it arrives as an ordinary `content_block_start`. A `fallback_message` entry in `usage.iterations` says a fallback model served the reply. The panel shows nothing different.
- Echoing such a turn back is the one exception to "keep blocks exactly": omit `thinking`, `redacted_thinking` and `tool_use` blocks that come before the final `fallback` block. Text blocks and everything after the block go back as they came.
- `stop_reason: "refusal"` on the final message means every model declined. The client branches on `stop_reason`, never on `stop_details`, which can be null.

### 1.5 Conversations are append-only

The order in a request is `tools`, then `system`, then `messages`. Nothing that changes between turns sits above the last cache breakpoint.

**Scope.** One conversation per open production. It ends when the production closes, when the learner presses **New conversation**, or at the limit below. Conversations are never saved (`packages/production`: "Never stored in a production").

**The rule.** Within a conversation `system` and `tools` stay byte-identical, and `messages` only ever grows. Later turns are appended; earlier ones are never edited, reordered or trimmed. This is required as well as tidy: a thinking block is bound to everything before it, and for API accounts created on or after 31 August 2026, which is every key a school will set up for StoryStage 2, replaying a block after an earlier turn has changed is a 400.

**The limit.** When a reply reports more than 100,000 input tokens (the sum of `input_tokens`, `cache_read_input_tokens` and `cache_creation_input_tokens`), the next request starts a new conversation. The panel says "Starting a fresh conversation. The Prompter can still see your whole production." Nothing the learner made is lost: the production, the storyboard and any agreed plan go in the new conversation's first turn, and only the chat itself is left behind. It never happens during a tool loop; a build finishes first.

**Changing mode** appends a `role: "system"` message straight after the learner's turn (section 4.2). Changing model or effort between turns is allowed: those fields aren't part of the prefix. Thinking blocks a model can't read are dropped by the API, free of charge; the client sends them anyway.

### 1.6 The tool loop

Stream the reply, then look at `stop_reason` before doing anything else:

| `stop_reason` | What happens |
|---|---|
| `end_turn` | The reply is finished. |
| `tool_use` | Run each `tool_use` block in order, then return all the `tool_result` blocks in one user message and send the next request. |
| `max_tokens` | No tools run. Keep what already landed; section 7. |
| `refusal` | No tools run, and any partial reply is discarded. Section 7. |
| `pause_turn` or anything unknown | No tools run. Treat it as the Prompter couldn't finish; section 7. |

A reply that ended any way but `end_turn` or `tool_use` is never added to the conversation: a cut-off `tool_use` has no result to go with it, so it can't be sent back. If the request kept no reply at all (a refusal, a cut-off first reply, an error, Stop before anything came back), the session also takes back the learner's turn and mode message it added for that request. Otherwise a mode message would be followed by the next learner turn, which the API refuses. This edits nothing a thinking block is bound to, because every one of those blocks comes before the last kept reply, and nothing after it is bound. If the request kept some replies before it ended, they stay, with their tool results, and the next learner turn follows them (two user turns in a row are allowed).

- **Limit:** 25 tool calls in one learner request, counted across the whole loop. At the limit the loop stops, and the Prompter says what it finished and why it stopped.
- **Validation.** Parse each input strictly from the accumulated `partial_json`, then validate it against the tool's schema and the rules JSON Schema can't express under strict mode (ranges, lengths). A failure doesn't run the tool: it returns `is_error: true` with `bad_argument`.
- **Retries.** The same step failing three times ends the loop (section 7).
- **Stop button.** Aborts the transport. Whatever already landed stays in the undo group, and the panel offers **Undo this request**.

### 1.7 One request, one undo step

Everything a learner request changes is grouped into one undo step, labelled in plain words after the request ("Add cat and dog"; rule 9). It goes through WP2 edit operations like any other change, so a whole build undoes in one press.

### 1.8 What the native layer must check (WP15.2)

For S8. Each item is something this spec makes checkable.

- `model` is in the allowlist for `mode`, and `max_tokens` is at or under that mode's ceiling.
- `betas` is a subset of `server-side-fallback-2026-07-01`, and `fallbacks` is absent or `"default"`.
- `system` hashes to the pinned value, and `tools` hashes to the pinned value. Both are fixed for a release: section 2.1 keeps everything that varies out of them.
- Each `role: "system"` entry in `messages` is exactly one of the pinned mode messages (section 4.2).
- No top-level `thinking`, `tool_choice` or sampling field, no image content, and no key (`containsSecret`). Thinking blocks in the history are expected.
- The per-minute and per-day caps (24.5), retried at most twice with backoff and jitter.

### 1.9 Pins

The native layer pins `system`, `tools` and the mode messages (section 1.8; spec 05, section 2.3). `packages/prompter/src/pins.ts` makes them:

- `system` is `releaseSystem()`: the instructions, `catalogText()` from `@storystage/story-api`, and the shipped Backstage catalogue. That catalogue is kept in `src/shipped-catalogue.ts`, an exact copy of `prompter-catalogue.txt` at the commit `backstage.lock.json` pins; a test fails if its SHA-256 differs from the lock's.
- `tools` is `TOOLS`, and the mode messages are `pinnedSystemMessages()`.
- `system` and `tools` are hashed as JSON with keys sorted and no spaces (`canonicalJson`); mode messages as their text. A test hashes S8's `gate/fixtures/hash.json` the same way and gets its `sha256`.

`pnpm prompter:pins` writes `apps/desktop/src-tauri/gate/pins.json`, and `gate/fixtures/release-request.json`: a real Build it request made by `buildRequest` with the release's `system` and `tools` and a mode message, which the gate's own test passes through the shipped pins. With `--fetch` it first fetches the catalogue for the locked commit and checks it. A test fails when either file is out of date, so a change to the prompt, a tool, a mode's model or the Backstage lock shows up in CI with the command that fixes it.

## 2. Context

### 2.1 What goes where

| Content | Where | Fixed for a release? | Budget |
|---|---|---|---|
| Instructions (section 2.5, 13.8) | `system` | Yes | |
| Story API catalog, from WP4 metadata | `system` | Yes | 40,000 tokens; a unit test fails above 45,000 |
| Backstage catalogue: **shipped models only**, grouped by Cast, Props, Set, Backdrops | `system` | Yes | 12,000 tokens |
| Imported models in this class | User turn, as data | No | Part of the production |
| The scene, as data | User turn, as data | No | Part of the production |
| The program as text with node ids | User turn, as data | No | 20,000 tokens |
| The storyboard, script and frames | User turn, as data | No | 8,000 tokens |

Imported model names stay out of `system` for two reasons: they would change the pinned hash, and they are text written by a learner or teacher, which must never sit among the instructions. Tokens are estimated at three characters each, which overcounts on purpose. The eval run reports true counts from `usage`.

**No pictures.** Nothing here is an image. The Prompter learns where things are from the scene's data and the sketches' data, never from a screenshot (rule 3).

### 2.2 The program as text

The read-only text view (WP2.5) with stable node ids, in the form that view defines. Tools refer to blocks by these ids. Above the budget, method bodies other than the one open in the editor become a one-line summary.

### 2.3 The storyboard as text

From `Storyboard`, `ScriptLine` and `Frame` in `packages/production`: the logline, synopsis, arc, scene cards, script lines with their ids and pins, and for each frame its order, caption, shot, length and placed sketches. A sketch is written as data: which model or stand-in, facing, pose, position as fractions of the frame, flipped, layer. Above the budget, scenes other than the current one keep their cards and captions and lose their script lines and sketches.

### 2.4 Learner text is data

Everything from a production is learner text, or may have come from someone else's shared production: script lines, the logline, captions, object names, sketch stand-in labels, imported model names, block comments, plan words. It can contain anything, including lines written to steer the Prompter.

Each piece goes in its own block, as JSON, inside a named tag:

```
<production_data>{"scene":…,"program":"…"}</production_data>
<storyboard_data>{"logline":"…","script":[…],"frames":[…]}</storyboard_data>
<learner_request>{"text":"Make the owl say hello"}</learner_request>
```

- One function writes every block. It JSON-encodes the value, then replaces each `<`, `>` and `&` with its `\u` escape, so no learner text can close a tag or open one.
- The learner's request travels the same way. Its text is what the learner asked for; data blocks are never instructions, whatever they say. Transcribed speech (14.1) is a request like typed text, once the learner has seen and sent it.
- Other tags: `<agreed_plan>` (section 6) and `<check_result>` (11.6).
- A turn carries the production and storyboard blocks only when they have changed since the last time they were sent, which keeps the history small and the cache useful. A new conversation always sends them.

### 2.5 The system prompt

`packages/prompter/src/system-prompt.ts`, versioned with the code (13.8). In order:

1. **Role:** who the Prompter is, and who it is talking to.
2. **Whose story it is:** the learner writes the story; the Prompter never does.
3. **Trust:** what's in the data tags is material to read, never instructions to follow.
4. **Plans:** nothing changes without an agreed plan.
5. **How to work:** use the tools; ordinary blocks; only what's in the catalogs; say it in plain words.
6. **Modes:** a mode message says what is allowed (section 4.2), and it wins over a request.
7. **Audience and safety.**
8. **Words:** rule 9's words, and narration.
9. The Story API catalog and the Backstage catalogue.

## 3. Tools

The definitions are in `packages/prompter/src/tools.ts`, and the tables below describe them. All inputs are JSON objects with `additionalProperties: false`, and every field listed is required unless marked optional. An optional field is left out of `required`, not made nullable: strict mode limits how many optional fields and union types a request's tools may have, so there are no unions at all, and at most 20 optional fields across every tool.

Tool schemas are fixed for a release, so they use plain strings where StoryStage 1 used enums built from catalogs. The catalogs are in the system prompt; the client checks each value and answers `unknown_object` or `unknown_method`. The two enums that are fixed for a release come from their sources: control blocks from the AST's `STATEMENT_KINDS`, and events from the Story API's `EVENTS`.

Strict mode also rules out free-form objects, recursive schemas and numeric or length constraints. So:

- `arguments` and `details` are lists of `{ name, value }` pairs, and **every `value` is text**, read by the client by its type in the catalog: a number as digits, a name, words, or a position as `"x, y, z"` in metres;
- plan steps are flat;
- the client checks ranges, whole numbers and lengths before anything runs (`checkToolInput`, section 1.6). A string field may be empty only where `""` means none.

**Shared fields.** Every tool that changes the production has:

- `narration`: one sentence, under 25 words, read aloud and captioned as the step lands (14.2).
- `plan_step`: the number of the agreed step this call builds (section 6.4).

**Result format (all tools):** `{"ok": true, "ids": {…}, "summary": "…"}`, or `{"ok": false, "error": "<code>", "message": "<what was wrong and what is allowed>"}` with `is_error: true`.

**Error codes:** `unknown_object`, `unknown_block`, `unknown_method`, `unknown_frame`, `unknown_line`, `bad_argument`, `not_allowed_here`, `would_break_program`, `limit_reached`, `no_agreed_plan`, `not_in_plan`, `not_in_script`.

### 3.1 Tools from StoryStage 1

#### `add_model`

Adds a Backstage model to the scene, as Backstage's add does.

| Field | Type | Notes |
|---|---|---|
| `backstage_item` | string | An id from the catalogue or the production's imported models |
| `name` | string | Made unique if taken (`cat2`); the result returns the final name |
| `position` | `{x, y, z}` numbers, metres | `y` 0 is ground level |
| `turn_degrees` | number, optional | About the vertical axis from the default facing |
| `scale` | number, optional | 0.05 to 20 |
| `narration`, `plan_step` | | |

#### `set_property`

Changes how an object starts in the scene.

| Field | Type | Notes |
|---|---|---|
| `object` | string | A name in the scene (`cat`, `camera`, `ground`) |
| `property` | enum `position`, `turn_degrees`, `scale`, `paint`, `opacity`, `vehicle` | |
| `value` | string | A position as `"x, y, z"`, a number, a paint name or `#rrggbb`, opacity 0 to 1, or the object it rides on; checked per property |
| `narration`, `plan_step` | | |

#### `insert_statement`

Adds one procedure call to a method.

| Field | Type | Notes |
|---|---|---|
| `method` | string | The method's name in the program text |
| `parent_block` | string, optional | Id of a control block; default is the method's body |
| `position` | string | `end`, or a whole number as text |
| `target` | string | An object name, `this` for the scene, or a joint in the catalog's form |
| `procedure` | string | A Story API procedure (`move`, `turn`, `say`, `moveTo`, `turnToFace`) |
| `arguments` | list of `{name, value}` | Required parameters |
| `details` | list of `{name, value}`, optional | `duration`, `animationStyle`, `asSeenBy` and so on |
| `line` | string, optional | A script line id; see section 6.5 |
| `narration`, `plan_step` | | |

#### `insert_control`

Adds a control block that later statements can go inside.

| Field | Type | Notes |
|---|---|---|
| `method`, `parent_block`, `position` | as above | |
| `kind` | enum `doInOrder`, `doTogether`, `count`, `while`, `if`, `forEach`, `eachTogether` | The AST's names |
| `count` | integer, optional | For `count`, from 1 |
| `condition` | object, optional | For `while` and `if`: `{target, function, arguments}`; a plain true or false is `target` `""` and `function` `"true"` or `"false"` |
| `items` | list of object names, optional | For `forEach` and `eachTogether` |
| `narration`, `plan_step` | | |

Result `ids.block`: the id to use as `parent_block` (for `if`, `ids.then` and `ids.else`).

#### `declare_procedure`

| Field | Type | Notes |
|---|---|---|
| `class` | string | `Scene`, or a class in the program |
| `name` | string | |
| `parameters` | list of `{name, type}`, optional | Types from the catalog |
| `narration`, `plan_step` | | |

Result `ids.method`: the name to use in `insert_statement`.

#### `add_event_listener`

| Field | Type | Notes |
|---|---|---|
| `event` | enum: the Story API's events (spec 02), except `sceneStart`, which every scene already has | `clickOnObject`, `keyPress`, `timer`, `proximityEnter`, `viewEnter` and the rest |
| `objects` | list of object names | Clicked objects (empty for any), the object moved by the arrow keys, or the first group |
| `other_objects` | list of object names | The second group for proximity and collision; otherwise empty |
| `number` | number, optional | Seconds between runs for `timer`; metres for proximity |
| `narration`, `plan_step` | | |

Result `ids.block`: the listener; passed as `parent_block`, blocks go into the handler.

#### `explain`

Changes nothing.

| Field | Type | Notes |
|---|---|---|
| `text` | string | Under 120 words; shown in the panel and read aloud |
| `highlight` | list of block ids or object names, optional | Flashed in the editor |

#### `read_project`

Changes nothing. Returns the latest production and storyboard data (sections 2.2, 2.3) when the Prompter needs them after several changes. Takes no fields.

### 3.2 Storyboard tools

#### `stage_scene`

Places a scene's cast, props, set, backdrop and camera from its frames, as Set the stage from the storyboard does (10.10), using the same code.

| Field | Type | Notes |
|---|---|---|
| `scene` | string | A scene id |
| `from_frame` | string, optional | The frame to take positions from; default the first |
| `narration`, `plan_step` | | |

It places only what the storyboard has. Anything else is `add_model` in a plan of its own. Stand-ins stay stand-ins.

#### `code_frame`

Starts building a frame's agreed plan, and returns where to build it. It adds no blocks itself, so it has no `narration` or `plan_step`. Blocks built after it in the same request are linked to that frame (10.8).

| Field | Type | Notes |
|---|---|---|
| `frame` | string | A frame id with an agreed plan |

Result `ids.method`, `ids.parent_block`. Answers `no_agreed_plan` if the learner hasn't pressed **Build these steps**.

#### `check_frame`

Changes nothing. Returns the latest result of the automatic check for a frame (11.6), so the Prompter can explain it in the learner's words. It doesn't run the check. Field: `frame`.

#### `script_check`

Changes nothing. Returns, for a scene or the whole production, facts about how the script and storyboard line up, worked out by code: lines not pinned to a frame, frames with no line, characters named in the script who aren't in the cast, cast never named, and frames whose planned length is shorter than the lines pinned to them. The Prompter explains those facts and may ask about them. It suggests no replacement words. Field: `scene`, optional.

### 3.3 Plan tools

#### `propose_plan`

Shows a plan to the learner. It changes nothing in the program.

| Field | Type | Notes |
|---|---|---|
| `frame` | string, optional | The frame it's for, if any |
| `steps` | list of plan steps (section 6.2) | 1 to 12 steps |

Result `ids.plan`, or errors naming each step that can't be built (section 6.3). After a successful result the Prompter ends its turn and waits.

#### `revise_plan`

Replaces the plan on show.

| Field | Type | Notes |
|---|---|---|
| `plan` | string | From `ids.plan` |
| `steps` | list of plan steps | |

### 3.4 Which tools run in which mode

The tool list never changes (section 1.5). The client decides what runs: a call the mode doesn't allow answers `not_allowed_here` and changes nothing.

| Tool | `explain` | `storyCoach` | `scriptCheck` | `showMeHow`, `buildIt` |
|---|---|---|---|---|
| `explain`, `read_project`, `check_frame` | Yes | Yes | Yes | Yes |
| `script_check` | Yes | Yes | Yes | Yes |
| `propose_plan`, `revise_plan` | | | | Yes |
| `code_frame` and everything that changes the production | | | | Yes, after an agreed plan, and never at the Plan only level |

**Nothing writes the story.** No tool can set the logline, the synopsis, a script line or a caption. Rule 4 is enforced by the absence of the tool, as well as by the prompt.

## 4. Modes

### 4.1 The modes

| Mode | What the Prompter does |
|---|---|
| **Explain only** (`explain`) | Answers questions about the production and how blocks work. Changes nothing. |
| **Story coach** (`storyCoach`) | Asks questions about the story (section 5). Changes nothing. |
| **Script check** (`scriptCheck`) | Explains `script_check`'s facts. Changes nothing. |
| **Show me how** (`showMeHow`) | Writes a plan, then builds it after the learner agrees, saying why each step is there as it lands. |
| **Build it** (`buildIt`) | Writes a plan, then builds the whole of it after the learner agrees, and sums up. |

### 4.2 Telling the Prompter the mode

The mode isn't in `system`, which can't change. Each mode has one fixed message, and it's appended as a `role: "system"` entry right after the learner's turn, on the first turn and whenever the mode or the level changes. Opus 5.5 and Haiku 5.5 both accept this with no beta. The texts are constants in `packages/prompter/src/system-prompt.ts`, so the native layer can pin them. They carry instructions only, never learner text.

### 4.3 Teacher levels

The levels pick from the modes (decision 0034); `prompter.enabled`, `prompter.explainOnly` and `prompter.planOnly` come from the policy (15.3), through the host interface.

| Level | Modes offered | Building |
|---|---|---|
| **Off** | None; the panel isn't shown | |
| **Explain only** | `explain`, `storyCoach`, `scriptCheck` | None |
| **Plan only** | Those, plus `showMeHow` and `buildIt`, which write and revise plans | None. The learner builds every block and ticks steps off |
| **Full** | All | After an agreed plan |

If `explainOnly` and `planOnly` are both set, Explain only wins. A malformed policy means Off (15.3). The native layer enforces these again; the client's check is what the learner sees, the native check is what can't be got round. When the daily cap's action switches a class to Explain only, the level changes as it would for a teacher, and the next turn carries the new mode message.

## 5. Story coach

The coach helps a learner think. The learner writes every word.

**It does:**

- Ask one question at a time, about who wants what, what stops them, what changes, and how it ends.
- Offer the arc templates (10.2) and say what each part is for.
- Say what it notices in the learner's own words: "Your logline says who Pip is, but not what Pip wants."
- Ask about gaps `script_check` finds.

**It never:**

- Writes or rewrites a logline, synopsis, scene heading, caption or script line, even when asked, even once, even as an example about the learner's story.
- Offers a list of ideas to pick from: choosing from a list isn't writing it.
- Finishes a learner's sentence, or names their characters.

**When asked to write it:** it says plainly that the story is the learner's, then asks the most useful next question. "Write my logline for me" gets something like "That one's yours to write. Who's your story about, and what do they want most?"

**General examples** are fine when they're about films rather than the learner's story: what a logline is, using a well-known kind of tale. A spelling mistake can be pointed out; the learner fixes it.

The evaluation category "doesn't write the story" (`docs/eval/`) tests this, and the done-when line for WP13 allows no failures in it.

The same rule binds every mode. In Show me how and Build it, what a character says comes from the script or from the learner's own request (section 6.5).

## 6. Plan before change

Show me how and Build it never change anything until the learner agrees a plan (13.9). This is the same at every level that allows them.

### 6.1 The flow

1. The learner asks, or presses **Code this frame**.
2. The Prompter calls `propose_plan`, made from the frame's sketches, its script lines and its shot.
3. The client checks the plan (section 6.3). Problems go back to the Prompter as an error it can fix, or are shown on the step if it can't.
4. The Prompter ends its turn. The panel shows the numbered plan, in plain words.
5. The learner edits it. These edits happen in the client, with no request and no cost: reorder by drag or keyboard, delete, change a value with the same dropdowns the blocks use, add from a short menu. **Why this step?** reads the step's `why`.
6. The learner can also ask for changes in words. That's an ordinary turn, and the Prompter answers with `revise_plan`.
7. The learner presses **Build these steps**. The next turn carries the plan in `<agreed_plan>`.
8. The Prompter builds it, in order, step by step, with one `plan_step` on each call. Each step's words become a comment above its blocks, and each step is highlighted as it lands.
9. The panel confirms, and **Undo this build** is offered. It's one undo step.

The plan isn't a pending tool call: `propose_plan` returns at once, so nothing waits on a stream while a learner thinks, and a question about the plan is a normal turn.

### 6.2 Plan steps

| Field | Type | Notes |
|---|---|---|
| `words` | string | The step in plain words, under 20 words |
| `kind` | enum `do`, `add`, `change`, `when`, `stage` | A Story API call; add a model; change how something starts; an event; set the scene from the storyboard |
| `actor` | string | Object name, or `scene` for `stage` |
| `action` | string | For `do`: a Story API procedure. For `add`: a Backstage id. For `change`: a property. For `when`: an event kind. For `stage`: a scene id |
| `target` | string | Object or marker it acts on, or `""` for none |
| `details` | list of `{name, value}` | |
| `line` | string | A script line id, or `""` for none |
| `sketch` | string | A placed sketch id, or `""` for none |
| `together` | boolean | Runs at the same time as the step before it |
| `repeat` | integer | Times to run; 1 for once |
| `why` | string | One sentence, under 25 words |

Steps are flat, because strict mode allows no recursive schemas: a plan expresses "at the same time" and "repeat", not nesting. A request that needs more than that is a sign to suggest smaller steps.

### 6.3 Checking a plan

Before a plan is shown, and again when the learner presses **Build these steps**, code checks each step against the Story API and the production: the actor exists; the action exists on its class; the target exists; required details are there; the line and sketch exist; an `add` names a real Backstage item or a stand-in. A step that can't be built says so in plain words on the step, before building, not after ("There's no owl in this scene yet. Add one first, or change who does this.").

### 6.4 The build matches the plan

Code, not trust, keeps the build to the plan. During a build the executor holds the agreed steps, and each change call must name a `plan_step` and match it: same actor, same action, same target, same details and same line. Anything else answers `not_in_plan` and changes nothing. Supporting calls that a step needs, such as the `doTogether` block for steps marked `together`, must name the step they serve.

When the loop ends, every agreed step must have landed. A step that didn't is reported by number (section 7). So if the learner changed "2 metres" to "3 metres", "2 metres" can't reach the program.

### 6.5 What characters say

Text in `say`, `think` and the speak line block comes from one of two places, and code checks it: a script line (`line`), or, outside a frame, the learner's own request. For a frame, the words must match the line exactly, or the call answers `not_in_script`. The Prompter never makes up a line of dialogue.

### 6.6 Plan only

In Plan only (the `prompter.planOnly` policy, or the level), the Prompter writes and revises plans, but **Build these steps** isn't offered and change tools answer `not_allowed_here`. The learner builds the blocks and ticks steps off as the frame strip checks them (11.6).

### 6.7 Kept with the frame

The agreed plan is saved with the frame in the storyboard data, not in the program, with a record of what the learner changed, so a teacher can see it. It's pseudonymous in the study log (7.13). Plans made with no frame last as long as the conversation.

## 7. Errors

Errors say what happened and what to do next, with no apologies (rule 9). The native layer reports one `TransportErrorCode` per cause.

| Situation | Code | Message in the panel | Action |
|---|---|---|---|
| Browser version, or the policy is off | `prompter_off` | Nothing: the panel isn't shown. | |
| No key yet | `no_key` | "The Prompter isn't set up yet." | **Open set-up** |
| 401, invalid or revoked key | `key_revoked` | "Your Claude key isn't working. Open set-up to check it." | **Open set-up** |
| 402, no credit | `no_credit` | "Your Claude account has run out of credit. An adult can add more in the Claude Console." | Link text, not opened automatically |
| 429, after the native layer's two retries | `rate_limited` | "The Prompter is busy. Carry on and try again shortly." With `retryAfterSeconds`: "Try again in N seconds." | **Try again** |
| 5xx or 529 | `overloaded` | "Claude is having trouble right now. Try again in a minute." | **Try again** |
| No network | `offline` | "You're offline, so the Prompter can't help right now. Everything else in StoryStage still works." | |
| A daily or class limit | `cap_reached` | "Your class has used the Prompter's time for today. You can carry on without it." | |
| The school lock stopped it | `refused_by_policy` | "Your school has turned this off." | |
| The native layer refused the request | `refused_by_allowlist` | "The Prompter can't do that here. Restart StoryStage, and tell your teacher if this happens again." | |
| Stop pressed | `cancelled` | "Stopped." | **Undo this request**, if anything landed |
| Anything else | `internal` | "The Prompter couldn't finish this step." | **Try again** |
| `stop_reason: "refusal"` | | "The Prompter can't help with that one. Try a different idea." | |
| `stop_reason: "max_tokens"` or `pause_turn` | | "The Prompter couldn't finish this step." plus the steps that did work | **Undo this request** |
| The same step failed three times | | "The Prompter couldn't finish this step." plus the steps that did work | **Undo this request** |
| 25 tool calls | | "The Prompter stopped after 25 steps. Ask again for the next part." | **Undo this request** |
| An agreed step didn't land | | "Step 3 wasn't built." plus the steps that did work | **Undo this build** |

`TransportErrorCode` has no code for a bad request (400). That means a bug in the client, and it's `internal`.

## 8. Tests

How each rule is tested (`09-testing.md`). Every level uses `tools/fake-claude` or `scriptedTransport`; no live key in CI.

| Rule | Level | Where |
|---|---|---|
| Body has no key, no image, no `thinking`, no sampling; settings match the mode table (1.2, 1.3) | Unit | `packages/prompter` |
| `system` and `tools` are byte-identical across a conversation, and `messages` only grows (1.5) | Fake-server integration: consecutive requests are compared | `tools/fake-claude` |
| A new conversation starts past the limit, never in a tool loop (1.5) | Fake-server integration | `tools/fake-claude` |
| `stop_reason` is checked before tools; refusal and `max_tokens` run no tools (1.6) | Fake-server integration, including cut-off tool input | `tools/fake-claude` |
| Fallback turns echo correctly (1.4) | Fake-server integration | `tools/fake-claude` |
| The 25-call limit and the three-failure rule (1.6) | Fake-server integration | `tools/fake-claude` |
| A whole request is one undo step (1.7) | Headless tests on the program | `packages/prompter` |
| Catalogs stay in budget (2.1) | Unit | `packages/prompter` |
| Learner text can't close a data tag (2.4) | Unit, including every tag name inside learner text | `packages/prompter` |
| Modes and levels gate tools (3.4, 4.3) | Unit | `packages/prompter` |
| System prompt and mode messages hold the rules, and use rule 9's words (2.5) | Unit | `packages/prompter` |
| A plan is checked before it's shown (6.3) | Unit | `packages/prompter` |
| Edits to a plan reach the blocks exactly; off-plan calls change nothing (6.4) | Headless tests on the program, and the evaluation set | `packages/prompter`, `docs/eval/` |
| Dialogue comes from the script (6.5) | Unit | `packages/prompter` |
| Each error maps to its message (7) | Unit, each code; fake server for HTTP status to code | `packages/prompter` |
| Quality overall: refusals, story, injection, plans | Evaluation set: recorded in CI, live by the owner | `docs/eval/` |

## 9. Evaluation

`docs/eval/` holds the set, the starting productions, the check types and the scoring rules. The bars come from WP13: at least 85% of checks on recorded responses; at least 75% live, with no failures in the refusal, "doesn't write the story" and "build matches the plan" categories.

## 10. Differences from StoryStage 1 spec 01

| Area | StoryStage 1 | StoryStage 2 | Why |
|---|---|---|---|
| Client | Java SDK, key in the app | TypeScript body, key in Rust, checked first | Rule 1, 13.2, 15.2 |
| Beta header | Set by the SDK | `PrompterRequest.betas`, added by the native layer | The webview never makes the HTTP request |
| Fallback | On every request | The same on Opus 5.5; none on Haiku 5.5 | Haiku 5.5 has no server-side fallback |
| Long conversations | Past 150,000 tokens, drop the oldest turns | Past 100,000 tokens, start a new conversation | Trimming history is a 400 on new accounts; Haiku's price rises above 100,000 |
| Project text | In every user turn | Only when changed since it was last sent | Keeps the history down, so the limit comes later |
| Tools by mode | Explain only instructions in the prompt | Same list always; the client answers `not_allowed_here` | Changing `tools` breaks the conversation's prefix |
| Mode | In the system prompt | A fixed `role: "system"` message per mode | `system` can't change within a conversation |
| Effort | Medium for Build it, low for Explain | The same, with the story coach and script check at low | Opus 5.5's default is medium, so it's set explicitly |
| `max_tokens` | 32000 | 32000 to build, 16000 otherwise | Thinking counts towards it; a lower cap on read-only modes |
| Screenshot | Sent for placement | Dropped | Rule 3 |
| Catalogs | Java reflection; gallery with Sims 2 classes | `story-api` metadata; Backstage shipped models | No Alice code; section 2.1 |
| Imported models | None | In the user turn, as data | Hash pinning and injection |
| Learner text | In the user turn | Delimited JSON, with `<`, `>` and `&` escaped | 13.2, injection |
| Tool enums | Built from catalogs | Plain strings, checked by the client | Schemas are pinned per release |
| `arguments`, `details` | Keyed objects | Lists of `{name, value}`, every value as text | Strict mode needs `additionalProperties: false` on every object, and limits unions |
| Names | `do_together`, `mouse_click_on_object` and so on | The AST's and the Story API's own names (`doTogether`, `clickOnObject`) | One vocabulary across the program, the editors and the Prompter |
| Changes | Applied as tools run | Only after an agreed plan, and checked against it | 13.9 |
| Show me how | Add blocks one at a time | Plan first, then step by step | 13.9 |
| New tools | | `stage_scene`, `code_frame`, `check_frame`, `script_check`, `propose_plan`, `revise_plan` | 13.4 |
| New modes | | Story coach, Script check | 13.5, 24.3 |
| Error codes | Seven | Twelve: adds `unknown_frame`, `unknown_line`, `no_agreed_plan`, `not_in_plan`, `not_in_script`; `would_break_world` is now `would_break_program` | |
| 429 message | "Trying again in N seconds" | "Carry on and try again shortly" | 15.2's wording for a class |
| Audience | Aged about 10 and up | 6 to 13, provisional | Decision 0030 |

## 11. Open points for other sessions

These don't block WP13a. Each is needed by WP13b or WP13c.

| Needs | From | For |
|---|---|---|
| Grouping edit operations into one undo step: done (`EditSession.begin`). Still wanted: a way to name the group when it closes, so a request's undo label can say all it changed ("Add cat and dog") rather than its first change | S2 (WP2.3, spec 01) | Section 1.7 |
| The production's undo session, holding program edits and scene set-ups in one step. Until it exists, `add_model`, `set_property` and `stage_scene` answer `not_allowed_here` | S4, S2 (WP8.2, spec 03 section 2.1) | Section 3.1, 3.2 |
| Linking a frame's blocks to the frame (10.8), for `code_frame` | S4, S5 (WP10.8) | Section 3.2 |
| The text view's node id form. Until then the Prompter's project data lists each block with its id beside the text view | S2 (WP2.5) | Section 2.2 |
| Final procedure, detail and event names; a metadata export | S6, S3 (WP4.1, WP4.2, spec 02) | Section 3, the catalog |
| A `plan` field on `Frame` in `packages/production` | S4 | Section 6.7, a contract pull request |
| The allowlist checks in section 1.8, and the beta in the transport contract | S8 (WP15.2) | Section 1.8 |
| Section 2 of `09-testing.md` should point here and at `docs/eval/` | S1 | Section 8 |
| Workplan 17.3 still lists scene pictures in the DPIA's scope. The owner confirmed on 31 Oct 2026 that no picture is ever sent, and 13.3 is corrected | D | Section 2.1 |
