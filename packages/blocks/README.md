# @storystage/blocks

Option B: Blockly 13 made to look and behave like Alice's tiles (`docs/spec/14-editors.md` section 3i).

- **Owner:** S5
- **Workplan:** WP7 (7.2, 7.6)
- **Status:** the blocks, the mapping and gestures as edits are in; the editor, the renderer, the palette and the cascade follow.

## Using it

| To | Use |
|---|---|
| Register every block type with Blockly | `defineBlocks()` (safe to call again) |
| List them | `blockTypes()`: one per Story API entry name, node kind and enumeration |
| Show a method or listener as blocks | `toBlocks(program, owner)`: Blockly's saved workspace, block ids equal to node ids |
| Read a method back | `fromBlocks(state)`: its body, and a listener's arguments and details |
| Turn a finished gesture into edits for `host.apply` | `editsFor(program, fromBlocks(state))`: the fewest edits (a drag is one move), checked on a copy; `putBack` when the program would refuse them |
| A block's words, slots and fields | `shapeOf(type, extraState)` |
| A connection's type check | `inputCheck`, `outputCheck`, `targetCheck` (from the Story API's `fits`) |

Blockly is imported from `blockly/core`. In Node (the tests) that loads Blockly's own jsdom wrapper, so `jsdom` is a test dependency; the browser build never includes it.
