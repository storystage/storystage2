/** A Babylon.js engine with no graphics, for unit tests. Real pixels are tested in `e2e/`. */
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js';

class HeadlessEngine extends NullEngine {
  override readPixels(_x: number, _y: number, width: number, height: number) {
    return Promise.resolve<ArrayBufferView>(new Uint8Array(width * height * 4));
  }
}

export const headlessEngine = () =>
  new HeadlessEngine({
    renderWidth: 640,
    renderHeight: 360,
    textureSize: 256,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
