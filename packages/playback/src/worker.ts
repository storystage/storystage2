/**
 * Starting a real runtime worker for `Playback` (WP6.1). Pass `port` and `terminate` to its
 * options; disposing of the driver then ends the worker.
 */
import {
  messagePort,
  type FromRuntime,
  type MessageEnd,
  type Port,
  type ToRuntime,
} from '@storystage/runtime';

export interface RuntimeWorker {
  readonly port: Port<ToRuntime, FromRuntime>;
  readonly terminate: () => void;
}

export function startRuntimeWorker(): RuntimeWorker {
  const worker = new Worker(new URL('./runtime-worker.ts', import.meta.url), { type: 'module' });
  return {
    port: messagePort<ToRuntime, FromRuntime>(worker as unknown as MessageEnd),
    terminate: () => worker.terminate(),
  };
}
