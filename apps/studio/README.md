# @storystage/studio

The StoryStage 2 app: the three tabs, the Prompter panel and settings. Runs in the browser and inside Tauri (`apps/desktop`).

- **Owner:** S5 (class set-up screens with S8; editor switch with S6)
- **Workplan:** WP7, WP10, WP12
- **Status:** the shell and the three tabs' words (WP12); the tabs' working areas come with WP10a, WP7 and WP11b

## Words

Every word the studio shows is in `src/strings/en-GB.json` (WP12.4; decision 0036, English (UK) only), read through `words` in `src/strings.ts`. The design system's own words (mode names, statuses, the Prompter's labels) are in `@storystage/ui`. Never write a word into a component.

## The component page

`components.html` shows every `@storystage/ui` component in the dark and light themes side by side, for checking against Direction A's screen 14 and for the accessibility checks (12.5). Run `pnpm dev` and open `http://localhost:5173/components.html`. It is a second page for the dev server only and is not part of the app's build.
