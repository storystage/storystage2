# @storystage/backstage-import

Bringing a model into the class Backstage (WP3i; decision 0066; spec 17, sections 5 and 6). Owner: S4.

- `licence.ts`: the licence a person picks on import, and the credit line and source made from it (spec 17, section 6).
- `checks.ts`: what's checked before anything heavy runs (spec 17, section 5, step 1; spec 15, section 3.4): which files can be imported, their sizes, each picture's size from its header, required glTF extensions, `uri`s, and the ceilings that keep the import worker safe.

- `obj.ts`: `readObj`, our own OBJ and MTL reader (decision 0066), which makes a glTF document: geometry, normals, texture coordinates, groups and objects as nodes, polygons as triangles, and colour, see-through and picture materials. What it leaves out is listed for the report.

Still to come: `importModel` (reduction, skeleton, sketches, record and report) and the model pack.

Everything here is pure and runs in the import worker. The caller saves into the class Backstage (`ClassFolders.backstage()`, `@storystage/host`).
