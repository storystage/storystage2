/**
 * Removes parts of a model a source list excludes (`exclude` in `sources/*.json`): nodes by name
 * (for example the weapons a game character carries, all modelled in its hands) and animation
 * clips by name (for example attacks), then everything only they used, so the file shrinks.
 * A node goes with everything under it (one of several animals sharing a file goes with its
 * armature, its bones and its skin), and so do the animation channels that moved them.
 * Patterns match whole names, with `*` for any run of characters. VRM files are never rewritten.
 */
import { WebIO, type Document, type Node, type Property } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

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
  // Every standard extension: a model the build reduced has WebP textures (`EXT_texture_webp`).
  const io = new WebIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(bytes);
  const root = doc.getRoot();
  const removed = { nodes: [] as string[], animations: [] as string[] };
  for (const node of root.listNodes()) {
    if (node.isDisposed() || !nodeRes.some((re) => re.test(node.getName()))) continue;
    removed.nodes.push(node.getName());
    // The whole subtree goes: an armature takes its bones, and their bones, with it.
    const tree: Node[] = [];
    node.traverse((n) => tree.push(n));
    for (const n of tree.reverse()) n.dispose();
  }
  for (const anim of root.listAnimations()) {
    // A channel whose node went with an excluded part moves nothing, so it goes too; a clip
    // that only moved excluded parts goes with them.
    const orphaned = anim.listChannels().filter((c) => !c.getTargetNode());
    for (const c of orphaned) {
      const sampler = c.getSampler();
      c.dispose();
      if (sampler && !sampler.listParents().some((p) => p.propertyType === 'AnimationChannel'))
        sampler.dispose();
    }
    const emptied = orphaned.length > 0 && anim.listChannels().length === 0;
    if (!emptied && !animRes.some((re) => re.test(anim.getName()))) continue;
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
