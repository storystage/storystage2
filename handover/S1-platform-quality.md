# S1: Platform and quality

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- repository root, `.github/` and CI
- `packages/editor-contract` and the stub packages from WP0.8 (then each passes to its owner)
- `spikes/` (throwaway)
- `packages/selftest`, the test harness and the fake stage
- the MP4 encoder module inside `packages/export` (WP11a), handed to S2
- later: `packages/ar` and the AR player

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP0** Repo, CI, specs, interface contracts (0.1–0.8) | WP0 | wk 0–1.5 (19 Oct 2026 to 29 Oct 2026) | nothing | **critical path** |
| 2 | **WP1** Spikes 1.2–1.9, go/no-go per spike (1.10) | WP1 | wk 1.5–4.5 (29 Oct 2026 to 20 Nov 2026) | WP0 (this session), WP1.1 (owner) | **critical path** |
| 3 | **WP18a** Test harness, fake stage, self-test skeleton (18.1, 18.4) | WP18 | wk 4.5–6.5 (20 Nov 2026 to 4 Dec 2026) | WP0 (this session) | 21 weeks of slack |
| 4 | **WP11a** MP4 encoder module (11.3, 11.5) | WP11 | wk 6.5–8.5 (4 Dec 2026 to 18 Dec 2026) | WP1 (this session) | 7 weeks of slack |
| 5 | **WP23a** Projection spike: surface bake renderer, Pixera build script (23.1, 23.2) | WP23 | wk 10–12 (28 Dec 2026 to 11 Jan 2027) | WP5a (S3), WP6 (S2) | after the release candidate |
| 6 | **WP14b** Speak line and narration (14.3) | WP14 | wk 12.5–13.5 (15 Jan 2027 to 21 Jan 2027) | WP14a (S7), WP13b (S7), WP4b (S3) | 3.5 weeks of slack |
| 7 | **WP18b** Milestone gate tests and device runs (18.2, 18.3) | WP18 | wk 16.5–18.5 (12 Feb 2027 to 26 Feb 2027) | WP7 (S5), WP7t (S6), WP8 (S4), WP9b (S6), WP10b (S5), WP11b (S2), WP13c (S7), WP14b (this session), WP4c (S3), WP5b (S3), WP15k (S8), WP15b (S8), WP24b (S8) | **critical path** |
| 8 | **WP21** AR design mode | WP21 | wk 18.5–24.5 (26 Feb 2027 to 9 Apr 2027) | WP1 (this session), WP5a (S3), WP8 (S4), WP15a (S8), RC (milestone) | after the release candidate |
| 9 | **WP22b** AR player, AR staging, Export for AR (22.5–22.7) | WP22 | wk 24.5–27.5 (9 Apr 2027 to 29 Apr 2027) | WP22a (S4), WP21 (this session), WP11b (S2), WP10a (S5) | after the release candidate |
| 10 | **WP22c** Mixed-reality film and safeguards (22.8, 22.9) | WP22 | wk 27.5–29.5 (29 Apr 2027 to 13 May 2027) | WP22b (this session) | after the release candidate |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP0: Repository, CI and spec skeleton**: a pull request with a failing test is blocked by CI, and a passing one merges. Both desktop builds produce an empty Tauri window as a workflow artifact. The contract packages (0.8) build, and the fake stage passes its own tests.
- **WP1: Spikes on the riskiest parts**: the owner has read the report and recorded go/no-go for each spike in `docs/decisions/`.
- **WP18: Quality: self-test, end-to-end and performance**: each milestone gate has an automated end-to-end test, and the self-test passes on every target build.
- **WP11: Screening room and export**: a three-scene production exports to an MP4 that plays in the default player on Windows, macOS, iPad and ChromeOS, with captions and credits; and the automatic check flags each of five planted differences (a missing character, a mirrored position, an unsaid line, a frame twice its planned length, a character off camera) with no false flags on a matching frame.
- **WP23: Projection mapping and Export to Pixera**: a three-scene production is projected onto a model box in a classroom from the desktop app; its Export to Pixera package, with the build script and guide, produces a working timeline in Pixera Creator; and the flashing check catches a test clip that flashes at 5 Hz.
- **WP14: Speech**: a spoken request on each reference device is transcribed with no network traffic other than the one-off model download, and narration plays with captions.
- **WP21: AR design mode**: on an Android tablet and an iPad, a learner can place a scene on a table, walk round it and rehearse it, with the safeguards on and the DPIA updated.
- **WP22: AR for audiences and distribution**: a three-scene production exports an AR pack within budget that plays on an Android phone through Scene Viewer and on an iPad through AR Quick Look; the same production plays interactively in AR in the Android and iPad apps; a mixed-reality film exports only with the teacher setting on; and the DPIA covers all of it.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP0** is needed by: S2, S3, S4, S5, S6, S7, S8.
- **WP1** is needed by: S2, S3, S4, S7, S8.
- **WP11a** is needed by: S2, S3, S4.
- **WP23a** is needed by: S3.
- **WP18b** is needed by: owner.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/s1-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.
- **Critical-path items here: WP0, WP1, WP18b.** A slip moves the release candidate. Keep their pull requests small and flag them `critical` so the owner reviews them first.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session S1 (Platform and quality) for StoryStage 2. Read CLAUDE.md, then handover/S1-platform-quality.md, then the workplan sections it lists. Work through your items in order, starting with WP0. Before writing code, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner. For this first session, also follow the first-session instructions in section 11 of docs/WORKPLAN.md.
```
