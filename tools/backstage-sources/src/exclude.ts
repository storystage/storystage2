/**
 * Removes parts of a model a source list excludes (`exclude` in `sources/*.json`): nodes by name
 * (for example the weapons a game character carries, all modelled in its hands) and animation
 * clips by name (for example attacks), then everything only they used, so the file shrinks.
 * Patterns match whole names, with `*` for any run of characters. VRM files are never rewritten.
 */
import { WebIO, type Document, type Property } from '@gltf-transform/core';

export interface Exclude {
  readonly nodes?: readonly string[];
  readonly animations?: readonly string[];
}

export interface Excluded {
  readonly bytes: Uint8Array;
  readonly removed: { readonly nodes: string[]; readonly animations: string[] };
}

export const globToRegExp = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split('*')
      .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
      .join('.*')}$`,
  );

export async function applyExcludes(bytes: Uint8Array, exclude: Exclude): Promise<Excluded> {
  const nodeRes = (exclude.nodes ?? []).map(globToRegExp);
  const animRes = (exclude.animations ?? []).map(globToRegExp);
  const io = new WebIO();
  const doc = await io.readBinary(bytes);
  const root = doc.getRoot();
  const removed = { nodes: [] as string[], animations: [] as string[] };
  for (const node of root.listNodes()) {
    if (node.isDisposed() || !nodeRes.some((re) => re.test(node.getName()))) continue;
    removed.nodes.push(node.getName());
    for (const child of node.listChildren()) node.removeChild(child).dispose();
    node.dispose();
  }
  for (const anim of root.listAnimations()) {
    if (!animRes.some((re) => re.test(anim.getName()))) continue;
    removed.animations.push(anim.getName());
    for (const s of anim.listSamplers()) s.dispose();
    for (const c of anim.listChannels()) c.dispose();
    anim.dispose();
  }
  if (!removed.nodes.length && !removed.animations.length) return { bytes, removed };
  pruneOrphans(doc);
  return { bytes: await io.writeBinary(doc), removed };
}

/** Disposes meshes, skins, materials, textures and accessors nothing uses any more. */
function pruneOrphans(doc: Document) {
  const root = doc.getRoot();
  const used = (p: Property) => p.listParents().some((parent) => parent !== root);
  for (let changed = true; changed;) {
    changed = false;
    const lists: Property[][] = [
      root.listMeshes(),
      root.listSkins(),
      root.listMaterials(),
      root.listTextures(),
      root.listAccessors(),
    ];
    for (const list of lists)
      for (const p of list)
        if (!used(p)) {
          p.dispose();
          changed = true;
        }
  }
}
