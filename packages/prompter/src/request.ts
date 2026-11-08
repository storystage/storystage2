/**
 * One Messages API request, built without the key (`docs/spec/04-prompter.md` section 1.2,
 * WP13.2). `system` and `tools` are passed through untouched, so the hashes the native layer pins
 * hold for the whole conversation.
 */
import { MODE_SETTINGS, type ModeSettings } from './models.ts';
import { ALLOWED_BETAS, type Json, type PrompterMode, type PrompterRequest } from './transport.ts';

export interface RequestParts {
  /** Unique per request, for cancelling and logs. */
  readonly id: string;
  readonly mode: PrompterMode;
  readonly system: readonly Json[];
  readonly tools: readonly Json[];
  readonly messages: readonly Json[];
}

export function buildRequest(
  { id, mode, system, tools, messages }: RequestParts,
  settings: ModeSettings = MODE_SETTINGS[mode],
): PrompterRequest {
  return {
    id,
    mode,
    ...(settings.fallback ? { betas: [...ALLOWED_BETAS] } : {}),
    body: {
      model: settings.model,
      max_tokens: settings.maxTokens,
      stream: true,
      output_config: { effort: settings.effort },
      cache_control: { type: 'ephemeral' },
      ...(settings.fallback ? { fallbacks: 'default' } : {}),
      tools,
      system,
      messages,
    },
  };
}
