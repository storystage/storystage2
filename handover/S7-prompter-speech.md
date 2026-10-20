# S7: Prompter and speech

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- `packages/prompter`
- `packages/speech`
- `tools/fake-claude`
- `docs/eval/`

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP13a** Prompter spec, fake Claude, system prompt, eval set (13.1, 13.7, 13.8) | WP13 | wk 1.5–4.5 (29 Oct 2026 to 20 Nov 2026) | WP0 (S1) | 4.5 weeks of slack |
| 2 | **WP14a** Speech engines: whisper WASM, voices (14.1, 14.2) | WP14 | wk 4.5–7.5 (20 Nov 2026 to 10 Dec 2026) | WP1 (S1) | 8 weeks of slack |
| 3 | **WP13b** Prompter core: transport, context, AST tools, modes, plan before change, wizard | WP13 | wk 8–12.5 (14 Dec 2026 to 15 Jan 2027) | WP13a (this session), WP2 (S2), WP4a (S6), WP15k (S8) | 1.5 weeks of slack |
| 4 | **WP13c** Prompter panel, storyboard tools, story coach, live eval | WP13 | wk 14.5–16.5 (29 Jan 2027 to 12 Feb 2027) | WP13b (this session), WP10a (S5), WP7 (S5) | **critical path** |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP13: Prompter (port)**: on recorded responses, at least 85% of evaluation checks pass; the owner's live run scores at least 75% with no failures in the refusal, "doesn't write the story" and "build matches the plan" categories; and a learner can edit a plan, build it, and undo the whole build in one step.
- **WP14: Speech**: a spoken request on each reference device is transcribed with no network traffic other than the one-off model download, and narration plays with captions.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP14a** is needed by: D, S1.
- **WP13b** is needed by: D, S1, S8.
- **WP13c** is needed by: S1.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/s7-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.
- **Critical-path items here: WP13c.** A slip moves the release candidate. Keep their pull requests small and flag them `critical` so the owner reviews them first.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session S7 (Prompter and speech) for StoryStage 2. Read CLAUDE.md, then handover/S7-prompter-speech.md, then the workplan sections it lists. Work through your items in order, starting with WP13a (it needs WP0 (S1)). Before writing code, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner.
```
