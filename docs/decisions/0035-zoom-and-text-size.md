# 0035 Zoom and text size

- **Status:** settled
- **Decided:** 25 Oct 2026, by the owner
- **Source:** the owner's answer in the S5 session, on `docs/spec/07-ux.md` §4 (#63)

## Decision

How decision 0033 (windows 1024 px wide and up) meets WCAG 2.2 when someone zooms:

- The three working tabs (the Storyboard's frame canvas, the Production stage's scene and code, the Screening room's player) need two-dimensional layout, which WCAG 1.4.10 exempts from reflow. Below 1024 px wide they show 0033's note.
- Settings, Learn, the set-up wizard and every dialog **reflow down to 320 px** and never show the note.
- **Settings › Accessibility › Text size** (100%, 125%, 150%) enlarges the type without narrowing the window, so a learner who needs bigger text keeps the studio.
