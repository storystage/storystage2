# @storystage/studio

The StoryStage 2 app: the three tabs, the Prompter panel and settings. Runs in the browser and inside Tauri (`apps/desktop`).

- **Owner:** S5 (class set-up screens with S8; editor switch with S6)
- **Workplan:** WP7, WP10, WP12
- **Status:** placeholder shell (WP0.2); the component page is in (WP12.3)

## The component page

`components.html` shows every `@storystage/ui` component in the dark and light themes side by side, for checking against Direction A's screen 14 and for the accessibility checks (12.5). Run `pnpm dev` and open `http://localhost:5173/components.html`. It is a second page for the dev server only and is not part of the app's build.
