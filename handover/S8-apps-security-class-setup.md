# S8: Apps, security and class set-up

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- `apps/desktop` (Tauri: key store, transport, policy enforcement point, sidecars, release channels)
- `docs/spec/05-keys-privacy-switches.md` and `docs/spec/15-security.md`
- class set-up screens in `apps/studio`, coordinated with S5

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP15a** Tauri targets, policy, release channels (15.1, 15.3, 15.7) | WP15 | wk 1.5–3.5 (29 Oct 2026 to 12 Nov 2026) | WP0 (S1) | 2.5 weeks of slack |
| 2 | **WP0s** Threat model and security spec (0.9) | WP0 | wk 3.5–5 (12 Nov 2026 to 23 Nov 2026) | WP0 (S1) | 3 weeks of slack |
| 3 | **WP15k** Key store, transport and policy enforcement point (15.2) | WP15 | wk 5–8 (23 Nov 2026 to 14 Dec 2026) | WP15a (this session), WP1 (S1), WP0s (this session) | 1.5 weeks of slack |
| 4 | **WP24a** Teacher journey, Prompter access model, relay spike (24.1–24.3) | WP24 | wk 8–10 (14 Dec 2026 to 28 Dec 2026) | WP1g (owner), WP15a (this session), WP8f (S2) | 5.5 weeks of slack |
| 5 | **WP15b** Signing, stores, browser hosting (15.4–15.6) | WP15 | wk 10–13 (28 Dec 2026 to 18 Jan 2027) | WP15a (this session) | 10 weeks of slack |
| 6 | **WP24b** Class set-up: pupil folders, class caps, log export (24.4–24.7) | WP24 | wk 13–16 (18 Jan 2027 to 8 Feb 2027) | WP24a (this session), WP8 (S4), WP15k (this session), WP13b (S7) | 1.5 weeks of slack |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP15: Desktop and mobile apps, browser version**: signed builds install on each target, the key survives restart, with the policy lock set the Prompter can't be switched on, a request with an unlisted model or system prompt is refused, 30 simulated clients hitting rate limits back off without a retry storm, and the rollback drill passes.
- **WP0: Repository, CI and spec skeleton**: a pull request with a failing test is blocked by CI, and a passing one merges. Both desktop builds produce an empty Tauri window as a workflow artifact. The contract packages (0.8) build, and the fake stage passes its own tests.
- **WP24: The teacher's journey and class set-up**: in a test with 30 devices, a teacher sets up a class in under 15 minutes, every pupil reopens their own production next lesson and no one else's, the chosen Prompter route works within its caps, and the study logs export.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP15a** is needed by: S1, S5.
- **WP0s** is needed by: S4, S6.
- **WP15k** is needed by: S1, S7.
- **WP15b** is needed by: S1.
- **WP24b** is needed by: S1.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/s8-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session S8 (Apps, security and class set-up) for StoryStage 2. Read CLAUDE.md, then handover/S8-apps-security-class-setup.md, then the workplan sections it lists. Work through your items in order, starting with WP15a (it needs WP0 (S1)). Before writing code, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner.
```
