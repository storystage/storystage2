/**
 * @storystage/sketches: 2D sketch library (generated) and the frame canvas model.
 *
 * Owner: S4 (sketch generator), S5 (frame canvas). Workplan: WP10.
 *
 * WP10.5, the sketch generator (`docs/spec/17-backstage.md`, section 7): a CPU line renderer
 * that draws a Backstage model in four facings and, for characters, standard poses; the
 * hand-made storyboard marks and backdrop sketches; and the plan of which sketches each item
 * gets. `tools/make-sketches` runs it over the shipped catalogue; imports (3.11) run it in a
 * Web Worker. Test meshes are in `@storystage/sketches/testing`.
 */
export type { SketchMesh, SketchNode } from './mesh.ts';
export { renderSketch, viewOf } from './render.ts';
export type { Sketch, SketchMetrics, SketchOptions, View } from './render.ts';
export { POSES, POSE_TARGETS, canPose, poseMesh } from './pose.ts';
export type { Pose } from './pose.ts';
export { meshFromDocument, meshFromGlb } from './gltf.ts';
export { meshFromModel, readModel } from './vrm.ts';
export type { Model } from './vrm.ts';
export { checkSketch } from './readability.ts';
export type { SketchFlag, SketchIssue } from './readability.ts';
export { BACKDROP_SKETCHES, MARKS, backdropSketchFor } from './marks.ts';
export type { HandSketch } from './marks.ts';
export { sketchFile, sketchPlan, sketchTitle } from './library.ts';
export type { PlannedSketch } from './library.ts';
export { makeItemSketches } from './make.ts';
export type { MadeSketch } from './make.ts';
