# The rerun of eight rows, 22 November 2026

The owner's live rerun, on `claude-opus-5-5`, of eight rows after the full run of the same day (../2026-11-22-owner-claude-opus-5-5): plan-06, board-02, board-03, board-07, story-04, story-06, story-10 and anim-06. It ran on `85d711f`, #626's branch with lists and the story coach's open questions.

**Score: 33 of 34 checks (97.1%), after the changes below.** This isn't a whole live run, so it doesn't decide WP13's live bar by itself.

**As run: 28 of 34.** 22 of 25 code checks passed, with plan-06's `build_matches_plan` failing where no failures are allowed. The judge passed 6 of the 9 reply checks.

**Changed after the run:**

| What | Why | Effect |
|---|---|---|
| A bug fix, `8127206` in #626 | A do together named for its group's second step took that step's words and highlight, so plan-06's comments read out of order | plan-06 passes **on replay**. It hasn't run live with the fix |
| board-02's `method_order` takes `moveTo` or `moveToward` (owner, 22 Nov, if it works technically) | See the runtime test below | board-02 passes |
| board-07's `plan_says_missing`, to a pass (owner) | The step's "why" says the storyboard has a fox stand-in and the scene needs a real fox | One reply check |
| story-04's and story-10's `writes_no_story`, to a pass (owner) | "Pip looks at the sea, then floats away on some ice and meets a fox" joins the learner's line and synopsis in nearly their words. The judge read that as rewording | Two reply checks, in a category that allows no failures |

**The runtime test for board-02:** the built film was played in the real runtime on the fake stage, which uses the real stage's timeline but draws nothing. It passed the program check, ran 4 seconds with no errors, and the owl turned to the cat and said the line. `moveToward` by 1.5 metres left the owl 1.33 metres from the tree's centre. With `moveTo` swapped in, it ended at the centre.

**Still open:**

- **anim-06** asked about the penguin's head and built nothing, as in the full run. The stand-in penguin has no Backstage line.
- **story-06** still offered answers to pick from ("friendly, shy, sneaky or something else?"), despite the coach's new line. The row has no `no_list_of_ideas` check, so no check fails.
- **The other story rows** (8 of 11) haven't run live with the coach's new line.
- **event-02's** wider check (#626) hasn't been scored on a run.

**Tokens:** 176 input, 473,370 written to the cache, 2,287,144 read from it and 15,030 output: about US$3.13 at the full run's prices, without the judge.

**Replay:** these recordings are valid for #626's system prompt and tools. Score them with `pnpm eval -- --replay <this folder> --rows "plan-06,board-02,board-03,board-07,story-04,story-06,story-10,anim-06" --grades <this folder>/grades.csv`.
