# Design

## Direction A, "Film studio" (`direction-a/`)

The first-release interface design, handed over by the owner on 22 Oct 2026: 20 screens and a component sheet at 1366 × 768. With the laptop and iPad sizes added on 25 Oct 2026, it is the mock-up set for WP12a (12.1).

- [`direction-a/README.md`](direction-a/README.md) is the handoff note: tokens, components, every screen and its behaviour, and a suggested build order. Read it before building any screen. It has been **reconciled with `docs/decisions/`**: its first section lists each change and the decision behind it, and the handoff as delivered is in the file's history (commit `b0a73ea`).
- `direction-a/design/` holds the HTML prototypes, kept as delivered. Open `StoryStage Direction A - Index.dc.html` in a browser; it needs `support.js` and `Figure.dc.html` beside it, and it loads fonts and its preview runtime from the web. They are references, not app code: the app bundles its own fonts and loads nothing from elsewhere.
- [`direction-a/sizes/`](direction-a/sizes/index.html) holds the screens 12.1 names (Storyboard, Production stage with the Prompter, Screening room, set-up wizard, class set-up) as plain HTML that lays itself out by window size, plus a new screen, 02c: the Code editor closed until the scene is storyboarded (10.8). Open `index.html` to see each one at laptop (1536 × 864), Chromebook (1366 × 768) and iPad (1180 × 820) sizes, or open a screen on its own and resize the window. The size rules are in `docs/spec/07-ux.md` §1. The markup is the handoff's, taken from `design/`; `sizes.css` and `sizes.js` add the rules.
- `direction-a/screenshots/` has a 1366 × 768 PNG of every screen, and `screenshots/sizes/` the laptop and iPad PNGs, for side-by-side checks.

**Not in the repository:** the handoff's three Alice 3 screenshots (`reference/`), the source for the Tiles grammar. They show Carnegie Mellon University's software, and the handoff says not to ship them, so they stay in the owner's handoff folder until CMU's permission arrives (WP17.1). Ask the owner for them if you need them.

**Where the handoff and the decisions differ,** the decisions win. The full list is in the handoff README's first section; the owner's decisions on it so far:

- **Age range:** 6 to 13, provisionally, until the curriculum review (decision 0030).
- **Fonts:** Bricolage Grotesque, Atkinson Hyperlegible (OFL-1.1) and Material Symbols Rounded, bundled from Fontsource packages, never loaded from Google Fonts (decision 0031).
- **School key and Prompter use reports (screen 11b):** routing through "the school's service" and "Email me at 80%" both need a server, so they stay open until the decision on how the Prompter reaches a group (WP24.3, due at M1). Until then, build 11b's key and limits on the device only.
- **Light theme:** yes, drawn as mock-ups and approved before it is built (decision 0032). Drawn on 25 Oct 2026: open `sizes/index.html?theme=light`; PNGs in `screenshots/light/`; the values are tabled in the handoff README ("Colour, light theme"). **Approved by the owner on 25 Oct 2026** (decision 0038).
- **Narrow windows:** nothing below 1024 px wide; a note asks to turn the iPad or widen the window (decision 0033).
- **Teacher Prompter levels (screen 11):** Off, Explain only, Plan only and Full, as drawn. Full allows Show me how and Build it; the story coach is on at every level except Off (decision 0034).

**Still open for the owner:** approving the mock-ups, which 12.1 says comes after the teacher interviews (16.7) and the first use cases (16.6).
