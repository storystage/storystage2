# S6: Story API spec, Tile editor and Alice import

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- `packages/story-api` spec and types (`docs/spec/02-story-api.md`)
- `packages/tiles` (option C)
- `packages/text-view`
- `packages/a3p-import`
- the editor switch and parity tests (7.11–7.13), coordinated with S5 in `apps/studio`

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP4a** Story API spec, types, crosswalk fields (4.1, 4.2, 4.7) | WP4 | wk 1.5–3.5 (29 Oct 2026 to 12 Nov 2026) | WP0 (S1), WP3a (S4) | 3 weeks of slack |
| 2 | **WP4d** Publish Story API open specification (4.8) | WP4 | wk 3.5–4.5 (12 Nov 2026 to 20 Nov 2026) | WP4a (this session) | 20 weeks of slack |
| 3 | **WP7c** Alice-style tile editor, full (option C) | WP7c | wk 5–12 (23 Nov 2026 to 11 Jan 2027) | WP2 (S2), WP4a (this session), WP12b (S5) | 3 weeks of slack |
| 4 | **WP9a** .a3p reader (9.1) | WP9 | wk 12–13 (11 Jan 2027 to 18 Jan 2027) | WP0 (S1), WP0s (S8) | 10.5 weeks of slack |
| 5 | **WP9b** Map Alice worlds onto the AST (9.2, 9.3) | WP9 | wk 13–15 (18 Jan 2027 to 1 Feb 2027) | WP9a (this session), WP2 (S2), WP4a (this session), WP3c (S4) | 7 weeks of slack |
| 6 | **WP7t** Editor switch, parity tests, study build (7.11–7.13) | WP7c | wk 15–16.5 (1 Feb 2027 to 12 Feb 2027) | WP7 (S5), WP7c (this session) | 0.5 weeks of slack |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP4: Story API**: a conformance test runs every procedure on every model class and checks the end state against expected transforms.
- **WP7c: Alice-style tile editor (option C) and the editor switch**: both editors pass the same M2 and M4 gate tests and the parity suite, both pass the keyboard and screen-reader checks, and switching mid-task loses nothing.
- **WP9: Alice `.a3p` import**: Alice's 34 starter projects and the TR1 evaluation worlds import with no errors, or with every gap reported.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP4a** is needed by: S2, S3, S7.
- **WP9b** is needed by: S1.
- **WP7t** is needed by: S1.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/s6-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session S6 (Story API spec, Tile editor and Alice import) for StoryStage 2. Read CLAUDE.md, then handover/S6-story-api-spec-tiles-import.md, then the workplan sections it lists. Work through your items in order, starting with WP4a (it needs WP0 (S1), WP3a (S4)). Before writing code, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner.
```
