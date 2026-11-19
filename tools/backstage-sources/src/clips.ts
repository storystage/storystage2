/**
 * A shipped model's standard clips (spec 17, section 3; agreed with S3, 18 Nov 2026): a source-list
 * item's `clips` names which of the model's own animations are its `idle`, `walk`, `run`, `jump`,
 * `fly` and `swim`, or which stretch of one long track is, as some packs bake every action onto
 * one. The build renames them to those names, drops every other animation, and makes each play in
 * place: the stage moves the object itself, so any forward drift of the skeleton's root is taken
 * out, leaving its sway and bob.
 */
import type { Animation, AnimationChannel, Document, Node } from '@gltf-transform/core';

/** The clip names the stage looks for on a shipped model (spec 17, section 3). */
export const STANDARD_CLIPS = ['idle', 'walk', 'run', 'jump', 'fly', 'swim'] as const;
export type StandardClip = (typeof STANDARD_CLIPS)[number];

/** One clip: a whole animation by its name, or the stretch of one from `start` to `end` seconds. */
export type ClipSource =
  string | { readonly clip: string; readonly start: number; readonly end: number };
export type Clips = Readonly<Partial<Record<StandardClip, ClipSource>>>;

/** What is wrong with an item's `clips`, or null. */
export function clipsProblem(clips: unknown): string | null {
  if (typeof clips !== 'object' || clips === null || Array.isArray(clips))
    return "clips must map standard clip names to the model's own animations.";
  const entries = Object.entries(clips);
  if (entries.length === 0) return 'clips must name at least one clip.';
  for (const [name, source] of entries) {
    if (!(STANDARD_CLIPS as readonly string[]).includes(name))
      return `clips: "${name}" is not one of ${STANDARD_CLIPS.join(', ')}.`;
    if (typeof source === 'string') {
      if (!source.trim()) return `clips: ${name} names no animation.`;
      continue;
    }
    const s = source as { clip?: unknown; start?: unknown; end?: unknown };
    if (
      typeof source !== 'object' ||
      source === null ||
      typeof s.clip !== 'string' ||
      !s.clip.trim() ||
      typeof s.start !== 'number' ||
      typeof s.end !== 'number' ||
      !(s.start >= 0) ||
      !(s.end > s.start)
    )
      return `clips: ${name} must be an animation's name, or { clip, start, end } in seconds with end after start.`;
  }
  return null;
}

/**
 * Gives the model its standard clips: each one copied from its source (the whole animation, or a
 * stretch of it moved to start at 0), named, and made to play in place; then every other animation
 * is removed. Throws when a named animation isn't there exactly once, or a stretch holds no keys.
 */
export function standardClips(doc: Document, clips: Clips): void {
  const root = doc.getRoot();
  const original = root.listAnimations();
  const byName = (name: string): Animation => {
    const found = original.filter((a) => a.getName() === name);
    if (found.length !== 1)
      throw new Error(`clips: the model has ${found.length} animations called "${name}", not one.`);
    return found[0]!;
  };
  const parentOf = new Map<Node, Node>();
  for (const node of root.listNodes())
    for (const child of node.listChildren()) parentOf.set(child, node);
  const rootChain = rootNodes(doc, parentOf);
  for (const name of STANDARD_CLIPS) {
    const source = clips[name];
    if (source === undefined) continue;
    const from = byName(typeof source === 'string' ? source : source.clip);
    const span = typeof source === 'string' ? null : { start: source.start, end: source.end };
    const clip = doc.createAnimation(name);
    for (const channel of from.listChannels()) copyChannel(doc, clip, channel, span);
    if (clip.listChannels().length === 0)
      throw new Error(`clips: ${name} has no keys in the stretch it names.`);
    for (const channel of clip.listChannels())
      if (channel.getTargetPath() === 'translation' && rootChain.has(channel.getTargetNode()!))
        removeDrift(channel, parentOf.get(channel.getTargetNode()!));
  }
  for (const animation of original) {
    for (const channel of animation.listChannels()) channel.getSampler()?.dispose();
    animation.dispose();
  }
}

/**
 * The nodes whose movement carries the whole skeleton: each skin's top joints (those whose parent
 * isn't one of its joints) and every node above them.
 */
function rootNodes(doc: Document, parentOf: ReadonlyMap<Node, Node>): Set<Node> {
  const roots = new Set<Node>();
  for (const skin of doc.getRoot().listSkins()) {
    const joints = new Set(skin.listJoints());
    for (const joint of joints) {
      if (joints.has(parentOf.get(joint)!)) continue;
      for (let n: Node | undefined = joint; n; n = parentOf.get(n)) roots.add(n);
    }
  }
  return roots;
}

function copyChannel(
  doc: Document,
  clip: Animation,
  channel: AnimationChannel,
  span: { start: number; end: number } | null,
): void {
  const sampler = channel.getSampler();
  const node = channel.getTargetNode();
  const path = channel.getTargetPath();
  if (!sampler || !node || !path) return;
  const input = sampler.getInput()!.getArray()!;
  const output = sampler.getOutput()!.getArray()!;
  const interpolation = sampler.getInterpolation();
  const width = output.length / input.length / (interpolation === 'CUBICSPLINE' ? 3 : 1);
  const per = interpolation === 'CUBICSPLINE' ? width * 3 : width;
  let times: number[] = [];
  let values: number[] = [];
  if (!span) {
    times = Array.from(input);
    values = Array.from(output);
  } else {
    if (interpolation === 'CUBICSPLINE')
      throw new Error('clips: a stretch of a CUBICSPLINE track is not supported.');
    const at = (t: number): number[] => sample(input, output, width, interpolation, t);
    times.push(0);
    values.push(...at(span.start));
    for (let i = 0; i < input.length; i++) {
      const t = input[i]!;
      if (t <= span.start + 1e-6 || t >= span.end - 1e-6) continue;
      times.push(t - span.start);
      values.push(...Array.from(output.subarray(i * per, (i + 1) * per)));
    }
    if (span.start < input[input.length - 1]! && span.end > input[0]!) {
      times.push(span.end - span.start);
      values.push(...at(span.end));
    } else return;
  }
  const inputAccessor = doc.createAccessor().setType('SCALAR').setArray(new Float32Array(times));
  const outputAccessor = doc
    .createAccessor()
    .setType(sampler.getOutput()!.getType())
    .setArray(new Float32Array(values));
  const copy = doc
    .createAnimationSampler()
    .setInput(inputAccessor)
    .setOutput(outputAccessor)
    .setInterpolation(interpolation);
  clip.addSampler(copy);
  clip.addChannel(
    doc.createAnimationChannel().setSampler(copy).setTargetNode(node).setTargetPath(path),
  );
}

/** The value of a LINEAR or STEP track at time `t` (a quaternion is blended and made unit length). */
function sample(
  input: ArrayLike<number>,
  output: ArrayLike<number>,
  width: number,
  interpolation: string,
  t: number,
): number[] {
  const key = (i: number) => Array.from({ length: width }, (_, k) => output[i * width + k]!);
  if (t <= input[0]!) return key(0);
  const last = input.length - 1;
  if (t >= input[last]!) return key(last);
  let i = 0;
  while (input[i + 1]! < t) i++;
  if (interpolation === 'STEP') return key(i);
  const f = (t - input[i]!) / (input[i + 1]! - input[i]!);
  const a = key(i);
  const b = key(i + 1);
  if (width === 4) {
    const dot = a.reduce((s, v, k) => s + v * b[k]!, 0);
    const sign = dot < 0 ? -1 : 1;
    const q = a.map((v, k) => v * (1 - f) + sign * b[k]! * f);
    const len = Math.hypot(...q) || 1;
    return q.map((v) => v / len);
  }
  return a.map((v, k) => v + (b[k]! - v) * f);
}

/**
 * Takes a root translation track's forward drift out: its change across the ground from the
 * first key to the last, spread evenly over the clip. The ground is the world's x and z, so a
 * root under a turned armature (Blender's exports often stand one up with a quarter turn) loses
 * its drift along the right axes. Sway and bob, which come back where they started, stay.
 */
function removeDrift(channel: AnimationChannel, parent: Node | undefined): void {
  const sampler = channel.getSampler()!;
  const input = sampler.getInput()!.getArray()!;
  const output = sampler.getOutput()!;
  const cubic = sampler.getInterpolation() === 'CUBICSPLINE';
  const values = Float32Array.from(output.getArray()!);
  const n = input.length;
  if (n < 2) return;
  const per = cubic ? 9 : 3;
  const off = cubic ? 3 : 0;
  const d = [0, 1, 2].map((k) => values[(n - 1) * per + off + k]! - values[off + k]!);
  // The drift in the world (the parent's turn and scale, not its position), minus its height.
  const m = parent ? parent.getWorldMatrix() : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const toWorld = (v: number[]) =>
    [0, 1, 2].map((r) => m[r]! * v[0]! + m[4 + r]! * v[1]! + m[8 + r]! * v[2]!);
  const world = toWorld(d);
  const ground = [world[0]!, 0, world[2]!];
  if (Math.hypot(ground[0]!, ground[2]!) < 1e-6) return;
  const fix = solve3([m[0]!, m[1]!, m[2]!, m[4]!, m[5]!, m[6]!, m[8]!, m[9]!, m[10]!], ground);
  const t0 = input[0]!;
  const span = input[n - 1]! - t0;
  for (let i = 0; i < n; i++) {
    const f = (input[i]! - t0) / span;
    for (let k = 0; k < 3; k++) {
      const at = i * per + off + k;
      values[at] = values[at]! - fix[k]! * f;
      // A cubic key's tangents (in, then out) lose the drift's steady slope too.
      if (cubic) {
        values[i * per + k] = values[i * per + k]! - fix[k]! / span;
        values[i * per + 6 + k] = values[i * per + 6 + k]! - fix[k]! / span;
      }
    }
  }
  output.setArray(values);
}

/** Solves M·x = b for a 3×3 matrix given column by column. */
function solve3(c: number[], b: number[]): number[] {
  const [a, d, g, bb, e, h, cc, f, i] = c as [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const det = a * (e * i - f * h) - bb * (d * i - f * g) + cc * (d * h - e * g);
  if (Math.abs(det) < 1e-12) return [0, 0, 0];
  const inv = [
    (e * i - f * h) / det,
    -(bb * i - cc * h) / det,
    (bb * f - cc * e) / det,
    -(d * i - f * g) / det,
    (a * i - cc * g) / det,
    -(a * f - cc * d) / det,
    (d * h - e * g) / det,
    -(a * h - bb * g) / det,
    (a * e - bb * d) / det,
  ];
  return [0, 1, 2].map(
    (r) => inv[r * 3]! * b[0]! + inv[r * 3 + 1]! * b[1]! + inv[r * 3 + 2]! * b[2]!,
  );
}
