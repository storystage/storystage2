# 00 Architecture

- **Covers:** packages, boundaries, threads (UI, worker, native), data flow, where the key lives
- **Work package:** WP0.5 (map); the contracts it names are WP0.8
- **Owner:** S1
- **Status:** first version, 20 Oct 2026. Parts marked *provisional* wait on a spike (WP1); the spike report (`docs/spikes/REPORT.md`) confirms or changes them.

## 0. Decisions this spec relies on

[0003 Delivery](../decisions/0003-delivery.md), [0005 API key](../decisions/0005-api-key.md), [0006 UI](../decisions/0006-ui.md), [0007 3D](../decisions/0007-3d.md), [0009 Blocks](../decisions/0009-blocks.md), [0010 Language](../decisions/0010-language.md), [0011 Project file](../decisions/0011-project-file.md), [0020 Speech in](../decisions/0020-speech-in.md), [0022 Off switches](../decisions/0022-off-switches.md).

## 1. One app, two hosts

StoryStage 2 is one React and TypeScript app, `apps/studio`. It runs in two hosts:

| Host | Where | Prompter | Files | Key |
|---|---|---|---|---|
| **Tauri app** (`apps/desktop`) | Windows, macOS, iPad (iOS), Chromebook (Android) | Yes, through the native layer | Native file dialogs and app folders | OS secure store, read only by Rust |
| **Browser version** | Any device with a current browser | Off: built without the transport | Download and open, or the File System Access API where present | None: there is nothing to hold it |

The studio never asks which host it is in by sniffing. The host passes a **host interface** at start-up (files, Prompter transport or none, policy in force), so the browser build and the Tauri build differ only in what they pass.

## 2. Packages and boundaries

The layout is in workplan section 4 and `handover/README.md` says who owns what. The dependency rules are enforced by `pnpm lint` (`tools/repo/src/boundaries.ts`):

- `ast` depends on nothing, not even the DOM.
- `runtime` depends only on `ast` and `story-api`. It never imports the stage: it talks to it through messages (section 4).
- `studio` may depend on everything; nothing depends on `studio` or `desktop`.
- Packages depend on each other with `workspace:*` and are consumed as TypeScript source. No cycles.

```
  Arrows point at what a package depends on.

                       apps/studio  (the three tabs, Prompter panel, settings)
     ┌──────────┬──────────┬──────┴────┬───────────┬──────────┬──────────┐
  blocks     tiles    text-view   production   prompter    speech     export
     └────┬─────┘          │           │           │                     │
   editor-contract ────────┴───────────┤           │                     │
          │                            │           │                     │
         ast ◄──── story-api ◄──── runtime         │                  stage ──► backstage
                                       │ messages  │ transport           ▲
                                       └───────────┼─────────────────────┘
                                                   ▼
                                     apps/desktop (native layer, Rust)
```

The picture shows the main paths, not every edge; `package.json` is the record.

## 3. Threads

| Thread | Runs | Notes |
|---|---|---|
| **UI (main)** | React, both code editors, the Storyboard, and the Babylon.js stage (`stage`) rendering to the page's canvas | Babylon.js stays on the main thread in the first release (*provisional*: WP1.2 measures it; an OffscreenCanvas worker is the fallback if the UI stutters) |
| **Runtime worker** | The interpreter and scheduler (`runtime`): do in order, do together, loops, events, a fixed time step | Owns no scene objects. It sends timed commands to the stage and receives completions and events (WP1.4 proves the timing) |
| **Speech worker** | whisper.cpp in WebAssembly (`speech`) | Audio never leaves the device and never goes to the Prompter (CLAUDE.md rule 3) |
| **Import worker** | Checking and reducing imported models (WP3.11), reading `.storystage` and `.a3p` files | Untrusted input is parsed off the main thread, with size and time limits (threat model, WP0.9) |
| **Export** | Offscreen, fixed-time-step render of each frame, then WebCodecs encoding and muxing (`export`) | *Provisional* (WP1.8): where WebCodecs is missing, an FFmpeg sidecar on desktop |
| **Native layer** | Rust in `apps/desktop`: key store, Claude transport and policy enforcement point, files, policy, sidecars | Reached only through Tauri commands and channels with an explicit capability list |

## 4. Data flow

**The program.** The project's program is the typed AST (`ast`, spec 01). It is the single source of truth. Nothing changes it except **edit operations**, each invertible and labelled in plain words ("Add cat"). Both code editors, the Prompter's Build it and set the stage from the storyboard all make changes the same way, so undo, history and storyboard links work the same whoever made the change.

```
 editor (blocks or tiles) ──edit operation──► ast: validate, apply, push undo ──► new program
         ▲                                                                            │
         └──────────── editor contract: program changed, highlight, focus ◄──────────┘
```

**Rehearse.** The studio sends the runtime worker the program and the scene's starting state. The worker runs it and posts **stage commands** (move this object, turn this joint, say this line, each with a start time and duration). A bridge on the main thread applies them to the stage. The stage posts back completions and **events** (a click, a collision, a key press). In fixed-time-step mode the worker advances the clock, not the wall clock, so two runs give the same frames. Determinism is checked on scene state: a hash of every transform per frame (WP18.2).

**The production.** `production` holds the `.storystage` file: scenes and their programs, the running order and transitions, the storyboard (logline, synopsis, arc, scene cards, script, frames) and the links from frames to code. Saving and opening go through the host interface (section 1).

**The Prompter.** `prompter` builds each request in TypeScript, without the key: the system prompt, the tool schemas and the learner's text, sent as delimited data. Camera images, microphone audio and pictures are never included (CLAUDE.md rule 3). The request goes to the **Prompter transport** (section 5). Replies come back as a stream of events. Tool calls become plans the learner edits before anything is built (plan before change, 13.9), then become edit operations.

## 5. Where the key lives

1. The learner or school enters the key once, in the native key wizard. It goes straight to the OS secure store (Credential Manager, Keychain, Android Keystore) and is never written to a file, a log or the webview.
2. No Tauri command returns the key, and no web code can read it. WP1.6 proves this on Windows; WP15.2 does it for every platform.
3. For each Prompter request the webview calls one Tauri command with the request body. The native layer is the **policy enforcement point**: it checks the body against an allowlist (the models allowed for each mode, a token ceiling, the pinned system prompt and tool schemas, per-minute and per-day caps), refuses anything else with a coded error, and only then adds the key and sends the request to the Anthropic API. Events stream back over a Tauri channel.
4. The browser version has no transport, so it has no Prompter (decision 0022).
5. Tests and CI use `tools/fake-claude`. No live key in CI, fixtures or chat.

## 6. Contracts between sessions (WP0.8)

Sessions work in parallel by coding against these contracts. Each one lands in its own small pull request labelled `contract`, which the owning session reviews. After that, a change to a contract is again its own pull request, reviewed before the code that uses it.

| Contract | What it fixes | Producer | Main consumers |
|---|---|---|---|
| **Stage interface** and a **fake stage** that records calls | What the rest of the app may ask the 3D stage to do | S3 (`stage`) | runtime bridge, studio, export, selftest |
| **Runtime messages** | Messages between the runtime worker and the main thread, both ways | S2 (`runtime`) | studio, stage bridge, export |
| **Production and storyboard data types** | Scenes, running order, storyboard, script, frames and links | S2 then S4 (`production`) | studio, prompter, export |
| **Backstage manifest schema** | Model ids, sections, classes, joints, licences, budgets | S4 (`backstage`) | stage, sketches, prompter, export |
| **Prompter transport** | How `prompter` sends a request and receives a stream, without the key | S7 (`prompter`), S8 (native side) | studio, desktop |
| **Editor contract** | What both code editors implement: read the program, apply edit operations, highlight, focus, keyboard commands | S1 (`editor-contract`), then S5 and S6 | blocks, tiles, studio |
| **Host interface** (agreed 21 Oct 2026, decision 0028) | Files, transport or none, policy in force (section 1) | S8 (`desktop`) and S5 (`studio`) | studio |

## 7. Tests

- The boundary rules are tested in `tools/repo/src/boundaries.test.ts` and run in CI on every push.
- Each contract package ships a test suite that any implementation must pass. The fake stage passes the stage suite, and the real stage must pass it too (WP0 done-when).
- Thread and timing claims in section 3 are tested by the spikes (WP1.2, 1.4, 1.8), then by the runtime's deterministic-mode tests (WP6.5) and the end-to-end gate tests (WP18.2).
