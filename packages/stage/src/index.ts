/**
 * @storystage/stage: Babylon.js scene, model loading, joints, cameras and markers, picking, transforms, offscreen render.
 *
 * Owner: S3. Workplan: WP5.
 *
 * WP0.8: the stage interface (`contract.ts`). The fake stage and the contract's test suite are
 * in `@storystage/stage/testing`. The Babylon.js stage is in `@storystage/stage/babylon`, so that
 * importing this entry doesn't load Babylon.js.
 */
export type { FrameImage, Speech, Stage } from './contract.ts';
export {
  BACKDROP_TEMPLATES,
  GROUND_TYPES,
  PICTURE_SKY_TYPES,
  groundLook,
  type BackdropTemplate,
} from './backdrops.ts';
