/**
 * What the panel says when a request ends (`docs/spec/04-prompter.md` section 7). Errors say
 * what happened and what to do next, with no apologies (rule 9).
 */
import { MAX_TOOL_CALLS, type AskOutcome } from './session.ts';
import type { TransportErrorCode } from './transport.ts';

export type OutcomeAction = 'openSetup' | 'tryAgain' | 'undo';

export interface OutcomeMessage {
  readonly text: string;
  readonly action?: OutcomeAction;
}

/** Shown when the limit starts a new conversation (section 1.5). */
export const FRESH_CONVERSATION =
  'Starting a fresh conversation. The Prompter can still see your whole production.';

const COULDNT_FINISH = "The Prompter couldn't finish this step.";

const ERRORS: Readonly<Record<TransportErrorCode, OutcomeMessage | null>> = {
  prompter_off: null,
  no_key: { text: "The Prompter isn't set up yet.", action: 'openSetup' },
  key_revoked: {
    text: "Your Claude key isn't working. Open set-up to check it.",
    action: 'openSetup',
  },
  no_credit: {
    text: 'Your Claude account has run out of credit. An adult can add more in the Claude Console.',
  },
  rate_limited: {
    text: 'The Prompter is busy. Carry on and try again shortly.',
    action: 'tryAgain',
  },
  overloaded: {
    text: 'Claude is having trouble right now. Try again in a minute.',
    action: 'tryAgain',
  },
  offline: {
    text: "You're offline, so the Prompter can't help right now. Everything else in StoryStage still works.",
  },
  cap_reached: {
    text: "You've used the Prompter's time for today. You can carry on without it.",
  },
  refused_by_policy: { text: 'Your school has turned this off.' },
  refused_by_allowlist: {
    text: "The Prompter can't do that here. Restart StoryStage, and tell your teacher if this happens again.",
  },
  cancelled: { text: 'Stopped.' },
  internal: { text: COULDNT_FINISH, action: 'tryAgain' },
};

/** The panel's message for an outcome, or null when there is nothing to say. */
export function outcomeMessage(outcome: AskOutcome): OutcomeMessage | null {
  const undo = outcome.changes > 0 ? { action: 'undo' as const } : {};
  switch (outcome.status) {
    case 'done':
      return null;
    case 'refused':
      return { text: "The Prompter can't help with that one. Try a different idea." };
    case 'stopped':
      return { text: 'Stopped.', ...undo };
    case 'limit':
      return {
        text: `The Prompter stopped after ${MAX_TOOL_CALLS} steps. Ask again for the next part.`,
        ...undo,
      };
    case 'cut_short':
    case 'step_failed':
      return { text: COULDNT_FINISH, ...undo };
    case 'error': {
      const message = ERRORS[outcome.code ?? 'internal'];
      if (message && outcome.code === 'rate_limited' && outcome.retryAfterSeconds)
        return {
          text: `The Prompter is busy. Try again in ${outcome.retryAfterSeconds} seconds.`,
          action: 'tryAgain',
        };
      return message;
    }
  }
}
