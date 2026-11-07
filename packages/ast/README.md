# @storystage/ast

AST types, JSON schema, node ids, validation, edit operations (undo/redo), migrations.

- **Owner:** S2
- **Workplan:** WP2
- **Spec:** `docs/spec/01-ast.md`
- **Status:** WP2, 2.1 to 2.6

| To | Use |
|---|---|
| Open a `program.json` of any version | `openProgram` |
| Start a program or a scene | `newProgram`, `newSceneType` |
| Hold an open program, with undo and history | `EditSession`; the studio builds `EditorHost` on it |
| Apply edits outside a session (tests, `TestHost`) | `applyEdits` |
| Label an edit | `defaultLabel` |
| Mint ids | `idMinter`; `copyNode` for paste |
| Save | `serializeProgram` |
| Show the text | `programText` (`packages/text-view` wraps it) |
| Check a program | `validateProgram` |

`@storystage/ast/testing` has `sampleProgram`, which holds every statement and expression kind.
