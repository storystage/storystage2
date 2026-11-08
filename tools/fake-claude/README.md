# tools/fake-claude

Fake Claude server replaying recorded streams. All Prompter tests use it; no live key in CI.

- **Owner:** S7
- **Workplan:** WP13.7
- **Status:** server, protocol recordings and the evaluation set's checks done. Real recordings need WP13b and a live key.

## What it does

`startFakeClaude()` answers `POST /v1/messages` with a recording's next turn, as a real server-sent stream. It also refuses what the real API refuses, so a client bug fails here instead of in a lesson (`src/protocol.ts`):

- **Request rules:** sampling settings, thinking turned off or budgeted, forced tool use, a trailing assistant turn, a `tool_use` with no `tool_result`, a misplaced `role: "system"` message, `fallbacks` without their beta or on Haiku 5.5.
- **Append-only conversations:** `system` and `tools` unchanged and `messages` only growing (spec 04, section 1.5). This is the API's preserved-thinking check, which it runs for new accounts; the fake runs it always. A reply that ended in `max_tokens` or `refusal` isn't part of the history; one with a fallback echoes as spec 04, section 1.4 says.
- **Our own rules:** no key in a body, no pictures, always streaming. These answer `fake_claude_rule`.

It logs each request body for tests to read, and whether a key came with it, but never the key.

```ts
const server = await startFakeClaude();
server.use(recording('tool-loop'));
const transport = httpTransport(server.url);
```

`httpTransport` is a `PrompterTransport` that does what the native layer will do: it adds the beta header and turns each HTTP status into one error code. It adds no key and makes no retries.

## For the native layer (S8)

Point the Rust transport's base URL at it:

```bash
pnpm --filter @storystage/fake-claude start -- --port 8787 --require-key
```

`--require-key` answers 401 to a request with no key. `--recording <id>` picks recordings; each is found by the text `recording:<id>` in the first message.

## Recordings

`src/recordings.ts` holds one hand-written recording for each protocol path: text, a tool loop, parallel tools, cut-off tool input, refusals before and during a reply, a fallback, the conversation limit, each HTTP error and a dropped connection. All are marked `source: 'synthetic'`.

## The evaluation set

`src/eval.ts` defines the shape of `docs/eval/requests.jsonl` and checks it. Running and scoring the set comes with WP13b. See `docs/eval/README.md`.
