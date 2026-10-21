/// <reference lib="webworker" />
/**
 * Spike 1.4: the runtime worker. It runs the scheduler and posts stage commands to the main
 * thread. Live mode is paced by the wall clock and runs a little ahead (the lookahead), so
 * commands arrive before they are due; fixed-step mode just computes the timeline.
 */
import { SAMPLE } from './program.ts';
import { Scheduler, toUs, type Command } from './scheduler.ts';

export type ToWorker =
  | { type: 'live'; t0: number; lookahead: number; seconds: number }
  | { type: 'timeline'; seconds: number };

export type FromWorker =
  | { type: 'ready' }
  | { type: 'commands'; commands: Command[]; sentAt: number; done: boolean }
  | { type: 'timeline'; commands: Command[]; computeMs: number };

const wall = () => performance.timeOrigin + performance.now();
const post = (m: FromWorker) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

// Tell the main thread the worker has loaded, so it can start the clock (the first run of the
// spike started the clock before the worker existed, and its first command was late).
post({ type: 'ready' });

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'timeline') {
    const started = performance.now();
    const s = new Scheduler(SAMPLE);
    s.runUntil(toUs(msg.seconds));
    post({ type: 'timeline', commands: s.commands, computeMs: performance.now() - started });
    return;
  }
  const s = new Scheduler(SAMPLE);
  let sent = 0;
  const tick = () => {
    const virtual = toUs((wall() - msg.t0) / 1000 + msg.lookahead);
    s.runUntil(Math.min(virtual, toUs(msg.seconds)));
    const done = s.now >= toUs(msg.seconds);
    if (s.commands.length > sent || done) {
      post({ type: 'commands', commands: s.commands.slice(sent), sentAt: wall(), done });
      sent = s.commands.length;
    }
    if (done) clearInterval(timer);
  };
  const timer = setInterval(tick, 10);
  tick();
};
