/**
 * What each teacher level allows (decision 0034, `docs/spec/04-prompter.md` sections 3.4 and
 * 4.3). The native layer enforces the same again; this is what the learner sees.
 */
import { CHANGE_TOOLS, PLAN_TOOLS, READ_TOOLS, type ToolName } from './tool-names.ts';
import { PROMPTER_MODES, type PrompterMode } from './transport.ts';

/**
 * The same list as `@storystage/host`'s policy. That package depends on this one, so it can't be
 * imported here; host is the place for a test that keeps the two equal.
 */
export const PROMPTER_LEVELS = ['off', 'explainOnly', 'planOnly', 'full'] as const;
export type PrompterLevel = (typeof PROMPTER_LEVELS)[number];

const READ_ONLY_MODES: readonly PrompterMode[] = ['explain', 'storyCoach', 'scriptCheck'];

/** The modes offered at a level. The story coach is on at every level but Off. */
export function modesAt(level: PrompterLevel): readonly PrompterMode[] {
  if (level === 'off') return [];
  if (level === 'explainOnly') return READ_ONLY_MODES;
  return PROMPTER_MODES;
}

const has = (list: readonly string[], tool: ToolName) => list.includes(tool);

/** Whether a tool call may run. A call that may not answers `not_allowed_here`. */
export function toolAllowed(
  tool: ToolName,
  mode: PrompterMode,
  level: PrompterLevel,
  { planAgreed = false }: { readonly planAgreed?: boolean } = {},
): boolean {
  if (!modesAt(level).includes(mode)) return false;
  if (has(READ_TOOLS, tool)) return true;
  const building = mode === 'showMeHow' || mode === 'buildIt';
  if (has(PLAN_TOOLS, tool)) return building;
  return has(CHANGE_TOOLS, tool) && building && planAgreed && level !== 'planOnly';
}
