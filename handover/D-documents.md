# D: Documents: curriculum, legal, privacy, website

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- `docs/curriculum/`
- `docs/privacy.md` and the DPIA
- `docs/legal/` (letters, rights checks, contract drafts)
- `website/` drafts and the teacher guide

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP17a** CMU/EA letters, rights checks, contract (17.1, 17.5–17.9) | WP17 | wk 0–3 (19 Oct 2026 to 9 Nov 2026) | nothing | 11.5 weeks of slack |
| 2 | **WP16a** Curriculum mapping, four nations (16.1–16.5) | WP16 | wk 3–8 (9 Nov 2026 to 14 Dec 2026) | nothing | 9.5 weeks of slack |
| 3 | **WP16b** Curriculum templates and use cases (16.6) | WP16 | wk 8–11 (14 Dec 2026 to 4 Jan 2027) | WP16a (this session) | 10.5 weeks of slack |
| 4 | **WP19a** Website and teacher guide drafts (19.1, 19.2) | WP19 | wk 11–14 (4 Jan 2027 to 25 Jan 2027) | WP12a (S5) | 13.5 weeks of slack |
| 5 | **WP17b** DPIA and privacy notice (17.3, 17.4) | WP17 | wk 14–17 (25 Jan 2027 to 15 Feb 2027) | WP13b (S7), WP14a (S7) | 3.5 weeks of slack |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP17: Legal, privacy and licences**: every shipped asset has a recorded licence, CMU's and EA's answers (or no answer) are filed, every commissioned character has a rights decision, and the DPIA is approved.
- **WP16: UK curriculum mapping**: the mapping is published as a doc, cited to the official curriculum documents, and the owner has chosen the curriculum templates to ship.
- **WP19: Pilot and website**: see the workplan.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP17a** is needed by: owner.
- **WP16a** is needed by: owner.
- **WP16b** is needed by: owner.
- **WP19a** is needed by: owner.
- **WP17b** is needed by: owner.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/d-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.
- This session writes documents, not code. It can run in Claude Code (committing to `docs/`) or in the StoryStage project in Claude; either way, the outputs land in the repository.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session D (Documents: curriculum, legal, privacy, website) for StoryStage 2. Read CLAUDE.md, then handover/D-documents.md, then the workplan sections it lists. Work through your items in order, starting with WP17a. Before writing anything, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner.
```
