/**
 * Whether this release's strict tools compile (spec 04, section 3; docs/eval/README.md): a live
 * check the owner runs, with ANTHROPIC_API_KEY set in that terminal only, after any change to a
 * tool's schema or to which tools are strict, before a live evaluation run. The API compiles every
 * strict tool's schema into one grammar and refuses a request whose grammar is too large, before
 * the model runs, so a refusal costs nothing. A grammar that compiles costs one short request:
 * this release's tools, no system prompt and a one-line message (about 7,000 input tokens).
 * It prints each variant's outcome, never the key.
 *
 *   node tools/fake-claude/src/eval/probe-grammar.ts            this release's tools, as pinned
 *   node tools/fake-claude/src/eval/probe-grammar.ts --groups   also each group strict, and each
 *                                                               change tool alone, to find room
 */
import { CHANGE_TOOLS, PLAN_TOOLS, READ_TOOLS, releaseTools } from '@storystage/prompter';

const key = process.env.ANTHROPIC_API_KEY ?? '';
if (!/^\S{20,}$/.test(key)) {
  console.error('ANTHROPIC_API_KEY is not set to a key.');
  process.exit(1);
}

type Tool = { readonly name: string; readonly strict?: boolean } & Record<string, unknown>;
const tools = releaseTools() as unknown as readonly Tool[];
const strictOnly = (names: readonly string[]) =>
  tools.map((t) => ({ ...t, strict: names.includes(t.name) }));

const variants: [string, readonly Tool[]][] = [["this release's tools", tools]];
if (process.argv.includes('--groups'))
  variants.push(
    ['every tool strict', strictOnly([...READ_TOOLS, ...PLAN_TOOLS, ...CHANGE_TOOLS])],
    ['change tools strict', strictOnly([...CHANGE_TOOLS])],
    ['read and plan tools strict', strictOnly([...READ_TOOLS, ...PLAN_TOOLS])],
    ...CHANGE_TOOLS.map((name): [string, readonly Tool[]] => [`${name} alone`, strictOnly([name])]),
  );

let refused = 0;
for (const [label, set] of variants) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-opus-5-5',
      max_tokens: 64,
      output_config: { effort: 'low' },
      tools: set,
      messages: [{ role: 'user', content: 'Reply with the word ok.' }],
    }),
  });
  const body = (await response.json()) as {
    error?: { message?: string };
    usage?: { input_tokens?: number };
  };
  const strict = set.filter((t) => t.strict).length;
  if (!response.ok && label === variants[0]![0]) refused++;
  console.log(
    response.ok
      ? `compiles  ${label} (${strict} strict; ${body.usage?.input_tokens ?? '?'} input tokens)`
      : `refused   ${label} (${strict} strict): ${response.status} ${body.error?.message ?? ''}`,
  );
}
process.exit(refused);
