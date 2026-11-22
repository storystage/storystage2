# 0066 Where imported models live, and OBJ

- **Status:** settled
- **Decided:** 8 Nov 2026, by the owner
- **Source:** the owner's answers in the S4 session, at the start of WP3i (workplan 3.11, which left where imports go to 24.2; decision 0065 covered pupils' work, not models)

## Decision

- **A class Backstage on each device,** beside the pupil folders (decision 0065).
  - **A teacher's imports** are there for every pupil on that device.
  - **A learner's import** (when `backstage.import` is `learners`) belongs to that learner until the teacher **promotes** it to the class.
  - Shipped Backstage stays bundled and unchanged (decision 0062). The class Backstage is only ever added to it.
- **Between devices, a model pack file.** The teacher saves a class's models to a file and opens it on another device, through the system's file picker, as with Collect and Hand back. Opening a pack checks every model as an import.
- **Productions still carry the imported models they use** (decision 0049). A film looks right wherever it's opened, whether or not that device's class Backstage has the model.
- **OBJ files are read in the app,** by a small OBJ and MTL reader of our own in the import worker: geometry, normals, texture coordinates, basic materials and their pictures. obj2gltf, which workplan 3.11 named, needs Node and Cesium and can't run in a browser. FBX still isn't read: the teacher guide shows how to convert it with Blender.

## What follows

- **S4 (WP3i):**
  - the import pipeline in a new package, `@storystage/backstage-import`, run in the import worker;
  - the OBJ reader;
  - the model pack format;
  - spec 17 sections 5 and 6.
- **S8 (24.4):** the class Backstage's storage on each device, through `@storystage/host`, as for the pupil folders: items and their files, which pupil each belongs to, promotion, and removal to the bin.
- **S5:** Backstage's import screen and its report, and **Save models** and **Open models** beside Collect and Hand back.
- **D (17.3):** the class Backstage is on the device only. A model pack goes where the teacher saves it.
