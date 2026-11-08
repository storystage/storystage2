/**
 * Spike 23.1: projection surfaces as flat quads, in metres, with a texture layout (UVs) that
 * follows Pixera's rules (workplan WP23): triangles only, UVs in 0–1, no two faces sharing
 * texture space, and every face given texture space in proportion to its real size.
 * Pure functions, so the layout is unit-tested without a GPU.
 */

export type V3 = readonly [number, number, number];

/** A flat face: four corners, anticlockwise as seen from the front (the audience side). */
export interface Quad {
  name: string;
  corners: readonly [V3, V3, V3, V3];
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalise = (a: V3): V3 => {
  const l = len(a);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** Width (first edge) and height (last edge) of a quad, in metres. */
export const quadSize = (q: Quad) => ({
  w: len(sub(q.corners[1], q.corners[0])),
  h: len(sub(q.corners[3], q.corners[0])),
});

/**
 * The quad's outward normal. Babylon.js is left-handed: corners that go anticlockwise as seen
 * from the front give a normal pointing towards the viewer with this order of the cross product.
 */
export const quadNormal = (q: Quad): V3 =>
  normalise(cross(sub(q.corners[3], q.corners[0]), sub(q.corners[1], q.corners[0])));

/**
 * A box on the floor (y = 0), seen from negative z: front, back, left, right and top. The
 * bottom is left out: it sits on the table.
 */
export function box(size: number, cx = 0, cz = 0): Quad[] {
  const h = size / 2;
  const x0 = cx - h,
    x1 = cx + h,
    z0 = cz - h,
    z1 = cz + h,
    y1 = size;
  return [
    {
      name: 'front',
      corners: [
        [x0, 0, z0],
        [x1, 0, z0],
        [x1, y1, z0],
        [x0, y1, z0],
      ],
    },
    {
      name: 'right',
      corners: [
        [x1, 0, z0],
        [x1, 0, z1],
        [x1, y1, z1],
        [x1, y1, z0],
      ],
    },
    {
      name: 'back',
      corners: [
        [x1, 0, z1],
        [x0, 0, z1],
        [x0, y1, z1],
        [x1, y1, z1],
      ],
    },
    {
      name: 'left',
      corners: [
        [x0, 0, z1],
        [x0, 0, z0],
        [x0, y1, z0],
        [x0, y1, z1],
      ],
    },
    {
      name: 'top',
      corners: [
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
      ],
    },
  ];
}

/**
 * A simple building front, 4 m wide and 3 m high, facing negative z: the wall, a porch that
 * stands out 1 m (so it hides part of the wall from the audience and from the projector), and
 * a roof sloping back.
 */
export function buildingFront(): Quad[] {
  const px0 = -0.6,
    px1 = 0.6,
    py = 1.4,
    pz = -1;
  return [
    {
      name: 'wall',
      corners: [
        [-2, 0, 0],
        [2, 0, 0],
        [2, 3, 0],
        [-2, 3, 0],
      ],
    },
    {
      name: 'porch front',
      corners: [
        [px0, 0, pz],
        [px1, 0, pz],
        [px1, py, pz],
        [px0, py, pz],
      ],
    },
    {
      name: 'porch right',
      corners: [
        [px1, 0, pz],
        [px1, 0, 0],
        [px1, py, 0],
        [px1, py, pz],
      ],
    },
    {
      name: 'porch left',
      corners: [
        [px0, 0, 0],
        [px0, 0, pz],
        [px0, py, pz],
        [px0, py, 0],
      ],
    },
    {
      name: 'porch top',
      corners: [
        [px0, py, pz],
        [px1, py, pz],
        [px1, py, 0],
        [px0, py, 0],
      ],
    },
    {
      name: 'roof',
      corners: [
        [-2, 3, 0],
        [2, 3, 0],
        [2, 3.6, 0.9],
        [-2, 3.6, 0.9],
      ],
    },
  ];
}

/** Where a quad sits in the texture: [u0, v0, u1, v1], all in 0–1. */
export type Rect = readonly [number, number, number, number];

/**
 * Packs every quad into the 0–1 square in rows ("shelves"), tallest first, all at one scale,
 * so texture space is in proportion to real size. Each face keeps `pad` metres of empty
 * texture around it, so that filtering doesn't bleed one face into the next.
 */
export function packAtlas(quads: readonly Quad[], pad = 0.05): { rects: Rect[]; scale: number } {
  const sizes = quads.map((q) => {
    const { w, h } = quadSize(q);
    return { w: w + 2 * pad, h: h + 2 * pad };
  });
  const area = sizes.reduce((s, { w, h }) => s + w * h, 0);
  const widest = Math.max(...sizes.map((s) => s.w));
  const order = sizes.map((_, i) => i).sort((a, b) => sizes[b]!.h - sizes[a]!.h);
  // Try shelf widths from narrow to wide, keeping the layout with the most texture per metre.
  let best: { rects: Rect[]; scale: number } | undefined;
  for (let k = 0; k <= 40; k++) {
    const shelf = Math.max(widest, Math.sqrt(area) * (0.8 + k * 0.05));
    const placed: [number, number][] = new Array(quads.length);
    let x = 0;
    let y = 0;
    let rowH = 0;
    let usedW = 0;
    for (const i of order) {
      const { w, h } = sizes[i]!;
      if (x > 0 && x + w > shelf) {
        x = 0;
        y += rowH;
        rowH = 0;
      }
      placed[i] = [x, y];
      x += w;
      usedW = Math.max(usedW, x);
      rowH = Math.max(rowH, h);
    }
    const scale = 1 / Math.max(usedW, y + rowH);
    if (best && scale <= best.scale) continue;
    const rects = placed.map(([px, py], i): Rect => {
      const { w, h } = sizes[i]!;
      return [
        (px + pad) * scale,
        (py + pad) * scale,
        (px + w - pad) * scale,
        (py + h - pad) * scale,
      ];
    });
    best = { rects, scale };
  }
  return best!;
}

/** Plain arrays for a Babylon.js mesh: two triangles per quad, flat normals, atlas UVs. */
export function meshArrays(quads: readonly Quad[], rects: readonly Rect[]) {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  quads.forEach((q, i) => {
    const [u0, v0, u1, v1] = rects[i]!;
    const n = quadNormal(q);
    const corner: [number, number][] = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    const base = positions.length / 3;
    q.corners.forEach((c, k) => {
      positions.push(...c);
      normals.push(...n);
      uvs.push(...corner[k]!);
    });
    // Babylon.js draws clockwise triangles as front faces (left-handed).
    indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  });
  return { positions, normals, uvs, indices };
}

/** Do any two rectangles overlap? (Touching edges don't count.) */
export function overlaps(rects: readonly Rect[]): boolean {
  for (let i = 0; i < rects.length; i++)
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i]!,
        b = rects[j]!;
      if (a[0] < b[2] - 1e-9 && b[0] < a[2] - 1e-9 && a[1] < b[3] - 1e-9 && b[1] < a[3] - 1e-9)
        return true;
    }
  return false;
}
