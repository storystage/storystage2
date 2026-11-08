/**
 * Humanoid clips kept small: each frame's turns and hips as whole numbers, in base64. A turn's
 * parts are stored to 1/32767, which is under a hundredth of a degree, and the hips to a
 * ten-thousandth of their height.
 */
import type { JointName, Quat } from '@storystage/story-api';
import { v } from '../math.ts';
import type { HumanClip, HumanPose } from './pose.ts';

export interface PackedClip {
  readonly name: string;
  readonly fps: number;
  readonly frames: number;
  readonly loop: boolean;
  readonly speed?: number;
  /** The bones it turns. Each frame has four numbers for each, then three for the hips. */
  readonly joints: readonly string[];
  readonly data: string;
}

const TURN = 32767;
const HIPS = 10000;

const clamp = (n: number) => Math.max(-32768, Math.min(32767, Math.round(n)));

function toBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}

function fromBase64(text: string): Uint8Array {
  const raw = atob(text);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Packs poses taken `1 / fps` seconds apart, the first at 0 and the last at the clip's end. */
export function pack(
  name: string,
  fps: number,
  poses: readonly HumanPose[],
  { loop = false, speed }: { loop?: boolean; speed?: number } = {},
): PackedClip {
  const joints = [...new Set(poses.flatMap((p) => [...p.turns.keys()]))];
  const per = joints.length * 4 + 3;
  const view = new DataView(new ArrayBuffer(poses.length * per * 2));
  let at = 0;
  const put = (n: number) => {
    view.setInt16(at, clamp(n), true);
    at += 2;
  };
  for (const pose of poses) {
    for (const joint of joints) {
      const q = pose.turns.get(joint) ?? { x: 0, y: 0, z: 0, w: 1 };
      // Keep w positive, so a turn and its neighbours are on the same side.
      const k = q.w < 0 ? -TURN : TURN;
      put(q.x * k);
      put(q.y * k);
      put(q.z * k);
      put(q.w * k);
    }
    put(pose.hips.x * HIPS);
    put(pose.hips.y * HIPS);
    put(pose.hips.z * HIPS);
  }
  return {
    name,
    fps,
    frames: poses.length,
    loop,
    ...(speed === undefined ? {} : { speed }),
    joints,
    data: toBase64(new Uint8Array(view.buffer)),
  };
}

export function unpack(packed: PackedClip): HumanClip {
  const bytes = fromBase64(packed.data);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const get = () => {
    const n = view.getInt16(at, true);
    at += 2;
    return n;
  };
  const keys = [];
  for (let f = 0; f < packed.frames; f++) {
    const turns = new Map<JointName, Quat>();
    for (const joint of packed.joints) {
      const q = { x: get() / TURN, y: get() / TURN, z: get() / TURN, w: get() / TURN };
      const n = Math.hypot(q.x, q.y, q.z, q.w);
      turns.set(joint as JointName, { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n });
    }
    const hips = v(get() / HIPS, get() / HIPS, get() / HIPS);
    keys.push({ time: f / packed.fps, pose: { turns, hips } });
  }
  return {
    name: packed.name,
    duration: (packed.frames - 1) / packed.fps,
    keys,
    loop: packed.loop,
    ...(packed.speed === undefined ? {} : { speed: packed.speed }),
  };
}
