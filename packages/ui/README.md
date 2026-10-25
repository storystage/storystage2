# @storystage/ui

The design system: tokens for the dark and light themes, fonts, icons, components and the strings helper (`docs/spec/07-ux.md` §2.6).

- **Owner:** S5
- **Workplan:** WP12 (12.2–12.5)
- **Design:** Direction A, `docs/design/direction-a/README.md`; the component sheet is screen 14
- **Status:** tokens, strings, fonts, icons, `ThemeRoot`, `Button`, `StatusChip`, `AiBadge`; more components follow (12.3)

## Using it

```tsx
import '@storystage/ui/fonts';
import '@storystage/ui/styles.css';
import { Button, ThemeRoot } from '@storystage/ui';

<ThemeRoot>
  <Button variant="primary" icon="play_arrow" iconFilled>
    Rehearse
  </Button>
</ThemeRoot>;
```

## Rules

- Components use **tokens only**, never a colour value (`styles.test.ts` checks `styles.css`). A theme is a set of values for the same tokens (`tokens.ts`).
- Dark is the default theme (decision 0037). The light theme is approved (decision 0038), and `ThemeRoot` switches to it with `theme="light"`.
- Every pairing of text and surface, and of outline and surface, that the components use is listed in `tokens.test.ts` and must pass WCAG 2.2 AA in both themes.
- Components are built on **React Aria Components** (Apache-2.0), which gives them their keyboard behaviour, roles and focus handling. Style their states through its data attributes (`data-focus-visible`, `data-pressed`, `data-disabled`).
- Words live in `src/strings/en-GB.json` (decision 0036), never in components. `strings.test.ts` checks every package's strings for words the learner never sees (`CLAUDE.md` rule 9).
- **Fonts** are bundled from Fontsource (decision 0031), Latin only for now.
- **Icons** are Material Symbols Rounded drawn as inline SVG. Only the icons listed in `scripts/icons.ts` ship, so there is no icon font to download. To add one, put its name in the list and run `pnpm --filter @storystage/ui icons`.
