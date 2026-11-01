# 0034 Teacher Prompter levels

- **Status:** settled
- **Decided:** 25 Oct 2026, by the owner
- **Source:** the owner's answer in the S1 session, on the Direction A design handoff (#49, screen 11)

## Decision

A teacher sets the Prompter for a class at one of **four levels**, as Direction A draws them on screen 11 (class set-up):

| Level | What the Prompter can do |
|---|---|
| **Off** | Nothing. The Prompter isn't shown; learners see the neutral note from screen 12a. |
| **Explain only** | Explain mode and the story coach. |
| **Plan only** | Explain mode, the story coach, and plans: Show me how and Build it write and revise a plan (13.9), but the learner builds every block themselves. |
| **Full** | Every mode: Explain mode, the story coach, Show me how and Build it. |

The story coach is on at every level except Off. It asks questions and never writes the learner's story or script lines (rule 4).

The levels select from the Prompter's modes (13.5); they don't replace them. On top of the level, the daily limit and its action (`prompter.dailyCap`, `prompter.capAction`, for example "Switch to Explain only") still apply.

## How it maps onto the policy keys (15.3)

The existing keys express the four levels, so the policy list doesn't change:

- **Off:** `prompter.enabled` is false.
- **Explain only:** `prompter.explainOnly` is true.
- **Plan only:** `prompter.planOnly` is true.
- **Full:** `prompter.enabled` is true, and neither of the other two is set.

If both `explainOnly` and `planOnly` are set, Explain only wins: the more restrictive level applies.

## Who builds it

S5 builds the screen 11 control. S7 enforces the levels in the Prompter (13.5, 13.9), and S8 enforces them in the policy layer (15.3, 24.4–24.7).
