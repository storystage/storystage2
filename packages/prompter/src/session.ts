/**
 * One conversation with the Prompter, and the tool loop (`docs/spec/04-prompter.md` sections
 * 1.5 to 1.7, WP13.2).
 *
 * The history is append-only: `system` and `tools` never change, and earlier turns are never
 * edited, because each thinking block is bound to everything before it. The one thing taken back
 * is what a request added after the last reply kept, when that request kept no reply (a refusal,
 * an error, Stop): nothing after the last kept reply is bound, so this edits nothing that matters.
 */
import { learnerTurn, safeJson } from './data.ts';
import { modesAt, toolAllowed, type PrompterLevel } from './levels.ts';
import { buildRequest } from './request.ts';
import { ReplyAssembler, echoContent } from './stream.ts';
import { modeMessage } from './system-prompt.ts';
import { CHANGE_TOOLS, TOOL_NAMES, type ToolName } from './tool-names.ts';
import { checkToolInput, toolResult, type ToolOutcome } from './tools.ts';
import type {
  Json,
  JsonObject,
  PrompterMode,
  PrompterTransport,
  TransportErrorCode,
} from './transport.ts';

/** Tool calls in one learner request (spec 04, section 1.6). */
export const MAX_TOOL_CALLS = 25;
/** The same step failing this many times ends the request. */
export const MAX_STEP_FAILURES = 3;
/** Input tokens past which the next request starts a fresh conversation (section 1.5). */
export const CONVERSATION_LIMIT = 100_000;

/** Runs the tools. The real one (WP13b) works through the program's edit operations. */
export interface ToolRunner {
  /** Before the first call of a learner request: everything until `end` is one undo step. */
  begin?(request: string): void;
  run(name: ToolName, input: JsonObject): Promise<ToolOutcome> | ToolOutcome;
  /** When the request ends, however it ends. */
  end?(): void;
}

export type SessionEvent =
  /** Reply text as it streams. */
  | { readonly type: 'text'; readonly text: string }
  /** A change landed: its narration, for the caption and the narration queue (spec 06, 3.1). */
  | { readonly type: 'narration'; readonly text: string; readonly step?: number }
  /** An `explain` call: text for the panel, and to read aloud. */
  | { readonly type: 'explain'; readonly text: string }
  /** The conversation started again, past the limit. */
  | { readonly type: 'fresh' };

export interface AskOptions {
  readonly mode: PrompterMode;
  readonly level: PrompterLevel;
  /** The whole production and storyboard, as data. Sent only when changed (section 2.4). */
  readonly production?: Json;
  readonly storyboard?: Json;
  readonly checkResult?: Json;
  /** The plan the learner agreed, with their changes. Its presence lets changes run. */
  readonly agreedPlan?: Json;
  readonly signal?: AbortSignal;
  readonly onEvent?: (event: SessionEvent) => void;
}

export type AskStatus =
  'done' | 'refused' | 'cut_short' | 'limit' | 'step_failed' | 'stopped' | 'error';

export interface AskOutcome {
  readonly status: AskStatus;
  /** For `error`. */
  readonly code?: TransportErrorCode;
  readonly retryAfterSeconds?: number;
  /** For `cut_short`: the stop reason, or null if the stream never gave one. */
  readonly stopReason?: string | null;
  /** For `step_failed`: the plan step, or the tool's name. */
  readonly failedStep?: number | string;
  readonly toolCalls: number;
  /** Changes that landed, so the panel knows whether to offer Undo. */
  readonly changes: number;
  /** This request started a fresh conversation. */
  readonly fresh: boolean;
}

export interface SessionSetup {
  readonly transport: PrompterTransport;
  /** Fixed for the release: `buildSystem(...)` and `TOOLS`. */
  readonly system: readonly Json[];
  readonly tools: readonly Json[];
  readonly runner: ToolRunner;
  /** A new id for each request. */
  readonly newId: () => string;
}

const isChange = (name: string) => (CHANGE_TOOLS as readonly string[]).includes(name);
const isTool = (name: unknown): name is ToolName =>
  typeof name === 'string' && (TOOL_NAMES as readonly string[]).includes(name);

interface Sent {
  readonly length: number;
  readonly production: string | null;
  readonly storyboard: string | null;
  readonly mode: string | null;
}

export class PrompterSession {
  readonly #setup: SessionSetup;
  #messages: Json[] = [];
  /** What this conversation last sent, so unchanged data and modes aren't sent again. */
  #production: string | null = null;
  #storyboard: string | null = null;
  #mode: string | null = null;
  #lastInputTokens = 0;
  #busy = false;

  constructor(setup: SessionSetup) {
    this.#setup = setup;
  }

  /** The history, for tests and the leak scan. Never stored (section 1.5). */
  get messages(): readonly Json[] {
    return this.#messages;
  }

  /** New conversation: the learner's button, or the limit. */
  reset(): void {
    this.#messages = [];
    this.#production = null;
    this.#storyboard = null;
    this.#mode = null;
    this.#lastInputTokens = 0;
  }

  async ask(request: string, options: AskOptions): Promise<AskOutcome> {
    if (this.#busy) throw new Error('One request at a time.');
    const base = { toolCalls: 0, changes: 0, fresh: false };
    if (!modesAt(options.level).includes(options.mode))
      return { ...base, status: 'error', code: 'refused_by_policy' };

    this.#busy = true;
    const fresh = this.#lastInputTokens > CONVERSATION_LIMIT;
    if (fresh) {
      this.reset();
      options.onEvent?.({ type: 'fresh' });
    }
    const before = this.#mark();
    this.#addLearnerTurn(request, options);
    this.#setup.runner.begin?.(request);
    try {
      const outcome = await this.#loop(options, fresh);
      if (!outcome.kept) this.#restore(before);
      return outcome.result;
    } finally {
      this.#setup.runner.end?.();
      this.#busy = false;
    }
  }

  #mark(): Sent {
    return {
      length: this.#messages.length,
      production: this.#production,
      storyboard: this.#storyboard,
      mode: this.#mode,
    };
  }

  #restore(sent: Sent): void {
    this.#messages = this.#messages.slice(0, sent.length);
    this.#production = sent.production;
    this.#storyboard = sent.storyboard;
    this.#mode = sent.mode;
  }

  #addLearnerTurn(request: string, options: AskOptions): void {
    const changed = (value: Json | undefined, last: string | null) =>
      value !== undefined && safeJson(value) !== last ? value : undefined;
    const production = changed(options.production, this.#production);
    const storyboard = changed(options.storyboard, this.#storyboard);
    if (production !== undefined) this.#production = safeJson(production);
    if (storyboard !== undefined) this.#storyboard = safeJson(storyboard);
    this.#messages.push(
      learnerTurn({
        request,
        ...(production === undefined ? {} : { production }),
        ...(storyboard === undefined ? {} : { storyboard }),
        ...(options.checkResult === undefined ? {} : { checkResult: options.checkResult }),
        ...(options.agreedPlan === undefined ? {} : { agreedPlan: options.agreedPlan }),
      }) as unknown as Json,
    );
    // The mode goes right after the learner's turn, the first time and whenever it changes (4.2).
    const mode = modeMessage(options.mode, { planOnly: options.level === 'planOnly' });
    if (mode !== this.#mode) {
      this.#messages.push({ role: 'system', content: mode });
      this.#mode = mode;
    }
  }

  async #loop(
    options: AskOptions,
    fresh: boolean,
  ): Promise<{ readonly kept: boolean; readonly result: AskOutcome }> {
    const { transport, system, tools, newId } = this.#setup;
    let toolCalls = 0;
    let changes = 0;
    let kept = false;
    const failures = new Map<string, number>();
    const done = (status: AskStatus, extra: Partial<AskOutcome> = {}) => ({
      kept,
      result: { status, toolCalls, changes, fresh, ...extra },
    });

    for (;;) {
      if (options.signal?.aborted) return done('stopped');
      const request = buildRequest({
        id: newId(),
        mode: options.mode,
        system,
        tools,
        messages: [...this.#messages],
      });
      const assembler = new ReplyAssembler((text) => options.onEvent?.({ type: 'text', text }));
      let failed: { code: TransportErrorCode; retryAfterSeconds?: number } | null = null;
      for await (const event of transport.send(request, options.signal)) {
        if (event.type === 'event') assembler.add(event.event);
        else if (event.type === 'error') failed = event;
      }
      if (failed)
        return failed.code === 'cancelled'
          ? done('stopped')
          : done('error', {
              code: failed.code,
              ...(failed.retryAfterSeconds === undefined
                ? {}
                : { retryAfterSeconds: failed.retryAfterSeconds }),
            });

      const reply = assembler.result();
      this.#lastInputTokens = reply.inputTokens;
      // Look at why it stopped before anything else: no tool runs after a refusal or a cut.
      if (reply.stopReason === 'refusal') return done('refused');
      if (reply.stopReason !== 'end_turn' && reply.stopReason !== 'tool_use')
        return done('cut_short', { stopReason: reply.stopReason });

      const echo = echoContent(reply.content);
      this.#messages.push({ role: 'assistant', content: echo });
      kept = true;
      const uses = echo.filter((b) => b.type === 'tool_use');
      if (reply.stopReason === 'end_turn' || uses.length === 0) return done('done');

      const results: Json[] = [];
      let stop: AskStatus | null = null;
      let failedStep: number | string | undefined;
      for (const use of uses) {
        const id = String(use.id);
        let outcome: ToolOutcome;
        if (toolCalls >= MAX_TOOL_CALLS) {
          outcome = {
            ok: false,
            error: 'limit_reached',
            message: `${MAX_TOOL_CALLS} tool calls is the most for one request. Stop, and say what was done.`,
          };
          stop ??= 'limit';
        } else {
          toolCalls += 1;
          outcome = await this.#runOne(use, reply.badInputs.get(id), options);
        }
        const input = (use.input ?? {}) as Record<string, unknown>;
        if (outcome.ok && use.name === 'explain' && typeof input.text === 'string')
          options.onEvent?.({ type: 'explain', text: input.text });
        if (outcome.ok && isChange(String(use.name))) {
          changes += 1;
          if (typeof input.narration === 'string')
            options.onEvent?.({
              type: 'narration',
              text: input.narration,
              ...(typeof input.plan_step === 'number' ? { step: input.plan_step } : {}),
            });
        }
        if (!outcome.ok && outcome.error !== 'limit_reached') {
          const key = typeof input.plan_step === 'number' ? input.plan_step : String(use.name);
          const count = (failures.get(String(key)) ?? 0) + 1;
          failures.set(String(key), count);
          if (count >= MAX_STEP_FAILURES && stop === null) {
            stop = 'step_failed';
            failedStep = key;
          }
        }
        results.push(toolResult(id, outcome) as unknown as Json);
      }
      // Every call gets its result, in one message, even when the request stops here.
      this.#messages.push({ role: 'user', content: results });
      if (stop) return done(stop, failedStep === undefined ? {} : { failedStep });
    }
  }

  async #runOne(
    use: JsonObject,
    badInput: string | undefined,
    options: AskOptions,
  ): Promise<ToolOutcome> {
    const name = use.name;
    if (badInput !== undefined)
      return { ok: false, error: 'bad_argument', message: "The input wasn't valid JSON." };
    const check = checkToolInput(String(name), use.input);
    if (!check.ok || !isTool(name))
      return {
        ok: false,
        error: 'bad_argument',
        message: check.ok ? `There is no tool called ${String(name)}.` : check.message,
      };
    const planAgreed = options.agreedPlan !== undefined;
    if (!toolAllowed(name, options.mode, options.level, { planAgreed }))
      return {
        ok: false,
        error: 'not_allowed_here',
        message: notAllowed(name, options, planAgreed),
      };
    try {
      return await this.#setup.runner.run(name, use.input as JsonObject);
    } catch {
      return { ok: false, error: 'would_break_program', message: "That change couldn't be made." };
    }
  }
}

function notAllowed(name: ToolName, options: AskOptions, planAgreed: boolean): string {
  const building = options.mode === 'showMeHow' || options.mode === 'buildIt';
  if (!building) return 'This mode changes nothing and makes no plans.';
  if (options.level === 'planOnly')
    return 'At Plan only the learner builds every block. Explain the steps instead.';
  if (!planAgreed && isChange(name))
    return 'Nothing changes before the learner agrees a plan. Call propose_plan, then end your turn.';
  return `${name} can't be used here.`;
}
