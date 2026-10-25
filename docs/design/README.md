# Design

## Direction A, "Film studio" (`direction-a/`)

The first-release interface design, handed over by the owner on 22 Oct 2026: 20 screens and a component sheet at 1366 × 768. It is the mock-up set for WP12a (12.1).

- [`direction-a/README.md`](direction-a/README.md) is the handoff note, kept as delivered: tokens, components, every screen and its behaviour, and a suggested build order. Read it before building any screen.
- `direction-a/design/` holds the HTML prototypes. Open `StoryStage Direction A - Index.dc.html` in a browser; it needs `support.js` and `Figure.dc.html` beside it, and it loads fonts and its preview runtime from the web. They are references, not app code: the app bundles its own fonts and loads nothing from elsewhere.
- `direction-a/screenshots/` has a 1366 × 768 PNG of every screen, for side-by-side checks.

**Not in the repository:** the handoff's three Alice 3 screenshots (`reference/`), the source for the Tiles grammar. They show Carnegie Mellon University's software, and the handoff says not to ship them, so they stay in the owner's handoff folder until CMU's permission arrives (WP17.1). Ask the owner for them if you need them.

**Where the handoff and the workplan differ,** the owner's decisions are recorded in `docs/decisions/` and listed here once made. The full list of differences is in the S1 comment on #49.

- **Age range:** 6 to 13, provisionally, until the curriculum review (decision 0030).
- **Fonts:** Bricolage Grotesque, Atkinson Hyperlegible (OFL-1.1) and Material Symbols Rounded, bundled from Fontsource packages, never loaded from Google Fonts (decision 0031).
- **School key and Prompter use reports (screen 11b):** routing through "the school's service" and "Email me at 80%" both need a server, so they stay open until the decision on how the Prompter reaches a group (WP24.3, due at M1). Until then, build 11b's key and limits on the device only.
