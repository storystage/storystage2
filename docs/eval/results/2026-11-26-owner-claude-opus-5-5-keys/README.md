# The rerun of three rows on keys and words, 26 November 2026

The owner's live rerun, on `claude-opus-5-5`, of three rows, as the owner chose on 26 Nov:

- **event-03**, a key press ("When I press the space bar, the dog jumps."), now that which keys a key listener is for is built (spec 02 section 6a): the Prompter's part (#703) and S2's runtime (#705);
- **own-03**, the fox's greet move with its frame's own line, and **own-06**, the clash between the request's words and the frame's line, now that the plan check applies spec 04 section 6.5's words rule (#697).

It ran on `6fb747c9`, main with #697, #703 and #705, with the key from the owner's own terminal. The command checked for #703's and #705's code before it asked for the key, and the grammar probe passed. The judge graded the one reply check, and the owner confirmed it.

**Score: 9 of 9 checks (100%).** It's 3 of the 92 rows, so it doesn't decide the live bar.

| Category | Passed |
|---|---|
| events | 3/3 |
| own_moves | 6/6 |

**As run:** 8 of 8 code checks passed. The owner confirmed the judge's pass for own-06's `asks_question` (26 Nov). No check, code or recording was changed after the run.

**What it shows, live once:**

- **event-03: a listener for space alone.** The plan's when step gave `keys: space`. The listener was built as `keyPress` with `keys` a list of one `Key`, `space`, and the dog's two moves, up and back down half a metre, went inside it. `event_listener` asked for exactly `["space"]`. With #705, the runtime runs it for space only.
- **own-03: the frame's line, through the learner's move.** The Prompter coded frame f1-1 and called the fox's `greet` with "Hello, little penguins.", the frame's script line. Nothing was refused.
- **own-06: the plan check caught the clash before a plan was shown.** The request was "Code frame f1-1, and use the fox's greet move to say 'Good morning, everyone!'". The first plan was refused with "In a storyboard frame, words come from the script. Choose a script line for this step, or change the line in the script first." The Prompter then explained and asked: "Your script line for this frame says "Hello, little penguins." Do you want the fox's greet move to say that line? Or you can change the line in your script to your new words first, and then I'll plan it with those." Nothing was built. On 25 Nov the same clash got as far as Build.
- **Refused calls, replayed:** that one only.

**Tokens:** 60 input, 210,502 written to the cache, 681,700 read from it and 4,056 output. That's about US$1.27 at the first full run's prices, without the judge.

**Replay:** these recordings are valid for the system prompt and tools of `6fb747c9`, and of `35207016`, where the pins regenerate unchanged. Score them with `pnpm eval -- --replay <a copy of this folder> --rows "event-03,own-03,own-06" --grades <this folder>/grades.csv`. The replay's "Bar (recorded): met" is for these rows only.
