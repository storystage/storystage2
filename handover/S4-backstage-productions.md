# S4: Backstage and Productions

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- `packages/backstage`
- the sketch generator in `packages/sketches` and `tools/make-sketches`
- `tools/convert-alice-models`
- `packages/production` from WP8 onwards (scenes, running order, save and open)
- later: the AR baker and pack in `packages/export/ar-pack`

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP3a** Licence audit and joint map (3.1, 3.3) | WP3 | wk 0–1.5 (19 Oct 2026 to 29 Oct 2026) | nothing | 3 weeks of slack |
| 2 | **WP10s** Sketch library tool (10.5) | WP10 | wk 1.5–3.5 (29 Oct 2026 to 12 Nov 2026) | WP0 (S1), WP3a (this session) | 7 weeks of slack |
| 3 | **WP3b** Model pipelines: Alice converter, MakeHuman, Kenney, museum (3.2, 3.5, 3.7) | WP3 | wk 3.5–7.5 (12 Nov 2026 to 10 Dec 2026) | WP0 (S1), WP3a (this session) | 5 weeks of slack |
| 4 | **WP3c** Manifest, budgets, lazy loading (3.4, 3.9) | WP3 | wk 7.5–9.5 (10 Dec 2026 to 24 Dec 2026) | WP1 (S1), WP3b (this session) | 5 weeks of slack |
| 5 | **WP8** Scenes, running order, save and open (8.2–8.5) | WP8 | wk 10–13 (28 Dec 2026 to 18 Jan 2027) | WP8f (S2), WP5a (S3), WP6 (S2), WP0s (S8) | 2 weeks of slack |
| 6 | **WP3i** Import into Backstage, in-app sketches, licence capture (3.11, 3.12) | WP3 | wk 13–16 (18 Jan 2027 to 8 Feb 2027) | WP3c (this session), WP10s (this session), WP8 (this session) | 2.5 weeks of slack |
| 7 | **WP22a** AR baker and AR pack export: GLB, USDZ, page, QR (22.1–22.4) | WP22 | wk 18.5–22.5 (26 Feb 2027 to 26 Mar 2027) | WP6 (S2), WP8 (this session), WP11a (S1), RC (milestone) | after the release candidate |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP3: Backstage (the model library)**: every shipped model loads in Babylon.js with its mapped joints, `backstage.json` validates with a section, a licence and a credit for every item, and the owner has signed off the licence audit and the first MakeHuman set; and on a 4 GB Chromebook a 50 MB, 4K-textured glTF character imports in under a minute, fits the budget, animates with its mapped joints, appears in the Storyboard with its sketches, and its CC-BY credit appears in an exported film.
- **WP10: Storyboard**: a production can be planned end to end in the Storyboard by keyboard alone, and the M4 manual test passes; a learner can find, import or stand in for a missing character without leaving the Storyboard; and setting the stage from a five-sketch frame places each model on the correct side, facing the right way, with the matching backdrop and shot, in one undo.
- **WP8: Productions and the `.storystage` file**: a three-scene production saves, reopens identically (round-trip test) and plays through with each transition type.
- **WP22: AR for audiences and distribution**: a three-scene production exports an AR pack within budget that plays on an Android phone through Scene Viewer and on an iPad through AR Quick Look; the same production plays interactively in AR in the Android and iPad apps; a mixed-reality film exports only with the teacher setting on; and the DPIA covers all of it.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP3a** is needed by: S6.
- **WP10s** is needed by: S5.
- **WP3c** is needed by: S3, S6.
- **WP8** is needed by: S1, S2, S3, S5, S8.
- **WP3i** is needed by: S5, owner.
- **WP22a** is needed by: S1.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/s4-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session S4 (Backstage and Productions) for StoryStage 2. Read CLAUDE.md, then handover/S4-backstage-productions.md, then the workplan sections it lists. Work through your items in order, starting with WP3a. Before writing code, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner.
```
