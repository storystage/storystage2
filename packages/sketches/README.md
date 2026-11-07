# @storystage/sketches

2D sketch library (generated) and the frame canvas model.

- **Owner:** S4 (sketch generator), S5 (frame canvas)
- **Workplan:** WP10
- **Spec:** `docs/spec/17-backstage.md`, section 7
- **Status:**
  - the sketch generator (WP10.5): `renderSketch`, poses, glTF reading, the readability check, the hand-made marks and backdrop sketches, and `makeItemSketches`;
  - test meshes in `@storystage/sketches/testing`;
  - the frame canvas model comes with WP10a (S5).

Plain TypeScript with no browser APIs, so it runs in Node (`tools/make-sketches`) and in a Web Worker (imports, WP3.11).
