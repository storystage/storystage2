/**
 * WP5.8: where a character can walk in a scene, and the way round what's in it, for "walk to"
 * and "run to" (WP4.5). Built once per scene from the ground and the boxes of what stays put,
 * with Recast and Detour (`recast-navigation`, MIT, around Recast's own Zlib licence).
 *
 * It has no graphics, so the fake stage and the real one find the same paths, and a film finds
 * the same path every time it's played. The library is loaded when a scene first needs a path,
 * so a page that never walks anyone doesn't download it.
 */
import type { Vec3 } from '@storystage/story-api';
import type * as Core from '@recast-navigation/core';
import type * as Generators from '@recast-navigation/generators';
import type { Box } from './hull.ts';

/** How much room a walker needs, in metres: a child-sized person, as most of the cast are. */
export interface Walker {
  readonly radius: number;
  readonly height: number;
  /** The highest step it climbs without a jump. */
  readonly climb: number;
}

export const WALKER: Walker = { radius: 0.25, height: 1.6, climb: 0.3 };

/** The walkable area reaches this far past the scene's things, and no further than `MAX_SIZE`. */
const MARGIN = 10;
const MAX_SIZE = 120;
/** Cell sizes, in metres: across, and up. Finer finds narrower gaps and costs more memory. */
const CELL = 0.1;
const CELL_UP = 0.05;

export interface NavigationArea {
  /** The things in the way: boxes in the scene's axes. */
  readonly obstacles: readonly Box[];
  /** Points the area must cover, such as where everyone stands. */
  readonly include: readonly Vec3[];
  /** A room's floor stops at its walls; otherwise the ground goes on. */
  readonly bounds?: Box;
}

export interface Navigation {
  /**
   * The corners of the shortest way from `from` to `to` round the obstacles, both ends
   * included, each on the ground. Null if there's no way, or either end is off the ground.
   */
  path(from: Vec3, to: Vec3): Vec3[] | null;
  /**
   * The way towards `to` as far as the walkable area goes, then straight on to it: for walking
   * out of the picture, or to somewhere there's no way to. Both ends are included.
   */
  toward(from: Vec3, to: Vec3): Vec3[];
  dispose(): void;
}

/** Builds walkable areas at once, once the library is loaded (`loadNavigation`). */
export type NavigationMaker = (area: NavigationArea, walker?: Walker) => Navigation | null;

/** A box's eight corners and twelve triangles, wound so its outside faces out. */
function boxGeometry(box: Box, positions: number[], indices: number[]): void {
  const base = positions.length / 3;
  for (const y of [box.min.y, box.max.y])
    for (const z of [box.min.z, box.max.z])
      for (const x of [box.min.x, box.max.x]) positions.push(x, y, z);
  // Corner i is x + 2z + 4y.
  const quads = [
    [0, 1, 3, 2], // bottom
    [4, 6, 7, 5], // top
    [0, 4, 5, 1], // front (-z)
    [2, 3, 7, 6], // back (+z)
    [0, 2, 6, 4], // left (-x)
    [1, 5, 7, 3], // right (+x)
  ];
  for (const [a, b, c, d] of quads)
    indices.push(base + a!, base + b!, base + c!, base + a!, base + c!, base + d!);
}

/** The ground to walk on: the area round everything, as one flat floor at height 0. */
function groundOf(area: NavigationArea): Box {
  if (area.bounds) return area.bounds;
  const xs = [
    ...area.obstacles.flatMap((b) => [b.min.x, b.max.x]),
    ...area.include.map((p) => p.x),
  ];
  const zs = [
    ...area.obstacles.flatMap((b) => [b.min.z, b.max.z]),
    ...area.include.map((p) => p.z),
  ];
  const span = (values: number[]) => {
    const low = Math.min(0, ...values) - MARGIN;
    const high = Math.max(0, ...values) + MARGIN;
    const middle = (low + high) / 2;
    const half = Math.min(high - low, MAX_SIZE) / 2;
    return [middle - half, middle + half] as const;
  };
  const [x0, x1] = span(xs);
  const [z0, z1] = span(zs);
  return { min: { x: x0, y: -0.05, z: z0 }, max: { x: x1, y: 0, z: z1 } };
}

let loading: Promise<NavigationMaker> | null = null;

/** Loads Recast and Detour, once, and gives a maker of walkable areas. */
export function loadNavigation(): Promise<NavigationMaker> {
  loading ??= Promise.all([
    import('@recast-navigation/core'),
    import('@recast-navigation/generators'),
  ]).then(async ([core, generators]) => {
    await core.init();
    return (area, walker = WALKER) => make(core, generators, area, walker);
  });
  return loading;
}

/** Builds the walkable area. Resolves to null if Recast can't make one (an empty scene can). */
export async function buildNavigation(
  area: NavigationArea,
  walker: Walker = WALKER,
): Promise<Navigation | null> {
  return (await loadNavigation())(area, walker);
}

function make(
  { NavMeshQuery }: typeof Core,
  { generateSoloNavMesh }: typeof Generators,
  area: NavigationArea,
  walker: Walker,
): Navigation | null {
  const positions: number[] = [];
  const indices: number[] = [];
  boxGeometry(groundOf(area), positions, indices);
  for (const box of area.obstacles) boxGeometry(box, positions, indices);
  const { success, navMesh } = generateSoloNavMesh(positions, indices, {
    cs: CELL,
    ch: CELL_UP,
    walkableRadius: Math.ceil(walker.radius / CELL),
    walkableHeight: Math.ceil(walker.height / CELL_UP),
    walkableClimb: Math.floor(walker.climb / CELL_UP),
    walkableSlopeAngle: 45,
  });
  if (!success || !navMesh) return null;
  const query = new NavMeshQuery(navMesh);
  return {
    path(from, to) {
      const found = query.computePath(from, to);
      if (!found.success || found.path.length === 0) return null;
      const end = found.path[found.path.length - 1]!;
      // Detour stops at the nearest reachable point; a way that doesn't get there isn't one.
      if (Math.hypot(end.x - to.x, end.z - to.z) > walker.radius * 2) return null;
      return found.path.map(({ x, y, z }) => ({ x, y, z }));
    },
    toward(from, to) {
      const found = query.computePath(from, to);
      const way = found.success ? found.path.map(({ x, y, z }) => ({ x, y, z })) : [];
      if (way.length === 0) return [from, to];
      const end = way[way.length - 1]!;
      if (Math.hypot(end.x - to.x, end.z - to.z) > walker.radius) way.push(to);
      return [from, ...way.slice(1)];
    },
    dispose() {
      query.destroy();
      navMesh.destroy();
    },
  };
}
