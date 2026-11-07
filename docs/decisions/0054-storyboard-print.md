# 0054 Storyboard print

- **Status:** settled
- **Decided:** 7 Nov 2026, by the owner
- **Source:** the owner's answer in the S5 session, planning WP10a

## Decision

The Storyboard PDF (WP10.7) comes from a **print layout and the device's own print dialog**, which offers Save as PDF on Windows, macOS and Chromebook. StoryStage doesn't generate a PDF file itself, so there is no PDF library to add and nothing to save through the host interface.

The layout is in `docs/spec/07-ux.md` section 6.7. If the iPad app's web view can't print, the iPad app gets a native print step through the host interface (S8), not a different layout.
