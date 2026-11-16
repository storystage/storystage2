# @storystage/text-view

Read-only text view with switchable wording (Python-like or Java-like), shared by both editors.

- **Owner:** S6
- **Workplan:** WP2.5, WP7 (7.2 "the read-only text view beside it", 7.6 "wording switchable")
- **Spec:** `docs/spec/01-ast.md`, section 6; 07-ux §7.3 "Show as text"

| Use | Gives |
|---|---|
| `textOf(program, { style, method? })` | `{ text, spans, lines }`: `spans` as `programText` gives them (node id, start, end, outermost first); each line's `node` is the innermost block, method, field, class or listener it belongs to (the one starting on it, or the one it closes). With `method`, just that method or listener, unindented |
| `linesOf(text, node)` | The lines a node runs over, by index |
| `javaText(program)` | The Java-like wording, after Alice 3's Java formatter: `this.cat.move(MoveDirection.FORWARD, 1.0, Move.duration(2.0));`, `doTogether { … }`, `for (int i = 0; i < 3; i++) { … }`, `// off: …` |
| `<TextView program style method? highlight? label? />` | The view: a focusable region, "Text of <method>" unless `label` names it, one row per line. `highlight` takes the editor contract's marks by kind; an error's words show beside its line, and the first mark is scrolled into view as it moves (Rehearse's running line) |

The Python-like wording is `programText` from `ast`. In it, StoryStage's own words (`do_in_order`, `do_together`, `each_together`, `when`) carry a "Not in Python" note on hover (16.8).

The Code editor's bar (S5) owns "Show as text" and the choice of wording, and passes `style` in.

`pnpm --filter @storystage/text-view harness`, then http://localhost:4185/ (`?style=java`, `?theme=light`, `?method=all`), shows it with a moving Rehearse mark.
