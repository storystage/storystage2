# S3: Stage and Story API procedures

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- `packages/stage`
- the procedures and character actions inside `packages/story-api` (S6 owns its spec and types)
- later: `packages/projection` with S1's spike code (WP23a)

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP5a** Stage core: scene, models, camera, picking, offscreen (5.1–5.5) | WP5 | wk 4.5–7.5 (20 Nov 2026 to 10 Dec 2026) | WP0 (S1), WP1 (S1) | **critical path** |
| 2 | **WP4b** Story API procedures, new blocks, shot types (4.3, 4.4, 4.10) | WP4 | wk 7.5–10.5 (10 Dec 2026 to 1 Jan 2027) | WP4a (S6), WP5a (this session) | **critical path** |
| 3 | **WP5b** Stage extras: WebGPU, quality, scene picture, character machinery (5.6–5.8) | WP5 | wk 10.5–12.5 (1 Jan 2027 to 15 Jan 2027) | WP5a (this session) | 3 weeks of slack |
| 4 | **WP4c** Character actions, animation, faces (4.5, 4.6) | WP4 | wk 12.5–16.5 (15 Jan 2027 to 12 Feb 2027) | WP4b (this session), WP5b (this session), WP3c (S4) | 2 weeks of slack |
| 5 | **WP23b** Projection stage: surfaces, virtual projectors, preview (23.3, 23.4) | WP23 | wk 18.5–21.5 (26 Feb 2027 to 18 Mar 2027) | WP23a (S1), WP8 (S4), WP12b (S5), RC (milestone) | after the release candidate |
| 6 | **WP23d** Export for projection and Export to Pixera, flash check, guide (23.6–23.9) | WP23 | wk 21.5–24.5 (18 Mar 2027 to 9 Apr 2027) | WP23b (this session), WP11a (S1), WP11b (S2) | after the release candidate |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP5: Stage (Babylon.js)**: the reference scenes in `tests/scenes/` render at 30 fps or better on both reference devices at "low", and the offscreen render is deterministic.
- **WP4: Story API**: a conformance test runs every procedure on every model class and checks the end state against expected transforms.
- **WP23: Projection mapping and Export to Pixera**: a three-scene production is projected onto a model box in a classroom from the desktop app; its Export to Pixera package, with the build script and guide, produces a working timeline in Pixera Creator; and the flashing check catches a test clip that flashes at 5 Hz.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP5a** is needed by: S1, S4, S5.
- **WP4b** is needed by: S1, S5.
- **WP5b** is needed by: S1, S5.
- **WP4c** is needed by: S1.
- **WP23b** is needed by: S5.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/s3-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.
- **Critical-path items here: WP5a, WP4b.** A slip moves the release candidate. Keep their pull requests small and flag them `critical` so the owner reviews them first.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session S3 (Stage and Story API procedures) for StoryStage 2. Read CLAUDE.md, then handover/S3-stage-story-api.md, then the workplan sections it lists. Work through your items in order, starting with WP5a (it needs WP0 (S1), WP1 (S1)). Before writing code, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner.
```
