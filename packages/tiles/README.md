# @storystage/tiles

Option C: Alice-style tile editor in React (rows, drop targets, cascading menus, add detail).

- **Owner:** S6
- **Workplan:** WP7c
- **Spec:** `docs/spec/14-editors.md`, section 3
- **Status:** draws a method as tiles and edits it: values, details, switching off, deleting, duplicating, copy and paste, and moving by pointer or keyboard. The methods panel (object picker, Actions and Questions, the palette in categories), a tab for each method and event with "add event ▾", and the control bar put new blocks in, asking for each value in turn. Variable and assign tiles, and performance at 500 statements (3h), come next.

The studio mounts it through the WP0.8 editor contract:

```ts
import { TileEditor } from '@storystage/tiles';
const editor = new TileEditor();
editor.mount(element, host, view);
```

## Commands

```
pnpm --filter @storystage/tiles harness   # the editor on its own: http://localhost:4183/
```

The end-to-end tests in `e2e/` run against that page, with axe at the three sizes in `docs/spec/07-ux.md`.
