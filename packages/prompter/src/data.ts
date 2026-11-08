/**
 * Learner text goes into a request as data, never as instructions (`docs/spec/04-prompter.md`
 * section 2.4, WP13.2). Each piece is JSON inside a named tag, with `<`, `>` and `&` escaped, so
 * nothing a learner, or the author of a shared production, writes can close a tag or open one.
 */
import type { REQUEST_TAG, DATA_TAGS } from './system-prompt.ts';
import type { Json } from './transport.ts';

export type DataTag = (typeof DATA_TAGS)[number] | typeof REQUEST_TAG;

const ESCAPES: Readonly<Record<string, string>> = {
  '<': '\\u003c',
  '>': '\\u003e',
  '&': '\\u0026',
};

/** JSON with no `<`, `>` or `&` left in it. It parses back to the same value. */
export function safeJson(value: Json): string {
  return JSON.stringify(value).replace(/[<>&]/g, (c) => ESCAPES[c] ?? c);
}

export function dataBlock(tag: DataTag, value: Json): string {
  return `<${tag}>${safeJson(value)}</${tag}>`;
}

export interface LearnerTurnParts {
  /** What the learner asked for, typed or spoken and then sent. */
  readonly request: string;
  /** Sent only when changed since it was last sent (spec 04, section 2.4). */
  readonly production?: Json;
  readonly storyboard?: Json;
  readonly checkResult?: Json;
  readonly agreedPlan?: Json;
}

export interface TextBlock {
  readonly type: 'text';
  readonly text: string;
}

/** One user turn: the data first, then what the learner asked for. */
export function learnerTurn(parts: LearnerTurnParts): {
  readonly role: 'user';
  readonly content: readonly TextBlock[];
} {
  const blocks: [DataTag, Json | undefined][] = [
    ['production_data', parts.production],
    ['storyboard_data', parts.storyboard],
    ['check_result', parts.checkResult],
    ['agreed_plan', parts.agreedPlan],
    ['learner_request', { text: parts.request }],
  ];
  return {
    role: 'user',
    content: blocks.flatMap(([tag, value]) =>
      value === undefined ? [] : [{ type: 'text' as const, text: dataBlock(tag, value) }],
    ),
  };
}
