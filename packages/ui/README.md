# @storystage/ui

The design system: tokens for the dark and light themes, fonts, icons, components and the strings helper (`docs/spec/07-ux.md` §2.6).

- **Owner:** S5
- **Workplan:** WP12 (12.2–12.5)
- **Design:** Direction A, `docs/design/direction-a/README.md`
- **Status:** tokens and strings (12.2, 12.4); components follow (12.3)

## Rules

- Components use **tokens only**, never a colour value. A theme is a set of values for the same tokens (`tokens.ts`).
- Dark is the default theme (decision 0037). The light theme is approved (decision 0038), and `ThemeRoot` switches to it with `theme="light"`.
- Every pairing of text and surface, and of outline and surface, that the components use is listed in `tokens.test.ts` and must pass WCAG 2.2 AA in both themes.
- Strings live in `src/strings/en-GB.json` (decision 0036: English (UK) only for now), never in components. `strings.test.ts` checks every package's strings for words the learner never sees (`CLAUDE.md` rule 9).
