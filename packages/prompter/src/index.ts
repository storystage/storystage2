/**
 * @storystage/prompter: Tool schemas, context builders, conversation loop and modes; transport-agnostic (talks to the native layer).
 *
 * Owner: S7. Workplan: WP13.
 *
 * WP0.8: the transport contract (`transport.ts`). WP13.8: the system prompt (`system-prompt.ts`).
 * The conversation loop arrives with WP13b.
 */
export * from './system-prompt.ts';
export * from './transport.ts';
