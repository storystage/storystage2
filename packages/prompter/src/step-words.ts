/**
 * A plan step's words from its fields (`docs/spec/04-prompter.md` section 6.1, step 5). When the
 * learner changes a step with the dropdowns, or adds one from the menu, the words are written
 * again from what the step now does, so the plan on show, and the comment the build puts above
 * its blocks, never describe a different step. They use the Story API's own phrases, the ones the
 * tile editor's rows and the undo labels read ("penguin move forward 3").
 */
import { PLAN_LIMITS } from '@storystage/production';
import { DETAILS, enumValues, findEntry, isEnumName, type TypeName } from '@storystage/story-api';
import { fill, word } from '@storystage/story-api/editing';
import type { NameValue, PlanStep, PlanWorld } from './plans.ts';

/** A step's words are under 20 words (section 6.2), which also keeps a kept plan in the format's limits. */
export const STEP_WORDS_MAX = 19;

/** A value's words: an enum's own words, anything else as given. */
function valueWords(value: string, type: TypeName | undefined): string {
  if (type && isEnumName(type) && enumValues(type).includes(value))
    return word(`value.${type}.${value}`);
  return value;
}

/** Who does it: an object's name, or the scene's words for the scene itself (`this`). */
const who = (actor: string): string => (actor === 'this' ? word('words.scene') : actor);

function doWords(step: PlanStep, world: PlanWorld): string {
  const cls = world.objects.get(step.actor);
  const entry = cls ? findEntry(cls, step.action) : undefined;
  if (!entry || entry.kind !== 'procedure') return `${who(step.actor)} ${step.action}`;
  const given = new Map(step.details.map((d: NameValue) => [d.name, d.value] as const));
  if (step.target && !given.has('target')) given.set('target', step.target);
  // A line's words are the line's, exactly (section 6.5).
  const line = step.line ? world.lines.get(step.line) : undefined;
  if (line !== undefined) given.set('text', line);
  const values: Record<string, string> = {};
  for (const p of entry.params) {
    const v = given.get(p.name);
    if (v !== undefined) values[p.name] = valueWords(v, p.type);
  }
  const phrase = fill(word(`entry.${entry.on}.${entry.name}`), values);
  // Details that aren't in the phrase, such as how long, follow it.
  const extra = step.details
    .filter((d) => !entry.params.some((p) => p.name === d.name) && d.name !== 'target')
    .map((d) => `${word(`detail.${d.name}`)} ${valueWords(d.value, DETAILS[d.name]?.type)}`);
  return [`${who(step.actor)} ${phrase}`, ...extra].join(', ');
}

/** The step's words, from what it does. */
export function stepWords(step: PlanStep, world: PlanWorld): string {
  let words: string;
  switch (step.kind) {
    case 'do':
      words = doWords(step, world);
      break;
    case 'add':
      words = `add ${step.actor}`;
      break;
    case 'change': {
      const value = step.details.find((d) => d.name === step.action || d.name === 'value');
      words = [who(step.actor), step.action, value?.value].filter(Boolean).join(' ');
      break;
    }
    case 'when':
      words = word(`event.${step.action}`);
      break;
    case 'stage':
      words = 'set up the scene from the storyboard';
      break;
  }
  if (step.repeat > 1) words += `, ${step.repeat} times`;
  if (step.together) words += ', at the same time as the step before';
  // A long script line is cut short here; the block still says all of it.
  const all = words.split(/\s+/);
  if (all.length > STEP_WORDS_MAX) words = `${all.slice(0, STEP_WORDS_MAX).join(' ')}…`;
  // And within the format's characters for a step's words (6.7), with room for the stop.
  if (words.length > PLAN_LIMITS.text - 1) words = `${words.slice(0, PLAN_LIMITS.text - 2)}…`;
  const end = /[.!?…]$/.test(words) ? '' : '.';
  return words[0]!.toUpperCase() + words.slice(1) + end;
}
