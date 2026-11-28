/**
 * A Web Audio context for tests: it plays nothing, but keeps what was scheduled, so a test can ask
 * a gain's level at a time, and when each source started and stopped. Set `currentTime` to move on.
 */
import type { AudioContextLike, AudioParamLike, BufferLike } from './out.ts';

type Event = { readonly kind: 'set' | 'ramp'; readonly value: number; readonly time: number };

export class FakeParam implements AudioParamLike {
  #value: number;
  events: Event[] = [];

  constructor(value: number) {
    this.#value = value;
  }

  get value(): number {
    return this.#value;
  }

  set value(v: number) {
    this.#value = v;
    this.events = [];
  }

  setValueAtTime(value: number, time: number): void {
    this.#add({ kind: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.#add({ kind: 'ramp', value, time });
  }

  cancelScheduledValues(time: number): void {
    this.events = this.events.filter((e) => e.time < time);
  }

  /** The value at context time `t`, as Web Audio's automation gives it. */
  at(t: number): number {
    let value = this.#value;
    let time = -Infinity;
    for (const e of this.events) {
      if (e.time <= t) {
        value = e.value;
        time = e.time;
        continue;
      }
      if (e.kind === 'ramp') {
        const from = Number.isFinite(time) ? time : t;
        return value + ((e.value - value) * (t - from)) / (e.time - from);
      }
      break;
    }
    return value;
  }

  #add(e: Event): void {
    const i = this.events.findIndex((x) => x.time > e.time);
    if (i === -1) this.events.push(e);
    else this.events.splice(i, 0, e);
  }
}

export class FakeGain {
  readonly gain = new FakeParam(1);
  destination: unknown = null;

  connect(destination: unknown): void {
    this.destination = destination;
  }

  disconnect(): void {
    this.destination = null;
  }
}

export class FakeSource {
  buffer: unknown = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly playbackRate = new FakeParam(1);
  onended: (() => void) | null = null;
  destination: unknown = null;
  started: { readonly when: number; readonly offset: number } | null = null;
  /** Each `stop`'s time: the last is the one that counts. */
  readonly stops: number[] = [];

  connect(destination: unknown): void {
    this.destination = destination;
  }

  disconnect(): void {
    this.destination = null;
  }

  start(when = 0, offset = 0): void {
    this.started = { when, offset };
  }

  stop(when = 0): void {
    this.stops.push(when);
  }

  /** When it stops, or `Infinity` while nothing stops it. */
  get stopsAt(): number {
    return this.stops.at(-1) ?? Infinity;
  }
}

export class FakeAudioContext implements AudioContextLike {
  readonly destination = { kind: 'speakers' };
  state = 'running';
  currentTime = 0;
  closed = false;
  readonly gains: FakeGain[] = [];
  readonly sources: FakeSource[] = [];

  resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }

  createGain(): FakeGain {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }

  createBuffer(): { copyToChannel(): void } {
    return { copyToChannel: () => undefined };
  }

  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }

  /** Any bytes but none read as a second of sound for each byte; none won't read. */
  decodeAudioData(data: ArrayBuffer): Promise<BufferLike> {
    return data.byteLength === 0
      ? Promise.reject(new Error('Not a sound.'))
      : Promise.resolve({ duration: data.byteLength });
  }
}
