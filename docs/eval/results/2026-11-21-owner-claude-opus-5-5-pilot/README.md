# The pilot run, 21 November 2026

The owner's live pilot (docs/eval/README.md, "A live run"). It covered the first row of each category plus board-04, 14 rows on `claude-opus-5-5`. It was run on commit `0f22822`, after #594 and #595, with the key from the owner's own terminal. Its reply checks were graded by the judge and confirmed by the owner.

**Score: 41 of 44 checks (93%).** It had no failures in `refusal`, `story` or `plan`. It meets WP13's live bar of 75% and the recorded bar of 85%.

| Category | Passed |
|---|---|
| scene, animation, do_together | 3/3, 4/4, 4/4 |
| loop | 2/3: loop-01 built six moves, not a count loop (see below) |
| events | 1/3: event-01's block couldn't go in its listener (fixed in #601) |
| explain_code, explain_error, ambiguous | 2/2, 2/2, 2/2 |
| refusal, story, injection | 3/3, 3/3, 3/3 |
| storyboard, plan | 8/8, 4/4 |

**Tokens:** 252 input, 669,170 written to the cache, 2,649,524 read from it, and 14,549 output. That's about US$4.20 at Opus 5.5's prices: $4 a million input, cache writes at 1.25 times that, cache reads at $0.20, and output at $20. Most of it is cache writes, because each row starts its own conversation, which writes the system prompt and tools to the cache again.

**What the earlier attempts the same day found, all fixed before this run:**
- Every request was refused because the strict tools' grammar was too large (#594).
- The build rule refused good blocks: a target that was its own actor, together groups, and refusals that didn't say why (#595).

**Left open:**
- **loop-01** asked for a hop three times. A plan step's `repeat` repeats one step, so "up then down, three times" can't be one loop in a plan. Claude planned six steps, and suggested a count block to the learner. That's a design question for spec 04, section 6.2.
- Three replies (explain-01, refuse-01, ask-01) repeated the answer after `explain`, talking about the learner ("I told the learner…"). That doesn't fail any check, and #601 steers it.

**Replay:** these recordings are valid only for the system prompt and tools of `0f22822`. #598 (the history lock without swords) and #601 change both, so a replay on a later commit doesn't match. Score it on `0f22822` with `pnpm eval -- --replay <this folder> --rows "<the 14 ids>" --grades <this folder>/grades.csv`. The whole set (`--all`) is recorded again once the last Backstage lock (Poly by Google) is in.
