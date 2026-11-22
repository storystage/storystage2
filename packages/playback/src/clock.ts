/**
 * Time for live play (`docs/spec/08-export.md`, section 1): the film's time from the wall clock,
 * with pause and speed (WP6.4). The page calls `Playback.frame(clock.time())` every frame.
 */
import { micros, type Micros } from '@storystage/story-api';

/** The speeds Rehearse offers (07-ux section 7.4). */
export const SPEEDS = [0.5, 1, 2] as const;

export class LiveClock {
  private readonly wall: () => number;
  /** The film time when the clock last started or changed speed. */
  private base: Micros = 0;
  /** The wall time then, in milliseconds. */
  private since: number;
  private rate = 1;
  private running = false;

  /** `wall` gives milliseconds: `performance.now()` unless a test gives another. */
  constructor(wall: () => number = () => performance.now()) {
    this.wall = wall;
    this.since = wall();
  }

  /** The film's time now. */
  time(): Micros {
    if (!this.running) return this.base;
    return this.base + micros(((this.wall() - this.since) * this.rate) / 1000);
  }

  get paused(): boolean {
    return !this.running;
  }

  get speed(): number {
    return this.rate;
  }

  play(): void {
    if (this.running) return;
    this.since = this.wall();
    this.running = true;
  }

  pause(): void {
    if (!this.running) return;
    this.base = this.time();
    this.running = false;
  }

  /** Changes speed from now on; the film doesn't jump. */
  setSpeed(speed: number): void {
    if (!(speed > 0)) throw new RangeError('A speed is above 0.');
    this.base = this.time();
    this.since = this.wall();
    this.rate = speed;
  }

  /** Carries on from film time `t`: after a restart, or a fast-forward. */
  setTime(t: Micros): void {
    this.base = t;
    this.since = this.wall();
  }
}
