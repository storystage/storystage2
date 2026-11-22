/**
 * Draco-compressed meshes, decoded when a model is fetched (the owner's choice of 21 Nov 2026,
 * for NASA's models, most of which come Draco-compressed). The stage and the import never read
 * Draco (spec 17, section 5), so the build writes every model uncompressed. The decoder,
 * Google's `draco3dgltf` (Apache-2.0), is a build tool only and never reaches the app.
 */
import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import draco3d from 'draco3dgltf';

const DRACO = 'KHR_draco_mesh_compression';

/** Whether a binary glTF's JSON names Draco among the extensions it uses. */
export function usesDraco(glb: Uint8Array): boolean {
  if (glb.byteLength < 20) return false;
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  // "glTF", then a JSON chunk ("JSON") of the length given at byte 12.
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a)
    return false;
  const length = view.getUint32(12, true);
  if (20 + length > glb.byteLength) return false;
  try {
    const json = JSON.parse(new TextDecoder().decode(glb.subarray(20, 20 + length))) as {
      extensionsUsed?: unknown;
    };
    return Array.isArray(json.extensionsUsed) && json.extensionsUsed.includes(DRACO);
  } catch {
    return false;
  }
}

let decoder: Promise<unknown> | undefined;

/** The same model with its Draco meshes decoded, or the bytes as they are if it has none. */
export async function undraco(glb: Uint8Array): Promise<Uint8Array> {
  if (!usesDraco(glb)) return glb;
  decoder ??= draco3d.createDecoderModule();
  const io = new WebIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'draco3d.decoder': await decoder });
  const doc = await io.readBinary(glb);
  // Read, the meshes are plain accessors; without the extension they're written so.
  doc
    .getRoot()
    .listExtensionsUsed()
    .find((e) => e.extensionName === DRACO)
    ?.dispose();
  return io.writeBinary(doc);
}
