# @storystage/tiles

Option C: Alice-style tile editor in React (rows, drop targets, cascading menus, add detail).

- **Owner:** S6
- **Workplan:** WP7c
- **Spec:** `docs/spec/14-editors.md`, section 3
- **Status:** read-only: draws a method as tiles and implements the `CodeEditor` contract, with keyboard focus, screen-reader names and highlights. Editing comes next.

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
