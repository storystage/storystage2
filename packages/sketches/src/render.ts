/**
 * The sketch renderer (WP10.5; `docs/spec/17-backstage.md`, section 7): a model as a black line
 * drawing on a white silhouette, like a storyboard artist's sketch.
 *
 * It runs on the CPU in plain TypeScript, with no GPU or browser API (owner's choice, 25 Oct
 * 2026), so it gives the same sketch everywhere and runs in Node for `tools/make-sketches` and in
 * a Web Worker for imports (3.11). Steps:
 * 1. project the model orthographically for the facing, scaled to fit;
 * 2. draw every triangle into a depth buffer (at twice the sketch's resolution);
 * 3. find the edges worth drawing: open edges, silhouettes (between a face turned towards the
 *    viewer and one turned away) and creases (a fold sharper than `creaseDegrees`);
 * 4. keep the parts of those edges the depth buffer says are in front, as vector lines;
 * 5. trace the covered area as the white fill, so a sketch hides what is behind it on a frame.
 */
import type { Facing } from '@storystage/backstage';
import { contours, simplify, type Point } from './contour.ts';
import { cross, dot, length, normalize, sub, type Vec3 } from './math.ts';
import { weld, type SketchMesh } from './mesh.ts';

export interface View {
  /** Into the picture, from the viewer. */
  readonly forward: Vec3;
  /** The picture's right. */
  readonly right: Vec3;
  readonly up: Vec3;
}

const UP: Vec3 = [0, 1, 0];
const view = (forward: Vec3): View => {
  const f = normalize(forward);
  return { forward: f, right: normalize(cross(f, UP)), up: UP };
};

/**
 * Where the viewer stands for each facing. The model faces +Z. Front looks at its face; side
 * looks at its left (+X), so it faces the sketch's left; three-quarter is halfway between. A
 * placed sketch's `flipped` turns it to face right.
 */
const VIEWS: Readonly<Record<Facing, View>> = {
  front: view([0, 0, -1]),
  threeQuarter: view([-Math.SQRT1_2, 0, -Math.SQRT1_2]),
  side: view([-1, 0, 0]),
  back: view([0, 0, 1]),
};

export const viewOf = (facing: Facing): View => VIEWS[facing];

export interface SketchOptions {
  /** The longer side of the sketch, in SVG units. Default 320. */
  readonly size?: number;
  /** The sharpest fold, in degrees, that is drawn as a line. Default 45. */
  readonly creaseDegrees?: number;
  /** The model's Backstage id, written into the SVG. */
  readonly id?: string;
  /** Words for screen readers: "Cat, side". */
  readonly title?: string;
  readonly pose?: string | null;
}

export interface SketchMetrics {
  /** Share of the sketch's area the model covers, 0 to 1. */
  readonly fillRatio: number;
  /** Length of the outer and silhouette lines, in SVG units. */
  readonly outlineLength: number;
  /** Length of the inner lines, in SVG units. */
  readonly detailLength: number;
  /** Number of separate lines drawn. */
  readonly lines: number;
}

export interface Sketch {
  readonly svg: string;
  readonly width: number;
  readonly height: number;
  readonly metrics: SketchMetrics;
}

const MARGIN = 4;
/** Depth-buffer pixels per SVG unit. */
const RS = 2;
const OUTLINE_WIDTH = 3;
const DETAIL_WIDTH = 1.5;
/** Hidden gaps in a line up to this long (SVG units) are closed; visible bits shorter than SPECK go. */
const GAP = 3;
const SPECK = 1.5;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

type Segment = [number, number, number, number];

export function renderSketch(
  mesh: SketchMesh,
  facing: Facing,
  options: SketchOptions = {},
): Sketch {
  const size = options.size ?? 320;
  const cosCrease = Math.cos(((options.creaseDegrees ?? 45) * Math.PI) / 180);
  const { forward, right, up } = VIEWS[facing];
  const pos = mesh.positions;
  const nv = pos.length / 3;

  // 1. Project: u right, v up, d depth (larger is further away).
  const u = new Float64Array(nv);
  const v = new Float64Array(nv);
  const d = new Float64Array(nv);
  let [umin, umax, vmin, vmax] = [Infinity, -Infinity, Infinity, -Infinity];
  let [lo, hi]: [Vec3, Vec3] = [
    [Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, -Infinity],
  ];
  const used = new Uint8Array(nv);
  for (const i of mesh.indices) used[i] = 1;
  for (let i = 0; i < nv; i++) {
    const p: Vec3 = [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
    u[i] = dot(p, right);
    v[i] = dot(p, up);
    d[i] = dot(p, forward);
    if (!used[i]) continue;
    umin = Math.min(umin, u[i]!);
    umax = Math.max(umax, u[i]!);
    vmin = Math.min(vmin, v[i]!);
    vmax = Math.max(vmax, v[i]!);
    lo = [Math.min(lo[0], p[0]), Math.min(lo[1], p[1]), Math.min(lo[2], p[2])];
    hi = [Math.max(hi[0], p[0]), Math.max(hi[1], p[1]), Math.max(hi[2], p[2])];
  }
  if (umin > umax) [umin, umax, vmin, vmax, lo, hi] = [0, 1, 0, 1, [0, 0, 0], [1, 1, 1]];
  const span = Math.max(umax - umin, vmax - vmin) || 1;
  const scale = (size - 2 * MARGIN) / span;
  const width = Math.ceil((umax - umin) * scale + 2 * MARGIN);
  const height = Math.ceil((vmax - vmin) * scale + 2 * MARGIN);
  // Screen position in SVG units, y down.
  const sx = (i: number) => MARGIN + (u[i]! - umin) * scale;
  const sy = (i: number) => MARGIN + (vmax - v[i]!) * scale;

  // 2. Depth buffer.
  const W = width * RS;
  const H = height * RS;
  const depth = new Float64Array(W * H).fill(Infinity);
  const tris = mesh.indices;
  for (let t = 0; t < tris.length; t += 3) {
    const [a, b, c] = [tris[t]!, tris[t + 1]!, tris[t + 2]!];
    const [x0, y0, x1, y1, x2, y2] = [a, b, c].flatMap((i) => [sx(i) * RS, sy(i) * RS]) as [
      number,
      number,
      number,
      number,
      number,
      number,
    ];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-12) continue;
    const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    // Barycentric weights are linear in x and y: step them instead of recomputing.
    const inv = 1 / area;
    const [da, db, dc] = [d[a]!, d[b]!, d[c]!];
    const w0dx = -(y2 - y1) * inv;
    const w1dx = -(y0 - y2) * inv;
    for (let py = minY; py <= maxY; py++) {
      const cy = py + 0.5;
      const cx = minX + 0.5;
      let w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * inv;
      let w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * inv;
      let k = py * W + minX;
      for (let px = minX; px <= maxX; px++, k++, w0 += w0dx, w1 += w1dx) {
        const w2 = 1 - w0 - w1;
        if (w0 < -1e-9 || w1 < -1e-9 || w2 < -1e-9) continue;
        const z = w0 * da + w1 * db + w2 * dc;
        if (z < depth[k]!) depth[k] = z;
      }
    }
  }

  // 3. Edges worth drawing, on corners joined across seams.
  const diag = length(sub(hi, lo)) || 1;
  const welded = weld(pos, tris, diag * 1e-5);
  const faces: { n: Vec3; front: boolean }[] = [];
  const edges = new Map<string, { a: number; b: number; faces: number[] }>();
  for (let t = 0; t < welded.length; t += 3) {
    const [a, b, c] = [welded[t]!, welded[t + 1]!, welded[t + 2]!];
    if (a === b || b === c || a === c) continue;
    const p = (i: number): Vec3 => [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!];
    const n = cross(sub(p(b), p(a)), sub(p(c), p(a)));
    if (length(n) < 1e-20) continue;
    const f = faces.length;
    faces.push({ n: normalize(n), front: dot(normalize(n), forward) < -1e-6 });
    for (const [x, y] of [
      [a, b],
      [b, c],
      [c, a],
    ] as const) {
      const k = x < y ? `${x},${y}` : `${y},${x}`;
      const e = edges.get(k);
      if (e) e.faces.push(f);
      else edges.set(k, { a: Math.min(x, y), b: Math.max(x, y), faces: [f] });
    }
  }

  // 4. Keep what is in front.
  const eps = Math.max(diag * 0.002, 1.5 / (scale * RS)) + 1.5 / scale;
  const outline: Segment[] = [];
  const detail: Segment[] = [];
  for (const { a, b, faces: fs } of edges.values()) {
    let kind: 'outline' | 'detail' | null = null;
    if (fs.length === 1) kind = 'outline';
    else if (fs.length === 2) {
      const [f, g] = [faces[fs[0]!]!, faces[fs[1]!]!];
      if (f.front !== g.front) kind = 'outline';
      else if (f.front && dot(f.n, g.n) < cosCrease) kind = 'detail';
    } else if (fs.some((i) => faces[i]!.front)) kind = 'detail';
    if (!kind) continue;
    const out = kind === 'outline' ? outline : detail;
    const [ax, ay, bx, by] = [sx(a), sy(a), sx(b), sy(b)];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * RS));
    const seen = new Uint8Array(steps + 2);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const px = Math.min(W - 1, Math.max(0, Math.floor((ax + (bx - ax) * t) * RS)));
      const py = Math.min(H - 1, Math.max(0, Math.floor((ay + (by - ay) * t) * RS)));
      const z = d[a]! + (d[b]! - d[a]!) * t;
      seen[s] = z <= depth[py * W + px]! + eps ? 1 : 0;
    }
    // Where parts meet at almost the same depth, visibility flickers: close short gaps and drop
    // specks, so lines don't come out dashed.
    tidyRuns(seen, steps + 1, GAP * RS, SPECK * RS);
    let runStart = -1;
    for (let s = 0; s <= steps + 1; s++) {
      const visible = seen[s] === 1;
      if (visible && runStart < 0) runStart = s;
      if (!visible && runStart >= 0) {
        const t0 = runStart / steps;
        const t1 = (s - 1) / steps;
        if (t1 > t0)
          out.push([
            ax + (bx - ax) * t0,
            ay + (by - ay) * t0,
            ax + (bx - ax) * t1,
            ay + (by - ay) * t1,
          ]);
        runStart = -1;
      }
    }
  }

  // 5. The white fill: the covered area's outline, holes included.
  const mask = new Uint8Array(W * H);
  let covered = 0;
  for (let k = 0; k < mask.length; k++)
    if (depth[k] !== Infinity) {
      mask[k] = 1;
      covered++;
    }
  const fillLoops = contours(mask, W, H)
    .map((loop) =>
      simplify(
        loop.map(([x, y]) => [x / RS, y / RS] as Point),
        0.5,
      ),
    )
    .filter((loop) => loop.length >= 4);

  const outlineLines = chain(outline);
  const detailLines = chain(detail);
  const lineLength = (segs: Segment[]) =>
    segs.reduce((sum, [x0, y0, x1, y1]) => sum + Math.hypot(x1 - x0, y1 - y0), 0);
  const metrics: SketchMetrics = {
    fillRatio: covered === 0 ? 0 : Math.round((covered / (W * H)) * 1000) / 1000,
    outlineLength: Math.round(lineLength(outline)),
    detailLength: Math.round(lineLength(detail)),
    lines: outlineLines.length + detailLines.length,
  };

  const polyD = (lines: Point[][], close: boolean) =>
    lines
      .map((pts) => 'M' + pts.map(([x, y]) => `${num(x)} ${num(y)}`).join('L') + (close ? 'Z' : ''))
      .join('');
  const attrs = [
    `data-facing="${facing}"`,
    options.id === undefined ? '' : `data-backstage-id="${esc(options.id)}"`,
    options.pose ? `data-pose="${esc(options.pose)}"` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const stroke = (w: number) =>
    `fill="none" stroke="#000" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ${attrs}>` +
    (options.title ? `<title>${esc(options.title)}</title>` : '') +
    `<path class="fill" d="${polyD(fillLoops, true)}" fill="#fff" fill-rule="evenodd"/>` +
    `<path class="detail" d="${polyD(detailLines, false)}" ${stroke(DETAIL_WIDTH)}/>` +
    `<path class="outline" d="${polyD(outlineLines, false)}" ${stroke(OUTLINE_WIDTH)}/>` +
    '</svg>';
  return { svg, width, height, metrics };
}

/**
 * In a row of visible (1) and hidden (0) samples, fills hidden runs up to `gap` long that have
 * visible samples on both sides, then hides visible runs shorter than `speck`.
 */
function tidyRuns(seen: Uint8Array, n: number, gap: number, speck: number) {
  const runs = (value: number, fn: (start: number, end: number) => void) => {
    let start = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && seen[i] === value;
      if (on && start < 0) start = i;
      if (!on && start >= 0) {
        fn(start, i);
        start = -1;
      }
    }
  };
  runs(0, (s, e) => {
    if (s > 0 && e < n && e - s <= gap) seen.fill(1, s, e);
  });
  runs(1, (s, e) => {
    if (e - s < speck) seen.fill(0, s, e);
  });
}

/** Joins segments that meet end to end into longer lines, then drops needless points. */
function chain(segments: readonly Segment[]): Point[][] {
  const key = (x: number, y: number) => `${Math.round(x * 20)},${Math.round(y * 20)}`;
  const at = new Map<string, number[]>();
  segments.forEach(([x0, y0, x1, y1], i) => {
    for (const k of [key(x0, y0), key(x1, y1)]) {
      const list = at.get(k);
      if (list) list.push(i);
      else at.set(k, [i]);
    }
  });
  const used = new Uint8Array(segments.length);
  const lines: Point[][] = [];
  const extend = (line: Point[], fromEnd: boolean) => {
    for (;;) {
      const [x, y] = fromEnd ? line[line.length - 1]! : line[0]!;
      const next = at.get(key(x, y))!.find((i) => !used[i]);
      if (next === undefined) return;
      used[next] = 1;
      const [ax, ay, bx, by] = segments[next]!;
      const p: Point = key(ax, ay) === key(x, y) ? [bx, by] : [ax, ay];
      if (fromEnd) line.push(p);
      else line.unshift(p);
    }
  };
  segments.forEach(([x0, y0, x1, y1], i) => {
    if (used[i]) return;
    used[i] = 1;
    const line: Point[] = [
      [x0, y0],
      [x1, y1],
    ];
    extend(line, true);
    extend(line, false);
    lines.push(simplify(line, 0.3));
  });
  return lines;
}
