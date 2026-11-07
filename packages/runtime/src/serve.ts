/**
 * The worker's side of `messages.ts` (WP6.1, 6.4, 6.5): one run of one scene, paced by the wall
 * clock (live) or by `advance` (fixed). Its timers are passed in, so tests never wait.
 */
import { indexProgram, validateProgram, type NodeId, type TypeDecl } from '@storystage/ast';
import { MICROS_PER_SECOND, type Micros, type StageCommand } from '@storystage/story-api';
import { EventRouter } from './events.ts';
import { Interpreter } from './interpreter.ts';
import {
  RUNTIME_PROTOCOL,
  isToRuntime,
  type FromRuntime,
  type Port,
  type RunMode,
  type RuntimeError,
  type ToRuntime,
} from './messages.ts';
import { RuntimeFault, Scheduler } from './scheduler.ts';
import type { StoryLibrary } from './story.ts';

export interface Timers {
  /** Milliseconds on the clock the worker shares with the page. */
  now(): number;
  /** Calls `f` often. Returns a function that stops it. */
  every(f: () => void): () => void;
}

/** One frame at 60 fps: often enough to stay ahead of the clock. */
const TICK_MS = 16;

/** The real timers, in a worker or a page. */
export const REAL_TIMERS: Timers = {
  now: () => performance.timeOrigin + performance.now(),
  every: (f) => {
    const timer = setInterval(f, TICK_MS);
    return () => clearInterval(timer);
  },
};

interface Pace {
  t0: number;
  speed: number;
  readonly lookahead: Micros;
}

interface Loaded {
  readonly scheduler: Scheduler;
  readonly interpreter: Interpreter;
  readonly router: EventRouter;
  readonly entry: NodeId;
  readonly out: StageCommand[];
}

const fault = (code: RuntimeError['code'], detail: string): RuntimeError => ({
  code,
  node: null,
  at: 0,
  detail,
});

/** Runs one scene on `port`, until the worker is ended. */
export function serve(
  port: Port<FromRuntime, ToRuntime>,
  library: StoryLibrary,
  timers: Timers = REAL_TIMERS,
): void {
  let run: Loaded | null = null;
  let pace: Pace | null = null;
  let stopTicking: (() => void) | null = null;
  /** How far the run has been asked to go, in case a question interrupts it. */
  let target: Micros = 0;
  /** The question outstanding. */
  let asked: number | null = null;
  let nextAsk = 0;
  let finished = false;
  let entryDone = false;
  let highlighted = '[]';

  const post = (message: FromRuntime) => port.post(message);

  const halt = () => {
    stopTicking?.();
    stopTicking = null;
  };

  const flush = () => {
    if (!run) return;
    const commands = run.out.splice(0);
    if (commands.length > 0 || !pace)
      post({ type: 'commands', commands, until: run.scheduler.now, sentAt: timers.now() });
    const running = run.scheduler.running().sort();
    const shown = JSON.stringify(running);
    if (shown !== highlighted) {
      highlighted = shown;
      post({ type: 'highlight', running, at: run.scheduler.now });
    }
    if (entryDone && !finished) {
      finished = true;
      post({ type: 'finished', at: run.scheduler.now });
    }
  };

  const pump = () => {
    if (!run || asked !== null) return;
    const result = run.scheduler.runUntil(target);
    if (result.kind === 'asking') {
      asked = nextAsk++;
      post({ type: 'ask', id: asked, query: result.query });
      return;
    }
    if (!run.scheduler.stopped) flush();
  };

  const sceneTime = (p: Pace): Micros =>
    Math.round(((timers.now() - p.t0) * p.speed * MICROS_PER_SECOND) / 1000);

  const tick = () => {
    if (!pace) return;
    target = Math.max(target, sceneTime(pace) + pace.lookahead);
    pump();
  };

  const startTicking = () => {
    stopTicking = timers.every(tick);
    tick();
  };

  const load = (message: ToRuntime & { type: 'load' }) => {
    const problems = validateProgram(message.program);
    const owner = indexProgram(message.program).get(message.entry);
    if (problems.length > 0 || owner?.node.kind !== 'method' || owner.parent === null) {
      post({ type: 'error', error: fault('protocol', problems[0]?.message ?? 'No such method.') });
      return;
    }
    const scheduler = new Scheduler({
      onFault: (f: RuntimeFault) => {
        halt();
        flush();
        post({
          type: 'error',
          error: {
            code: f.code,
            node: f.node,
            at: scheduler.now,
            ...(f.stageCode === undefined ? {} : { stageCode: f.stageCode }),
            ...(f.detail === undefined ? {} : { detail: f.detail }),
          },
        });
      },
    });
    const out: StageCommand[] = [];
    const interpreter = new Interpreter(message.program, {
      scheduler,
      library,
      emit: (command) => out.push(command),
      disabled: message.disabled,
      seed: message.seed,
    });
    const type = indexProgram(message.program).get(owner.parent)!.node as TypeDecl;
    const router = new EventRouter(scheduler, interpreter, type);
    run = { scheduler, interpreter, router, entry: message.entry, out };
    post({ type: 'loaded' });
  };

  const start = (mode: RunMode) => {
    if (!run) {
      post({ type: 'error', error: fault('protocol', 'Nothing is loaded.') });
      return;
    }
    const { scheduler, interpreter, router, entry } = run;
    scheduler.spawn(
      (function* () {
        yield* router.arm();
        yield* interpreter.runMethod(entry);
        entryDone = true;
      })(),
    );
    if (mode.kind === 'live') {
      pace = { t0: mode.t0, speed: mode.speed, lookahead: mode.lookahead };
      startTicking();
    }
  };

  const handle = (message: ToRuntime) => {
    switch (message.type) {
      case 'load':
        load(message);
        break;
      case 'start':
        start(message.mode);
        break;
      case 'advance':
        target = message.until;
        pump();
        break;
      case 'pause':
        halt();
        break;
      case 'resume':
        if (pace) {
          pace.t0 = message.t0;
          startTicking();
        }
        break;
      case 'speed':
        if (pace) {
          pace.t0 = message.t0;
          pace.speed = message.speed;
        }
        break;
      case 'stop':
        halt();
        run?.scheduler.stop();
        post({ type: 'stopped' });
        break;
      case 'event':
        run?.router.fire(message.event);
        break;
      case 'answer':
        if (!run || message.id !== asked) break;
        asked = null;
        if (message.result.kind === 'error')
          run.scheduler.refuse(new RuntimeFault('stage', null, undefined, message.result.code));
        else {
          run.scheduler.answer(message.result.value);
          pump();
        }
        break;
    }
  };

  port.listen((message) => {
    if (isToRuntime(message)) handle(message);
    else post({ type: 'error', error: fault('protocol', 'An unknown message.') });
  });
  post({ type: 'ready', protocol: RUNTIME_PROTOCOL });
}
