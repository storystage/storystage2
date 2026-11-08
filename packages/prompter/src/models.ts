/**
 * The one place that names a model (decision 0019, `docs/spec/04-prompter.md` section 1.3).
 * Mode routing (WP24.3) moves Explain, the story coach and the script check to a lower-cost
 * model here, once the evaluation set has run on it. Haiku 5.5 has no server-side fallback, so
 * a mode moved to it sets `fallback: false`.
 */
import type { PrompterMode } from './transport.ts';

export interface ModeSettings {
  readonly model: string;
  readonly effort: 'low' | 'medium';
  /** Thinking counts towards it, so it leaves room for that as well as the reply. */
  readonly maxTokens: number;
  /** Ask for `fallbacks: "default"` (spec 04, section 1.4). */
  readonly fallback: boolean;
}

const READ_ONLY: ModeSettings = {
  model: 'claude-opus-5-5',
  effort: 'low',
  maxTokens: 16000,
  fallback: true,
};
const BUILDING: ModeSettings = {
  model: 'claude-opus-5-5',
  effort: 'medium',
  maxTokens: 32000,
  fallback: true,
};

export const MODE_SETTINGS: Readonly<Record<PrompterMode, ModeSettings>> = {
  explain: { ...READ_ONLY },
  storyCoach: { ...READ_ONLY },
  scriptCheck: { ...READ_ONLY },
  showMeHow: { ...BUILDING },
  buildIt: { ...BUILDING },
};
