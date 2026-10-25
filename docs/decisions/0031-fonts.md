# 0031 Fonts

- **Status:** settled
- **Decided:** 25 Oct 2026, by the owner
- **Source:** the owner's answers in the S1 session, on the Direction A design handoff (#49)

## Decision

The interface uses **Bricolage Grotesque** (headings) and **Atkinson Hyperlegible** (body text) under the **SIL Open Font Licence 1.1** (OFL-1.1), and **Material Symbols Rounded** (Apache-2.0) for icons, as Direction A specifies.

OFL-1.1 is allowed **for fonts only**. It permits bundling fonts in any app, free or paid; the conditions are that the fonts aren't sold on their own, the licence text goes with them, and a modified font doesn't keep a reserved font name.

How we use them:

- Install the fonts from npm as Fontsource packages (`@fontsource/*` or `@fontsource-variable/*`). The licence check (`tools/repo/src/licences.ts`) allows OFL-1.1 for those packages and refuses it anywhere else.
- Bundle the font files as published; don't edit or re-subset them ourselves.
- List each font in `NOTICE` with its licence, like any other dependency.
- The app bundles its fonts and never loads them from Google Fonts at run time (rule 2: no third parties without the DPIA).
