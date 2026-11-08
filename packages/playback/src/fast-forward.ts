/**
 * Running ahead without drawing (`docs/spec/08-export.md`, section 1): to a time, for the rough
 * cut's jumps, or to a block, for Rehearse's "Rehearse to here" (WP6.4).
 */
import type { NodeId } from '@storystage/ast';
import { micros, type Micros } from '@storystage/story-api';
import type { Playback } from './playback.ts';

export interface FastForwardOptions {
  /** One step's length. Default a frame at 30 frames a second. */
  readonly step?: Micros;
  /** How far to go at most, looking for a block. Default 10 minutes (the export's cap). */
  readonly limit?: Micros;
}

export interface FastForwarded {
  /** The film time it stopped at. */
  readonly at: Micros;
  /** For a block: whether it ran. For a time: whether play got there before it ended. */
  readonly reached: boolean;
}

/**
 * Plays `playback` in fixed steps from film time `from` until film time `to`, or until block
 * `to.node` is running, without drawing. Carry on live from `at` afterwards.
 */
export async function fastForward(
  playback: Playback,
  from: Micros,
  to: Micros | { readonly node: NodeId },
  options: FastForwardOptions = {},
): Promise<FastForwarded> {
  const step = options.step ?? micros(1 / 30);
  const limit = typeof to === 'number' ? to : from + (options.limit ?? micros(600));
  /** The film time the block starts at: the runtime runs ahead, so the picture gets there later. */
  let seen: Micros | null = null;
  const stop =
    typeof to === 'number'
      ? () => undefined
      : playback.on((event) => {
          if (seen === null && event.kind === 'running' && event.nodes.includes(to.node))
            seen = event.at;
        });
  let t = from;
  try {
    while ((seen === null || t < seen) && !playback.ended() && t < limit) {
      t = Math.min(t + step, limit);
      await playback.frame(t);
    }
  } finally {
    stop();
  }
  return {
    at: t,
    reached: typeof to === 'number' ? t >= limit && !playback.ended() : seen !== null && t >= seen,
  };
}
