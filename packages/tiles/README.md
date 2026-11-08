# @storystage/tiles

Option C: Alice-style tile editor in React (rows, drop targets, cascading menus, add detail).

- **Owner:** S6
- **Workplan:** WP7c
- **Spec:** `docs/spec/14-editors.md`, section 3
- **Status:** draws a method as tiles and edits it: values, details, switching off, deleting, duplicating, copy and paste, and moving by pointer or keyboard. The methods panel (object picker, Actions and Questions, the palette in categories), a tab for each method and event with "add event ▾", and the control bar put new blocks in, asking for each value in turn. Highlights: Rehearse's outline moves (still for reduced motion), and the Prompter's highlight wears the AI badge. A method of 500 statements answers a keystroke or drop within 100 ms (3h): `e2e/performance.e2e.ts` times it on the production build (`pnpm --filter @storystage/tiles harness:production`, port 4184); `TILES_CPU_SLOWDOWN=4` slows the CPU fourfold as a stand-in for the Chromebook. Variable and assign tiles come next.

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
