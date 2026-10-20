# S2: Language, runtime and Screening room

Brief for one Claude Code session. The workplan (`docs/WORKPLAN.md`) is the source of truth: if this brief and the workplan disagree, the workplan wins, and say so in your pull request.

## What this session owns

Write access (other sessions code against these only through the WP0.8 contracts):

- `packages/ast`
- `packages/runtime`
- `packages/production` until the format and data model (8.1) are merged, then S4
- `packages/export` (except the encoder module and the AR pack)
- later: the pathway exporters (WP20)

Read-only for this session: everything else. Changing another session's package needs a contract pull request that its owner reviews.

## Work, in order

Planned weeks assume about 8 code sessions plus this documents session, starting Monday 19 October 2026 (week 0). Re-base the dates to the real start; the order and the dependencies are what matter.

| # | Item | Workplan | Planned | Needs first | Status |
|---|---|---|---|---|---|
| 1 | **WP2** AST and edit operations | WP2 | wk 1.5–4.5 (29 Oct 2026 to 20 Nov 2026) | WP0 (S1) | 2 weeks of slack |
| 2 | **WP8f** Production format spec and data model (8.1) | WP8 | wk 4.5–6 (20 Nov 2026 to 30 Nov 2026) | WP2 (this session) | 4.5 weeks of slack |
| 3 | **WP6** Runtime interpreter | WP6 | wk 6–10 (30 Nov 2026 to 28 Dec 2026) | WP2 (this session), WP4a (S6), WP1 (S1) | 2 weeks of slack |
| 4 | **WP11b** Screening room: rough cut, compare, titles, credits, captions | WP11 | wk 13–16 (18 Jan 2027 to 8 Feb 2027) | WP8 (S4), WP11a (S1), WP12b (S5) | 2 weeks of slack |
| 5 | **WP11c** Automatic check against the storyboard (11.6) | WP11 | wk 16.5–18.5 (12 Feb 2027 to 26 Feb 2027) | WP10b (S5), WP11b (this session) | **critical path** |
| 6 | **WP20** Pathway: Unreal, Unity, Godot export; guide; MetaHuman trial | WP20 | wk 18.5–24.5 (26 Feb 2027 to 9 Apr 2027) | WP4a (S6), WP8 (S4), RC (milestone) | after the release candidate |

## Done when

Each work package's test, from the workplan. An item counts as done when its tasks' share of this test passes in CI or, for device and owner checks, when the owner confirms it.

- **WP2: AST and project model**: property-based tests show that any sequence of edits followed by full undo returns the original program byte-for-byte, and that every valid edit keeps the schema valid.
- **WP8: Productions and the `.storystage` file**: a three-scene production saves, reopens identically (round-trip test) and plays through with each transition type.
- **WP6: Runtime (interpreter)**: the semantics test suite passes, including the TR1 evaluation-set programs re-expressed in StoryStage 2 AST.
- **WP11: Screening room and export**: a three-scene production exports to an MP4 that plays in the default player on Windows, macOS, iPad and ChromeOS, with captions and credits; and the automatic check flags each of five planted differences (a missing character, a mirrored position, an unsaid line, a frame twice its planned length, a character off camera) with no false flags on a matching frame.
- **WP20: Pathway to industry tools**: a StoryStage production opens in Unreal and Unity with its models and timing, the pathway guide is published, and the MetaHuman trial has a recorded decision.

## Who is waiting on this session

Merge these as early as possible and post a one-line note in the lane log (`docs/lanes.md`) when each lands.

- **WP2** is needed by: S6, S7.
- **WP8f** is needed by: S4, S5, S8.
- **WP6** is needed by: S1, S4, S5.
- **WP11b** is needed by: S1, S3.
- **WP11c** is needed by: owner.

## Rules for this session

- Read `CLAUDE.md`, then the workplan sections for your items, then the specs they name. Write the spec first where the workplan asks for one.
- One workplan task per pull request where practical. Name the task and the spec section in the description, and tick the box in `docs/WORKPLAN.md`.
- Work in your own git worktree and branch (`lane/s2-...`). Rebase on `main` daily. Don't edit another session's packages.
- Tests first for `ast`, `runtime`, `production` and `prompter`. Every bug fix comes with a test that failed before it.
- Anything needing the owner: label `needs-owner`, one-line summary of the decision needed, then carry on with the next item that doesn't depend on it.
- Keep `docs/lanes.md` current: what you merged, what you're blocked on, what you're starting next.
- **Critical-path items here: WP11c.** A slip moves the release candidate. Keep their pull requests small and flag them `critical` so the owner reviews them first.

## Kickoff prompt

Paste this into a new Claude Code session on the repository:

```
You are session S2 (Language, runtime and Screening room) for StoryStage 2. Read CLAUDE.md, then handover/S2-language-runtime-screening.md, then the workplan sections it lists. Work through your items in order, starting with WP2 (it needs WP0 (S1)). Before writing code, list what you'll build, which specs you'll write, and which contracts you depend on. Keep to your own packages. When you finish each item, update docs/lanes.md and report what passed and what needs the owner.
```
