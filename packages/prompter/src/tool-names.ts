/**
 * The Prompter's tools by what they can do (`docs/spec/04-prompter.md` section 3). Every request
 * sends every tool, because `tools` can't change within a conversation (section 1.5); these
 * groups decide which calls run (`levels.ts`).
 */

/** Change nothing. */
export const READ_TOOLS = ['explain', 'read_project', 'check_frame', 'script_check'] as const;

/** Show a plan to the learner; change nothing in the program. */
export const PLAN_TOOLS = ['propose_plan', 'revise_plan'] as const;

/** Change the production, or (`code_frame`) start building an agreed plan. */
export const CHANGE_TOOLS = [
  'add_model',
  'set_property',
  'insert_statement',
  'insert_control',
  'declare_procedure',
  'add_event_listener',
  'stage_scene',
  'code_frame',
] as const;

export const TOOL_NAMES = [...READ_TOOLS, ...PLAN_TOOLS, ...CHANGE_TOOLS] as const;
export type ToolName = (typeof TOOL_NAMES)[number];
