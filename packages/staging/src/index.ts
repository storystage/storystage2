/**
 * @storystage/staging: Set the stage from the storyboard (WP10.10; 07-ux 7.2), shared by the
 * studio's button and the Prompter's `stage_scene` (spec 04 section 3.2), so the two always agree.
 *
 * Owner: S5. Moved out of the studio (17 Nov) so S7's evaluation harness runs the same step.
 * It sits on `@storystage/production`, never in it: it needs `@storystage/check`'s geometry and
 * `@storystage/sketches`, which both depend on production (S4's review).
 */
export * from './fromStoryboard.ts';
export * from './scene.ts';
