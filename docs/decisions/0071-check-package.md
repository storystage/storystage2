# 0071 A package for the automatic check against the storyboard

- **Status:** settled
- **Decided:** 10 Nov 2026, by the owner
- **Source:** the owner's answers in the S2 session, at the start of WP11c

## Decision

1. **A new workspace package, `packages/check` (`@storystage/check`), owned by S2,** holds the automatic check against the storyboard (WP11.6, spec 08 section 9): the comparison between what a run did and what the storyboard planned, its plain words, and the runner that plays the code offscreen on the playback driver. It has no React.
    - S5's Production stage ("Check this frame", "Check this scene") and S2's Screening room ("Check the whole film") both run it.
    - S7's Prompter reads its results (`check_frame`) without importing a screen.
2. **Each frame's latest result, and the flags the learner chose to keep, are saved in the film** (`Frame.check`, a production format change for S4). The teacher sees the checklist as evidence for marking (11.6), "Checked" survives closing the film, and `check_frame` reads it.

Workplan section 4 lists the package.

## Options set aside

- **The check inside `packages/playback`,** beside the driver it runs on. It would have made the driver's package both "plays a film" and "judges a film", and S7's Prompter would then depend on the driver to read a result.
- **The check in `packages/screening`.** That's the Screening room's React screen, which the Production stage and the Prompter shouldn't import.
- **Results kept in memory only.** "Checked" would have to be earned again after every reopening, and the teacher would see the checklist only live.
