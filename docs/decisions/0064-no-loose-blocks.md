# 0064 No loose blocks

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answer in the S5 session, on the WP7 spec pull request #183

## Decision

**A block dropped outside a method doesn't stay there.** It goes back where it came from, or, dropped from the palette, isn't added, and the learner hears "Blocks go inside a method". This is Alice's own rule. It applies to both code editors, through the shared `canPlace` (`14-editors.md` section 1.2): Blocks (option B) and Tiles (option C) behave the same way.

## Why

A loose block isn't part of the program (`01-ast.md`): the program belongs to the studio, and an editor only shows it. Keeping loose blocks on the Blocks workspace, switched off, as the workplan's 7.6 first said, would lose them whenever the learner switched to Tiles, reopened the production or the Prompter changed the method, which breaks the switch's promise that nothing is lost (7.11) and the parity tests (7.12). Keeping them in the program instead would need a "parked blocks" area in the AST and in both editors.

## What follows

- **S5:** `14-editors.md` section 2.2 and workplan 7.6 say so; the Blocks editor removes the drop and announces it.
- **S6:** Tiles refuse the same drop (no drop zone outside a method, as in spike 1.5).
- **Unchanged:** switching a statement off inside a method (`enabled: false`) stays, in both editors.
