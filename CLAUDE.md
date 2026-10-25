# CLAUDE.md: StoryStage 2

Read this first, every session. Then read your session brief in `handover/`, then the workplan sections it names (`docs/WORKPLAN.md`). The workplan is the source of truth; `docs/decisions.md` records what is settled.

## What we're building

StoryStage 2 lets young people in schools and clubs across the four UK nations (aged 6 to 13, provisionally: decision 0030) make 3D animated films the way the film industry does: **Storyboard** (logline, synopsis, scenes, script, sketch frames) → **Production stage** (set the scene from Backstage, then code it in blocks) → **Screening room** (rough cut, compare with the storyboard, export an MP4). An optional Claude assistant, **the Prompter**, coaches and builds on request, using the user's or school's own key. It never writes the learner's story.

It is a rewrite on web technology. It contains **no Alice code**, but keeps Alice's vocabulary, program semantics, tile-editor design and (subject to licence) its models. StoryStage 1, the Java fork of Alice 3, stays in use until StoryStage 2 replaces it.

## Stack

- React + TypeScript (`strict`), Vite, pnpm workspaces, Vitest, Playwright, ESLint, Prettier.
- Babylon.js (WebGL2, WebGPU where available); glTF 2.0 models with VRM 1.0 bone names mapped to H-Anim.
- Program stored as a typed JSON AST with stable node ids; an interpreter in a Web Worker with a scheduler for "do together".
- Two code editors over the same AST in the first release: **Blocks** (Blockly styled like Alice's tiles, `packages/blocks`) and **Tiles** (an Alice-style tile editor in React, `packages/tiles`). Both implement `packages/editor-contract`.
- Tauri 2 apps for Windows, macOS, iPad and Android/Chromebook, plus a browser version without the Prompter. **No Linux in the first release.**
- Speech: whisper.cpp in WebAssembly on the device; on-device voices out; captions always.

Repository layout and package boundaries: workplan section 4. In short: `ast` depends on nothing; `runtime` on `ast` and `story-api`; `studio` on everything; nothing depends on `studio` (or on `apps/desktop`). `pnpm lint` enforces this (`tools/repo/src/boundaries.ts`); a new rule goes there with a test.

## Commands

Node 24 LTS and pnpm 10 (pinned in `package.json`; `corepack enable` installs it).

```
pnpm install            # from the lockfile; CI uses --frozen-lockfile
pnpm dev                # Vite dev server for apps/studio (http://localhost:5173)
pnpm build              # production build of apps/studio
pnpm test               # Vitest, every workspace package (pnpm test:watch while working)
pnpm test:e2e           # Playwright, Chromium with software rendering (needs `pnpm exec playwright install chromium`; normally CI only)
pnpm lint               # ESLint, then the package-boundary check
pnpm typecheck          # tsc --noEmit in every package
pnpm format             # Prettier (format:check in CI)
pnpm schedule           # rewrite workplan 5a and the roster from tools/plan/schedule.yaml (schedule:check in CI)
pnpm --filter @storystage/<name> <script>   # one package
```

- **Packages** are consumed as TypeScript source (`"exports": "./src/index.ts"`); there is no build step between packages. `erasableSyntaxOnly` is on: no `enum` or `namespace`, use unions and `as const` objects.
- **File names:** unit tests are `*.test.ts(x)` beside the code; end-to-end tests are `e2e/*.e2e.ts`, so the two runners never overlap.
- **CI** (`.github/workflows/`): `ci.yml` runs `check` (format, lint, licences, schedule, typecheck, test) and `e2e` on every push; both are required to merge. `desktop.yml` (Windows, macOS) and `mobile.yml` (Android; iOS once `APPLE_DEVELOPMENT_TEAM` is set) build the Tauri apps on `main` and on pull requests that touch `apps/desktop`, and keep them as artifacts. Actions are pinned to commit SHAs.
- Rust, Tauri, iOS and Android builds run in CI (GitHub Actions), not on the owner's PC (4 GB RAM, 2 cores, little free disk). Keep local work to TypeScript, unit tests and the dev server.

## Rules that never bend

1. **No API key in web code, settings files, tests, fixtures, logs or chat.** The key lives in the OS secure store and is used only by the native layer in `apps/desktop`, which checks every request against the allowlist and caps before adding it (the policy enforcement point, WP15.2). Tests use `tools/fake-claude`.
2. **No StoryStage server, no accounts, no analytics.** Children's data: UK GDPR and the ICO Children's code. Anything that adds a third party needs the DPIA (WP17).
3. **Camera images, microphone audio and pictures never go to the Prompter.** The Prompter sees text: the script, the storyboard and the sketches described as data.
4. **The story is the learner's.** The Prompter never writes the logline, synopsis or script. Show me how and Build it use **plan before change** (13.9): the learner sees and edits a numbered plan before anything is built.
5. **Storyboard first.** A scene's Code editor stays closed until the scene has a heading and a frame (10.8). No import of outside drawings; every sketch stands for a Backstage model or a stand-in.
6. **Low-end devices first.** Anything touching rendering, speech or memory is measured on the reference 4 GB Chromebook and non-Pro iPad.
7. **Accessibility:** WCAG 2.2 AA, full keyboard paths through all three tabs, captions for all speech.
8. **Licences:** prefer MIT, BSD, Apache-2.0; MPL-2.0 unmodified is fine; OFL-1.1 for fonts only (decision 0031); GPL only for offline build tools, never linked into the app. Record every dependency in `NOTICE` in the same pull request. Every Backstage asset has a licence, credit line and source in `backstage.json`.
9. **Plain words on screen.** No "AST", "node", "token", "schema" or "API" in the learner's interface. The wording rules carried over from StoryStage 1 (spec 04, section 5; `docs/carried-over/`):
    - Use the learner's view: "the cat", "your scene", "the move block"; never AST, node, field, invocation, edit, token, schema or API.
    - Name each step after what changed: "Add cat", "Make cat say Hello". These are also the undo labels (WP2.3).
    - Errors say what happened and what to do next, with no apologies.

## How we work

- **Sessions and ownership.** Each Claude Code session has a brief in `handover/` and owns its own packages. Code against the WP0.8 contracts. Don't change another session's package without a contract pull request its owner reviews.
- **Branches.** Your own git worktree and branch (`lane/<session>-<topic>`), rebased on `main` daily. Pull requests with CI green, squash merge.
- **One workplan task per pull request** where practical. The description names the task and spec section, and ticks the box in `docs/WORKPLAN.md`.
- **Specs before code** where the workplan asks for them (`docs/spec/`, section 7 of the workplan).
- **Tests first** for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- **Critical path first.** Items on the critical path (workplan 5a; marked in the briefs) are labelled `critical` and kept small, so the owner reviews them first.
- **The owner.** Label `needs-owner` with a one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- **The lane log.** Keep `docs/lanes.md` current: merged, blocked, next.
- **Plans change.** If an estimate is badly wrong, update `tools/plan/schedule.yaml`, run `pnpm schedule`, and say what moved.
