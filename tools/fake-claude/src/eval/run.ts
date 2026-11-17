/**
 * Runs one row of the evaluation set through the real Prompter (`docs/eval/README.md`, "Running a
 * request"): the panel, the request loop and the tool runner the studio uses, on a fresh copy of
 * the row's start. It records everything the checks read: the tool calls and their outcomes, the
 * replies, the plan as shown and as agreed, the film before and after, and the tokens used.
 *
 * The transport is the caller's: the fake server for recorded runs, the live API for a live one.
 */
import { ProductionSession, type Production, type SceneId } from '@storystage/production';
import {
  BUILD_REQUEST,
  PrompterPanel,
  PrompterRunner,
  PrompterSession,
  releaseSystem,
  releaseTools,
  type JsonObject,
  type PanelEntry,
  type PanelPhase,
  type PlanStep,
  type PrompterEvent,
  type PrompterRequest,
  type PrompterTransport,
  type ToolName,
  type ToolOutcome,
} from '@storystage/prompter';
import { checkProgram } from '@storystage/story-api/program-check';
import type { EvalProduction, EvalRow } from '../eval.ts';
import { openStart } from './start.ts';

/** One tool call, as the runner answered it. */
export interface ToolCall {
  readonly name: ToolName;
  readonly input: JsonObject;
  readonly outcome: ToolOutcome;
  /** Which of the learner's turns it came in: 0 the request, then the follow-up, then the build. */
  readonly turn: 'request' | 'followUp' | 'build';
}

export interface Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  /** Requests that reached the transport: one for each model turn. */
  readonly requests: number;
}

export interface RowRun {
  readonly row: EvalRow;
  /** The scene the request was made in. */
  readonly scene: SceneId;
  /** The film as it opened. */
  readonly before: Production;
  /** After the request and any follow-up, before Build these steps. */
  readonly beforeBuild: Production;
  readonly after: Production;
  readonly calls: readonly ToolCall[];
  /** The panel's conversation: what was asked, the replies, explains and changes. */
  readonly entries: readonly PanelEntry[];
  /** The plan the Prompter showed first, and the one after the follow-up, if any. */
  readonly shownPlan: readonly PlanStep[] | null;
  /** The plan as built: the Prompter's, after the row's edits. `null` if nothing was built. */
  readonly agreedPlan: readonly PlanStep[] | null;
  /** Whether Build these steps was pressed. */
  readonly built: boolean;
  readonly phase: PanelPhase;
  readonly message: string | null;
  readonly usage: Usage;
  /** Every event the transport gave, request by request: a run can be kept as a recording. */
  readonly streams: readonly (readonly PrompterEvent[])[];
}

/** The release's system prompt, which holds the shipped Backstage catalogue. */
const SHIPPED = releaseSystem()
  .map((b) => (typeof b === 'object' && b !== null && 'text' in b ? String(b.text) : ''))
  .join('\n');

/**
 * A shipped id (`kaykit/Biped/knight`) or a start's made-up one (`example/Flyer/owl`) has its
 * class in it. Anything else isn't a model this run has.
 */
export function classFromId(id: string, shipped: string = SHIPPED): string | null {
  const cls = /^[a-z0-9-]+\/([A-Z][A-Za-z]*)\/[^\s:]+$/.exec(id)?.[1] ?? null;
  if (!cls) return null;
  return id.startsWith('example/') || shipped.includes(`    ${id}:`) ? cls : null;
}

/** Wraps the transport to keep each stream and count the tokens each turn reports. */
function metered(transport: PrompterTransport) {
  const streams: PrompterEvent[][] = [];
  const requests: PrompterRequest[] = [];
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const wrapped: PrompterTransport = {
    status: () => transport.status(),
    async *send(request, signal) {
      requests.push(request);
      const events: PrompterEvent[] = [];
      streams.push(events);
      for await (const event of transport.send(request, signal)) {
        events.push(event);
        if (event.type === 'event') {
          const e = event.event as {
            type?: string;
            message?: { usage?: Record<string, number> };
            usage?: Record<string, number>;
          };
          const u = e.type === 'message_start' ? e.message?.usage : e.usage;
          if (u) {
            usage.inputTokens += u.input_tokens ?? 0;
            usage.outputTokens += u.output_tokens ?? 0;
            usage.cacheReadTokens += u.cache_read_input_tokens ?? 0;
            usage.cacheWriteTokens += u.cache_creation_input_tokens ?? 0;
          }
        }
        yield event;
      }
    },
  };
  return { transport: wrapped, streams, requests, usage };
}

/**
 * Every tool call in the conversation and what it was answered, read from the last request, which
 * holds all of it. That counts the calls the mode refused before the runner saw them, which is
 * what the injection rows test. Which learner turn each came in is told by that turn's words.
 */
export function callsIn(request: PrompterRequest | undefined): ToolCall[] {
  const messages = (request?.body.messages ?? []) as readonly {
    role: string;
    content: string | readonly Record<string, unknown>[];
  }[];
  const answers = new Map<string, ToolOutcome>();
  for (const m of messages)
    if (m.role === 'user' && Array.isArray(m.content))
      for (const block of m.content)
        if (block.type === 'tool_result') {
          let outcome: ToolOutcome;
          try {
            outcome = JSON.parse(String(block.content)) as ToolOutcome;
          } catch {
            outcome = {
              ok: !block.is_error,
              ids: {},
              summary: String(block.content),
            } as ToolOutcome;
          }
          answers.set(String(block.tool_use_id), outcome);
        }
  const calls: ToolCall[] = [];
  let turn: ToolCall['turn'] = 'request';
  let asked = 0;
  for (const m of messages) {
    if (m.role === 'user' && Array.isArray(m.content)) {
      const words = m.content.map((b) => (b.type === 'text' ? String(b.text) : '')).join('');
      if (words.includes('<learner_request>')) {
        asked++;
        turn = words.includes(BUILD_REQUEST) ? 'build' : asked === 1 ? 'request' : 'followUp';
      }
    }
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue;
    for (const block of m.content)
      if (block.type === 'tool_use') {
        const outcome = answers.get(String(block.id));
        if (outcome)
          calls.push({
            name: block.name as ToolName,
            input: block.input as JsonObject,
            outcome,
            turn,
          });
      }
  }
  return calls;
}

/** Each of the row's plan edits, made the way the learner makes them in the panel. */
function editPlan(panel: PrompterPanel, row: EvalRow): void {
  for (const edit of row.plan_edits ?? []) {
    const steps = panel.state.plan?.steps ?? [];
    const at = (n: unknown) => Number(n) - 1;
    switch (edit.op) {
      case 'move':
        panel.moveStep(at(edit.step), at(edit.to));
        break;
      case 'delete':
        panel.deleteStep(at(edit.step));
        break;
      case 'change': {
        const step = steps[at(edit.step)];
        if (!step) break;
        const name = String(edit.detail);
        const value = String(edit.value);
        const details = step.details.some((d) => d.name === name)
          ? step.details.map((d) => (d.name === name ? { name, value } : d))
          : [...step.details, { name, value }];
        panel.changeStep(at(edit.step), { details });
        break;
      }
      case 'add':
        panel.addStep(
          {
            words: String(edit.words),
            kind: 'do',
            actor: String(edit.actor),
            action: String(edit.action),
            target: '',
            details: edit.text === undefined ? [] : [{ name: 'text', value: String(edit.text) }],
            line: '',
            sketch: '',
            together: false,
            repeat: 1,
            why: 'The learner added this step.',
          },
          Number(edit.after),
        );
        break;
      default:
        throw new Error(`${row.id}: no plan edit ${edit.op}.`);
    }
  }
}

export async function runRow(
  row: EvalRow,
  start: EvalProduction,
  transport: PrompterTransport,
): Promise<RowRun> {
  const opened = openStart(start, row.request);
  const session = new ProductionSession<string>(opened.production, {
    check: (p) => checkProgram(p),
  });
  const runner = new PrompterRunner({
    session,
    source: 'prompter',
    scene: () => opened.scene,
    backstageClass: (id) => classFromId(id, SHIPPED) as never,
    checkResult: (frame) => opened.checks.get(frame) ?? null,
  });

  const meter = metered(transport);
  let ids = 0;
  const prompter = new PrompterSession({
    transport: meter.transport,
    system: releaseSystem(),
    tools: releaseTools(),
    runner,
    newId: () => `${row.id}-${++ids}`,
  });
  const level = row.level ?? 'full';
  const panel = new PrompterPanel({
    prompter,
    runner,
    transport: meter.transport,
    production: session,
    source: 'prompter',
    level: () => level,
    scene: () => opened.scene,
    checkResult: (frame) => opened.checks.get(frame) ?? null,
  });

  await panel.refresh();
  panel.setMode(row.mode);
  await panel.ask(row.request);
  if (row.follow_up && panel.state.phase === 'planned') {
    await panel.ask(row.follow_up);
  }
  const shownPlan = panel.state.plan?.shown ?? null;
  const beforeBuild = session.production();

  let agreedPlan: readonly PlanStep[] | null = null;
  let built = false;
  if (panel.state.phase === 'planned') {
    editPlan(panel, row);
    if (panel.state.canBuild) {
      agreedPlan = panel.state.plan?.steps ?? null;
      built = true;
      await panel.build();
    }
  }

  return {
    row,
    scene: opened.scene,
    before: opened.production,
    beforeBuild,
    after: session.production(),
    calls: callsIn(meter.requests.at(-1)),
    entries: panel.state.entries,
    shownPlan,
    agreedPlan,
    built,
    phase: panel.state.phase,
    message: panel.state.message?.text ?? null,
    usage: { ...meter.usage, requests: meter.streams.length },
    streams: meter.streams,
  };
}
