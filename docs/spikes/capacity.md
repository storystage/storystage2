# Capacity probe (WP1.12)

Planned against actual time for WP0 and the first spike lanes, recorded for two weeks from 20 Oct 2026, so that `tools/plan/schedule.py` (and `schedule.yaml`, WP0.10) and workplan section 5a can be recalibrated at M1.

- **Session time** is elapsed time in one Claude Code session, from its first commit or pull request to the merge.
- **Owner time** is the owner's review and decision time. Only the owner can record it: please add a line a day below, or comment on #17.

## S1

| Item | Planned (schedule.py) | Started | Merged | Actual elapsed | Notes |
|---|---|---|---|---|---|
| WP0.2 monorepo (#1) | part of WP0: 1.5 weeks | 20 Oct 13:15 | 20 Oct 17:49 | about 4.5 h, mostly waiting on WP0.3 (the PRs were stacked) | Node and pnpm installed on the PC first; TypeScript held at 6.0 for typescript-eslint |
| WP0.3 CI and app builds (#2) | | 20 Oct 13:18 | 20 Oct 18:37 | about 5 h | Every workflow passed on the first run; reworked so skipped jobs can't satisfy required checks; Cargo.lock taken from CI |
| WP0.4 CLAUDE.md (#4) | | 20 Oct 18:39 | 20 Oct 18:42 | minutes after its base merged | Written while CI ran |
| WP0.5 specs and decisions (#5) | | 20 Oct 18:44 | 20 Oct 18:45 | as above | |
| WP0.6 NOTICE and licences (#18) | | 20 Oct 18:46 | 20 Oct 21:05 | about 2.5 h | One CI fix (cargo-deny and our own unlicensed crate) |
| WP0.7 carried over (#21) | | 20 Oct 21:06 | 20 Oct 21:10 | minutes | |
| WP0.1 settings record (#22) | | 20 Oct | | | Org items wait on the owner |
| **WP0.1–0.7 together** | **about 1 week of the 1.5** | **20 Oct** | **20 Oct** | **one working day** | WP0.8 (contracts) is still to do; the WP0 done-when needs it |

Times are local (BST). For WP0, merges were done by S1 when CI was green, as the owner agreed on 20 Oct. From WP0.8 onwards the owner reviews first, so owner time joins the critical path.

## Owner review time

| Date | Hours | What |
|---|---|---|
| 20 Oct 2026 | | Kick-off; two decisions (repo, workspace) and one approval (merging WP0) |

## What this suggests so far

One day is too little evidence to recalibrate on. If the pattern holds, though, code sessions finish infrastructure and documents work well inside the estimates, and the plan's real limits are CI time, device runs and owner reviews, as section 5a expected. Recalibrate at M1 with two weeks of data, including the spikes that need devices.
