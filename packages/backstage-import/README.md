# @storystage/backstage-import

Bringing a model into the class Backstage (WP3i; decision 0066; spec 17, sections 5 and 6). Owner: S4.

- `licence.ts`: the licence a person picks on import, and the credit line and source made from it (spec 17, section 6).
- `checks.ts`: what's checked before anything heavy runs (spec 17, section 5, step 1; spec 15, section 3.4): which files can be imported, their sizes, each picture's size from its header, required glTF extensions, `uri`s, and the ceilings that keep the import worker safe.

- `obj.ts`: `readObj`, our own OBJ and MTL reader (decision 0066), which makes a glTF document: geometry, normals, texture coordinates, groups and objects as nodes, polygons as triangles, and colour, see-through and picture materials. What it leaves out is listed for the report.

- `import.ts`: `importModel`, the whole pipeline: the checks, reading (OBJ, glTF, `.glb` and VRM, a VRM 0.x avatar turned to face +Z), `reduceModel` to the section's budget, the skeleton, sketches and thumbnail, the record and the report. The browser's picture encoder and decoder are passed in (`ImportTools`). `classModelId` makes the record's id.

- `browser.ts`: `browserImageTools`, the picture tools from the browser's own canvas (`OffscreenCanvas`): textures and the thumbnail as WebP, or PNG where WebP can't be made (Safari), and pictures decoded for the thumbnail.
- `worker.ts` and `import-worker.ts` (`@storystage/backstage-import/worker`): the import in a Web Worker of its own. `importInWorker` starts a fresh worker for each import and stops it after `IMPORT_TIME_LIMIT_MS` (60 seconds).
- `pack.ts` (also `@storystage/backstage-import/pack`, light enough for the studio to load on every save): `packModels`, which brings a production's packed models up to date before it's saved (decision 0049): class models it uses are packed from the class Backstage, ones it stopped using are dropped, and packed ones stay even if the class Backstage lost them.

- `model-pack.ts`: the model pack, a class's models in one file for another device. `writeModelPack` and `modelPackFromClass` (the class's own models, not pupils') write it; `openModelPack` checks every model as an import (`buildModel`), reducing only one over its budget and drawing new sketches and a new thumbnail, and leaves out, with the reason, any that fail or that the class Backstage already has.

That's all of WP3i's code. The studio's screens (S5) call it: `importInWorker` to import, `packModels` before each save, and the model pack from Settings.

Everything here is pure and runs in the import worker. The caller saves into the class Backstage (`ClassFolders.backstage()`, `@storystage/host`).
