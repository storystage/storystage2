> **StoryStage 2 note (WP0.7).** Copied unchanged from storystage/storystage@325c73d (17 Oct 2026). It is a reference, not a StoryStage 2 spec.
> Replaced by: docs/spec/04-prompter.md. Owner: S7. Work package: WP13.
>
> What changes in StoryStage 2:
> - The request is built in TypeScript (`packages/prompter`) without the key and sent through a Tauri command to the native layer, which checks it against the policy enforcement point and then adds the key (13.2, 15.2). There is no Java SDK, and the web code never sees the key.
> - The project text is the program's read-only text view with stable node ids (WP2.5), not Tweedle source with UUID prefixes. The API catalog comes from `packages/story-api` (WP4), not from Java reflection.
> - The gallery catalog becomes the **Backstage** catalog in four sections (Cast, Props, Set, Backdrops), with no Sims 2 classes.
> - **No screenshots** (section 2.4 is dropped): camera images, microphone audio and pictures never go to the Prompter (CLAUDE.md rule 3). The scene, the storyboard and the sketches are described as data.
> - Tools become edit operations on the program (WP2.3). A whole request is one undo step. **Show me how** and **Build it** show a numbered plan that the learner edits before anything is built (plan before change, 13.9). Storyboard tools and the story coach are new (WP13c). The Prompter never writes the logline, synopsis or script.
> - Learner text is sent as delimited data, and prompt injection gets its own evaluation category (13.2, 13.7). Models are chosen per mode, with a lower-cost model for Explain and the story coach (WP24.3).
> - The audience line ("aged about 10 and up") waits on the owner's age-range decision.
> - Kept: the request settings (adaptive thinking, effort per mode, streaming, strict tools, refusal fallback, caching order), the tool loop and its limits, the result and error format, and the learner-facing error messages, which are re-checked against the plain-words rules.

---

# 01 Prompter protocol

Implements workplan WP1.2 (tools), WP1.3 (context) and WP1.4 (Claude requests).

## 1. Request shape

| Setting | Value | Why |
|---|---|---|
| Endpoint | Messages API through `com.anthropic:anthropic-java` (`AnthropicOkHttpClient.builder().apiKey(key)`; `baseUrl` overridden only in tests) | Official SDK; explicit key, never `fromEnv()` |
| Model | `claude-opus-5-5` | Project default |
| Thinking | Adaptive (the default on this model; the `thinking` field is not sent) | Disabled thinking is rejected by this model |
| Effort | `output_config.effort`: `medium` for "Build it", `low` for "Explain" | Opus 5.5's default is `medium`; set it explicitly |
| Streaming | Always (`createStreaming`), `max_tokens` 32000 | Long tool inputs; Stop button |
| Tools | Section 3, all `strict: true`, `eager_input_streaming: true`; inputs re-validated before running | Schema-valid arguments; streamed inputs can be truncated |
| Tool choice | `auto` | Forced tool choice is rejected by Opus 5.5 |
| Refusal fallback | Beta `server-side-fallback-2026-07-01`, `fallbacks: "default"` | A declined request is retried on a suitable model by the server |
| Caching | Top-level automatic cache control; stable content first (tools, then system prompt with the catalog) | Catalog is about 40,000 tokens and identical every turn |

**Message order per request:** `tools` (fixed list), `system` (fixed instructions, API catalog, gallery catalog), then `messages`. Each new user turn carries the current project text, the student's request, and an optional screenshot. Nothing that changes between turns goes above the cache breakpoint.

**Conversation scope:** one conversation per open world. It ends when the world closes or the student presses **New conversation**. If the history grows past 150,000 input tokens, the oldest turns are dropped (keeping the last 6) and the latest project text is resent.

**The tool loop:** stream the response, then run each `tool_use` block in order on the Swing thread. Return all `tool_result` blocks in one user message, and repeat until `stop_reason` is `end_turn`, or 25 tool calls have run in one request (at which point the Prompter says it stopped and why). Before running any tool, check `stop_reason`: on `max_tokens` or `refusal`, no tools run.

## 2. Context

### 2.1 API catalog (in the system prompt, cached)
Built **when the Prompter starts**, by reflection over the same annotations the IDE uses for its block palette (`ApiCatalog`; this replaces the planned build-time step and gives the same result with no extra tooling):
- For every class in `org.lgna.story` that the IDE shows: class name, superclass, and each method marked `@MethodTemplate` with visibility `PRIME_TIME` (not `TUCKED_AWAY` or `COMPLETELY_HIDDEN`).
- Parameter names from `classinfos.json` (Java reflection doesn't keep them); parameter types; and the `Detail` keyword arguments each method accepts (`duration`, `animationStyle`, `asSeenBy`, …) with their value types.
- Enum constants used as arguments (`MoveDirection.FORWARD`, `TurnDirection.LEFT`, …).

It is rendered into the system prompt in a compact text form (one line per method). Budget: 40,000 tokens; a unit test fails if it exceeds 45,000.

### 2.2 Gallery catalog (in the system prompt, cached)
Generated at build time from the model resource enums (`org.lgna.story.resources.*`, including the Sims 2 classes when present). One line per resource: gallery path (for example `Quadruped/Cat/AbyssinianCat`), resource class and constant, the Alice class it creates (`SQuadruped`, `SBiped`, …), and a short display name. Budget: 12,000 tokens.

### 2.3 Project text (in each user turn)
The current world, written as Tweedle source with the existing `org.alice.serialization.tweedle.Encoder`. Only user-authored types are included (the Scene, Program and user classes, with fields, methods and the generated set-up). Each statement (except comments) is preceded by a short id comment, `/*#a1f3*/`: the first 4–8 characters of the node's UUID, lengthened only to avoid collisions. Tools refer to blocks by these ids. Budget: 20,000 tokens; above that, method bodies other than the one open in the editor are replaced by a one-line summary.

### 2.4 Screenshot (optional, in the user turn)
Sent when the request involves placement or appearance ("Build it" mode, scene tools in the last turn), or when the student ticks "Let the Prompter see the scene". Taken from the scene view with the renderer's image capture, downscaled to at most 1024 px on the long side, as JPEG at quality 80.

## 3. Tools

All inputs are JSON objects with `additionalProperties: false`, and every field listed is `required` unless marked optional. Every tool that changes the world has a `narration` field: one sentence, under 25 words, read aloud and captioned as the step is applied.

**Result format (all tools):** `{"ok": true, "ids": {...}, "summary": "..."}` or `{"ok": false, "error": "<code>", "message": "<what was wrong and what is allowed>"}`, returned with `is_error: true` when `ok` is false. Error codes: `unknown_object`, `unknown_block`, `unknown_method`, `bad_argument`, `not_allowed_here`, `would_break_world`, `limit_reached`.

### `add_model`
Adds a gallery model to the scene, as the gallery's "add" dialog does.
| Field | Type | Notes |
|---|---|---|
| `gallery_item` | string, enum from the gallery catalog | e.g. `Quadruped/Cat/AbyssinianCat` |
| `name` | string, Alice identifier rules | Made unique if taken (`cat2`); the result returns the final name |
| `position` | `{x, y, z}` numbers, metres | Scene coordinates; `y` 0 is ground level |
| `turn_degrees` | number, optional | Rotation about the vertical axis from the default facing |
| `scale` | number, optional, 0.05–20 | Uniform resize |
| `narration` | string | |
Built with: the `AddManagedFieldComposite` edit path (`DeclareGalleryFieldEdit` plus set-up statements from `SetUpMethodGenerator`).

### `set_property`
Changes how an object starts in the scene (writes the generated set-up, as the scene editor's property sheet does).
| Field | Type | Notes |
|---|---|---|
| `object` | string | Field name in the scene (`cat`, `camera`, `ground`) |
| `property` | enum `position`, `turn_degrees`, `scale`, `paint`, `opacity`, `vehicle` | |
| `value` | number, `{x,y,z}`, colour or paint name (enum from catalog), or object name, depending on `property` | Validated per property |
| `narration` | string | |
Built with: setter statements from `SetUpMethodGenerator` applied through the scene editor, as the property sheet does.

### `insert_statement`
Adds one procedure call to a method.
| Field | Type | Notes |
|---|---|---|
| `method` | string | `Scene.myFirstMethod`, or `Class.method` for user methods |
| `parent_block` | string, optional | Id of a control block (from a previous result) to insert into; default is the method's body |
| `position` | `"end"` or integer index | |
| `target` | string | Object name (`cat`, `this` for the scene), or a joint (`cat.getRightEar()` form, from the catalog) |
| `procedure` | string, enum of PRIME_TIME procedures | e.g. `move`, `turn`, `say`, `moveTo`, `turnToFace` |
| `arguments` | object | Required parameters by name (`direction`, `amount`, `text`, `target`) |
| `details` | object, optional | Keyword arguments (`duration`, `animationStyle`, `asSeenBy`, …) |
| `narration` | string | |
Built with: `InsertStatementEdit` with a `MethodInvocation` constructed as the cascade would (`ExpressionCreator` and keyed `JavaKeyedArgument`s).

### `insert_control`
Adds a control block that later statements can go inside.
| Field | Type | Notes |
|---|---|---|
| `method`, `parent_block`, `position` | as above | |
| `kind` | enum `do_in_order`, `do_together`, `count`, `while`, `if`, `for_each`, `each_together` | |
| `count` | integer, for `count` | |
| `condition` | object, for `while` and `if`: a function call (`target`, `function`, `arguments`) or `true`/`false` | Functions are PRIME_TIME functions from the catalog |
| `items` | list of object names, for `for_each` and `each_together` | Creates the array |
| `narration` | string | |
Result `ids.block`: the id to use as `parent_block` (for `if`, `ids.then` and `ids.else`).

### `declare_procedure`
| Field | Type | Notes |
|---|---|---|
| `class` | string | `Scene`, or a user class such as `AbyssinianCat` |
| `name` | string, identifier | |
| `parameters` | list of `{name, type}`, optional | Types from the catalog |
| `narration` | string | |
Built with: `DeclareMethodEdit`. Result `ids.method`: the `Class.method` name to use in `insert_statement`.

### `add_event_listener`
| Field | Type | Notes |
|---|---|---|
| `kind` | enum `mouse_click_on_object`, `mouse_click_on_screen`, `key_press`, `arrow_key`, `move_with_arrow_keys`, `time`, `proximity_enter`, `collision_start` | "When the world starts" already exists and runs `myFirstMethod` |
| `objects` | list of object names | Clicked objects (empty for any), the object to move with the arrow keys, or the first group for proximity and collision |
| `other_objects` | list of object names | The second group for proximity and collision; otherwise empty |
| `number` | number | Seconds between runs for `time`; distance in metres for `proximity_enter`; otherwise -1 |
| `narration` | string | |
Built with: the same AST as the **Add Event Listener** menu (`AddEventListenerCascade`): an `InsertStatementEdit` at the end of `initializeEventListeners`, with an empty lambda made by `AstUtilities.createLambdaExpression`. Result `ids.block`: the listener statement; passed as `parent_block`, blocks go into the handler body. TR1 can't check which key was pressed (that needs an `if` with the event's key).

### `explain`
No change to the world.
| Field | Type | Notes |
|---|---|---|
| `text` | string, under 120 words | Shown in the panel and read aloud |
| `highlight` | list of block ids or object names, optional | Flashed in the editor |

### `read_project`
No change to the world. Returns the latest project text (section 2.3) when Claude needs it after several edits. Takes no fields.

**TR1 scope:** all tools above except `declare_procedure` parameters and the `while`/`if` conditions beyond a single function call. These are limited to simple forms and return `not_allowed_here` with a message otherwise.

## 4. System prompt (outline)

Stored as `prompter-system.md` in `core/prompter` resources, versioned with the code:

1. **Role:** "You are the Prompter in StoryStage, a 3D storytelling and coding app used by learners aged about 10 and up and their teachers."
2. **How to work:** use the tools; build with ordinary blocks; prefer small steps; never invent objects, methods or gallery items (use only the catalog); say what you did in plain words.
3. **Modes:** in "Show me how", add blocks one at a time and explain why each one is there; in "Build it", build the whole request, then summarise; in "Explain only", use only `explain` and `read_project`.
4. **Audience and safety:** age-appropriate language and content; no personal information requests; decline violent or unsuitable story requests kindly and suggest an alternative.
5. **Narration:** each step's `narration` describes the visible change in one short sentence in the learner's language.
6. Then the API catalog and the gallery catalog.

## 5. Errors seen by the learner

| Situation | Message (panel) | Action |
|---|---|---|
| 401 / invalid key | "Your Claude key isn't working. Open set-up to check it." | **Open set-up** button |
| 402 / no credit | "Your Claude account has run out of credit." | Link text to the Console (shown, not opened automatically) |
| 429 / rate limit | "The Prompter is busy. Trying again in N seconds." | Automatic retry (SDK, twice), then manual |
| 5xx / overloaded | "Claude is having trouble right now. Try again in a minute." | **Try again** |
| No network | "You're offline, so the Prompter can't help right now. Everything else in StoryStage still works." | |
| `refusal` | "The Prompter can't help with that one. Try a different idea." | |
| Tool error after 3 retries | "The Prompter couldn't finish this step." plus the steps that did work | **Undo this request** |
