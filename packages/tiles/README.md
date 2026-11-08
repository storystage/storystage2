# @storystage/tiles

Option C: Alice-style tile editor in React (rows, drop targets, cascading menus, add detail).

- **Owner:** S6
- **Workplan:** WP7c
- **Spec:** `docs/spec/14-editors.md`, section 3
- **Status:** draws a method as tiles and edits it: values, details, switching off, deleting, duplicating, copy and paste, and moving by pointer or keyboard. The palette and control bar come next.

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
