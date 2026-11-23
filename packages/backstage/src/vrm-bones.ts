/**
 * A VRM avatar's own bone table (`humanBones`), read once for the Backstage build, imports and
 * the stage: which node is which bone, in VRM 1.0's names, which are the joint map's (spec 17
 * section 2), whatever the avatar's version.
 */

/**
 * VRM 0.x names the thumb one bone along from VRM 1.0: its Proximal is 1.0's Metacarpal, and its
 * Intermediate 1.0's Proximal. Its Distal is the same.
 */
export const VRM0_THUMBS: ReadonlyMap<string, string> = new Map([
  ['leftThumbProximal', 'leftThumbMetacarpal'],
  ['leftThumbIntermediate', 'leftThumbProximal'],
  ['rightThumbProximal', 'rightThumbMetacarpal'],
  ['rightThumbIntermediate', 'rightThumbProximal'],
]);

export interface VrmBoneTable {
  /** The VRM version the table is in, or null if the file isn't a VRM. */
  readonly version: '0' | '1' | null;
  /** Each bone's node, by node index, named as VRM 1.0 names it. */
  readonly bones: ReadonlyMap<number, string>;
}

interface VrmJson {
  readonly nodes?: unknown;
  readonly extensions?: {
    readonly VRM?: { readonly humanoid?: { readonly humanBones?: unknown } };
    readonly VRMC_vrm?: { readonly humanoid?: { readonly humanBones?: unknown } };
  };
}

/**
 * The bone table of a glTF's JSON. Version 1.0 keys its bones by name and 0.x lists them; files
 * come from anywhere, so an entry without a bone name or a node the file has is left out.
 */
export function vrmBoneTable(json: unknown): VrmBoneTable {
  const { nodes, extensions } = (typeof json === 'object' && json !== null ? json : {}) as VrmJson;
  const version = extensions?.VRMC_vrm ? '1' : extensions?.VRM ? '0' : null;
  const bones = new Map<number, string>();
  if (version === null) return { version, bones };
  const table = (version === '1' ? extensions!.VRMC_vrm : extensions!.VRM)?.humanoid?.humanBones;
  if (typeof table !== 'object' || table === null) return { version, bones };
  const entries: [unknown, unknown][] =
    version === '0'
      ? (Array.isArray(table) ? table : []).map((b: { bone?: unknown; node?: unknown } | null) => [
          b?.bone,
          b?.node,
        ])
      : Array.isArray(table)
        ? []
        : Object.entries(table).map(([bone, b]: [string, { node?: unknown } | null]) => [
            bone,
            b?.node,
          ]);
  const count = Array.isArray(nodes) ? nodes.length : 0;
  for (const [bone, node] of entries)
    if (
      typeof bone === 'string' &&
      Number.isInteger(node) &&
      (node as number) >= 0 &&
      (node as number) < count
    )
      bones.set(node as number, version === '0' ? (VRM0_THUMBS.get(bone) ?? bone) : bone);
  return { version, bones };
}
