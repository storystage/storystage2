/**
 * Outlines of a coverage mask (marching squares), for a sketch's white fill. Every edge midpoint
 * is shared by exactly two segments, so the segments join into closed loops: outer edges and
 * holes alike, filled with the even-odd rule.
 */

export type Point = readonly [number, number];

// Edges of a cell: top, right, bottom, left. Each case lists pairs of edges to join.
const T = 0;
const R = 1;
const B = 2;
const L = 3;
const CASES: readonly (readonly [number, number])[][] = [
  [], // 0
  [[L, B]], // 1: bottom left
  [[B, R]], // 2: bottom right
  [[L, R]], // 3
  [[T, R]], // 4: top right
  [
    [T, R],
    [L, B],
  ], // 5: top right and bottom left, apart
  [[T, B]], // 6
  [[T, L]], // 7
  [[L, T]], // 8: top left
  [[T, B]], // 9
  [
    [L, T],
    [B, R],
  ], // 10: top left and bottom right, apart
  [[T, R]], // 11
  [[L, R]], // 12
  [[R, B]], // 13
  [[L, B]], // 14
  [], // 15
];

/**
 * Closed loops around the set pixels of a `width` × `height` mask, in pixel units where pixel
 * (x, y) covers x..x+1 and y..y+1.
 */
export function contours(mask: Uint8Array, width: number, height: number): Point[][] {
  // A copy with a clear border one pixel wide, so every loop closes and no lookup needs a check.
  const pw = width + 2;
  const padded = new Uint8Array(pw * (height + 2));
  for (let y = 0; y < height; y++)
    padded.set(mask.subarray(y * width, (y + 1) * width), (y + 1) * pw + 1);
  // Edge midpoints in doubled corner coordinates, so keys are exact integers.
  const mid = (x: number, y: number, edge: number): [number, number] => {
    switch (edge) {
      case T:
        return [2 * x + 1, 2 * y];
      case R:
        return [2 * x + 2, 2 * y + 1];
      case B:
        return [2 * x + 1, 2 * y + 2];
      default:
        return [2 * x, 2 * y + 1];
    }
  };
  const segments: [number, number, number, number][] = [];
  for (let y = -1; y < height; y++) {
    const top = (y + 1) * pw;
    const bottom = top + pw;
    for (let x = -1; x < width; x++) {
      const i = x + 1;
      const c =
        (padded[top + i]! << 3) |
        (padded[top + i + 1]! << 2) |
        (padded[bottom + i + 1]! << 1) |
        padded[bottom + i]!;
      if (c === 0 || c === 15) continue;
      for (const [a, b] of CASES[c]!) segments.push([...mid(x, y, a), ...mid(x, y, b)]);
    }
  }
  const key = (x: number, y: number) => y * (2 * width + 8) + x + 4 * (2 * width + 8) + 4;
  const ends = new Map<number, number[]>();
  segments.forEach(([x0, y0, x1, y1], i) => {
    for (const k of [key(x0, y0), key(x1, y1)]) {
      const list = ends.get(k);
      if (list) list.push(i);
      else ends.set(k, [i]);
    }
  });
  const used = new Uint8Array(segments.length);
  const loops: Point[][] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const [sx, sy, ex, ey] = segments[start]!;
    const loop: [number, number][] = [[sx, sy]];
    let [cx, cy] = [ex, ey];
    for (;;) {
      loop.push([cx, cy]);
      const next = ends.get(key(cx, cy))!.find((i) => !used[i]);
      if (next === undefined) break;
      used[next] = 1;
      const [ax, ay, bx, by] = segments[next]!;
      [cx, cy] = ax === cx && ay === cy ? [bx, by] : [ax, ay];
    }
    // Corner coordinates are pixel centres: corner c sits at pixel c + 0.5.
    loops.push(loop.map(([x, y]) => [x / 2 + 0.5, y / 2 + 0.5]));
  }
  return loops;
}

/** Douglas-Peucker: drop points that stray less than `tolerance` from the line kept. */
export function simplify(points: readonly Point[], tolerance: number): Point[] {
  if (points.length < 3) return [...points];
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = points[a]!;
    const [bx, by] = points[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let worst = -1;
    let far = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = points[i]!;
      const d =
        len === 0
          ? Math.hypot(px - ax, py - ay)
          : Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
      if (d > far) {
        far = d;
        worst = i;
      }
    }
    if (worst >= 0 && far > tolerance) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}
