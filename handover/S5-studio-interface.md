# S5: Studio interface

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- `apps/studio` (the three tabs, layout, routing)
- `packages/blocks` (option B)
- the frame canvas in `packages/sketches`
- the design system and components

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP12a** Interface mock-ups (12.1) | WP12 | wk 0–2 (19 Oct 2026 to 2 Nov 2026) | nothing | 3 weeks of slack |
| 2 | **WP12b** Design system and components (12.2–12.5) | WP12 | wk 2–5 (2 Nov 2026 to 23 Nov 2026) | WP0 (S1), WP12a (this session) | 3 weeks of slack |
| 3 | **WP10a** Storyboard: script, arcs, cards, frame canvas, PDF | WP10 | wk 6–10 (30 Nov 2026 to 28 Dec 2026) | WP8f (S2), WP12b (this session), WP10s (S4) | 4.5 weeks of slack |
| 4 | **WP7** Production stage and Code editor, Blockly option B | WP7 | wk 10.5–14.5 (1 Jan 2027 to 29 Jan 2027) | WP5a (S3), WP6 (S2), WP12b (this session), WP4b (S3) | **critical path** |
| 5 | **WP10b** Frames to code links, storyboard rule | WP10 | wk 14.5–16.5 (29 Jan 2027 to 12 Feb 2027) | WP10a (this session), WP7 (this session), WP8 (S4) | **critical path** |
| 6 | **WP10c** Backstage from the Storyboard, set the stage from the storyboard (10.9, 10.10) | WP10 | wk 16.5–18 (12 Feb 2027 to 22 Feb 2027) | WP10a (this session), WP3i (S4), WP8 (S4), WP5b (S3) | 2.5 weeks of slack |
| 7 | **WP23c** Classroom projection: full-screen warped output (23.5) | WP23 | wk 21.5–23 (18 Mar 2027 to 29 Mar 2027) | WP23b (S3), WP15a (S8) | after the release candidate |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP12: Interface and design system**: the owner approves the mock-ups, and axe reports no serious issues on any screen.
- **WP10: Storyboard**: a production can be planned end to end in the Storyboard by keyboard alone, and the M4 manual test passes; a learner can find, import or stand in for a missing character without leaving the Storyboard; and setting the stage from a five-sketch frame places each model on the correct side, facing the right way, with the matching backdrop and shot, in one undo.
- **WP7: Production stage and Code editor**: milestone M2's gate passes, with a manual test script for M2 in `docs/test/`.
- **WP23: Projection mapping and Export to Pixera**: a three-scene production is projected onto a model box in a classroom from the desktop app; its Export to Pixera package, with the build script and guide, produces a working timeline in Pixera Creator; and the flashing check catches a test clip that flashes at 5 Hz.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP12a** is needed by: D.
- **WP12b** is needed by: S2, S3, S6.
- **WP10a** is needed by: S1, S7.
- **WP7** is needed by: S1, S6, S7.
- **WP10b** is needed by: S1, S2.
- **WP10c** is needed by: owner.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/s5-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.
- **Critical-path items here: WP7, WP10b.** A slip moves the release candidate. Keep their pull requests small and flag them `critical` so the owner reviews them first.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session S5 (Studio interface) for StoryStage 2. Read CLAUDE.md, then handover/S5-studio-interface.md, then the workplan sections it lists. Work through your items in order, starting with WP12a. Before writing code, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner.
```
