/**
 * The Prompter's tools (`docs/spec/04-prompter.md` section 3, WP13.4): their definitions, the
 * check on each call's input, and the result format.
 *
 * The definitions are fixed for a release. Every request sends all of them in this order, the
 * native layer pins their hash (15.2), and thinking blocks are bound to them, so nothing here
 * may depend on the production, the learner or the mode. Names come from the AST and the Story
 * API's catalog, which are fixed for a release too.
 *
 * Strict mode rules out ranges, lengths, unions and recursion, and limits how many optional
 * fields a request's tools may have. So argument values are strings, read by the client by their
 * Story API type; optional fields are few; and `checkToolInput` checks what the schema can't.
 */
import type { Statement } from '@storystage/ast';
import { EVENTS } from '@storystage/story-api';
import { TOOL_NAMES, type ToolName } from './tool-names.ts';

export interface JsonSchema {
  readonly type: 'object' | 'array' | 'string' | 'number' | 'integer' | 'boolean';
  readonly description?: string;
  readonly enum?: readonly string[];
  readonly properties?: Readonly<Record<string, JsonSchema>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: false;
  readonly items?: JsonSchema;
}

export interface ToolDefinition {
  readonly name: ToolName;
  readonly description: string;
  readonly strict: true;
  readonly eager_input_streaming: true;
  readonly input_schema: JsonSchema;
}

/** Our own budget for optional fields across every tool, inside strict mode's limit. */
export const MAX_OPTIONAL_FIELDS = 20;

/** The AST's control blocks a tool can add. */
export const CONTROL_KINDS = [
  'doInOrder',
  'doTogether',
  'count',
  'while',
  'if',
  'forEach',
  'eachTogether',
] as const satisfies readonly Statement['kind'][];

/** The Story API's events a listener can wait for. Every scene already starts its own. */
export const LISTENER_EVENTS: readonly string[] = EVENTS.map((e) => e.name).filter(
  (name) => name !== 'sceneStart',
);

// ---- Building blocks -------------------------------------------------------------------------

const text = (description: string): JsonSchema => ({ type: 'string', description });
const number = (description: string): JsonSchema => ({ type: 'number', description });
const whole = (description: string): JsonSchema => ({ type: 'integer', description });
const yesNo = (description: string): JsonSchema => ({ type: 'boolean', description });
const oneOf = (values: readonly string[], description: string): JsonSchema => ({
  type: 'string',
  enum: values,
  description,
});
const list = (items: JsonSchema, description: string): JsonSchema => ({
  type: 'array',
  items,
  description,
});
const object = (
  properties: Readonly<Record<string, JsonSchema>>,
  optional: readonly string[] = [],
  description?: string,
): JsonSchema => ({
  type: 'object',
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties).filter((key) => !optional.includes(key)),
  additionalProperties: false,
});

const VALUE =
  'The value as text, read by its type in the Story API catalog: a number as digits ("2.5"), a name ("left", "cat"), words ("Hello"), or a position as "x, y, z" in metres.';
const nameValue = object({
  name: text('The parameter or detail name, from the Story API catalog.'),
  value: text(VALUE),
});
const vector = object(
  {
    x: number('Metres, + is left.'),
    y: number('Metres, up; 0 is the ground.'),
    z: number('Metres, + is forward.'),
  },
  [],
  'A position in the scene, in metres.',
);

/** Every tool that changes the production has these (spec 04, sections 3 and 6.4). */
const CHANGE_FIELDS = {
  narration: text(
    'One sentence under 25 words, in plain words for a child, saying what visibly changes. It is shown as a caption and may be read aloud.',
  ),
  plan_step: whole(
    'The number of the agreed plan step this call builds, from 1. A supporting block names the step it serves.',
  ),
};

const METHOD = text('The method to add to, by its name in the program text.');
const PARENT = text(
  'The id of a control block to add inside, from an earlier result. Leave it out to add to the method itself.',
);
const POSITION = text(
  '"end", or a whole number as text for the place among the blocks there, from 0.',
);

const PLAN_STEP = object({
  words: text('The step in plain words for a child, under 20 words: "The owl walks to the tree."'),
  kind: oneOf(
    ['do', 'add', 'change', 'when', 'stage'],
    'do: a Story API block. add: add a model. change: how something starts. when: an event. stage: set the scene from the storyboard.',
  ),
  actor: text('The object that acts, by its name in the scene; "scene" for stage.'),
  action: text(
    'For do, a Story API procedure. For add, a Backstage id. For change, a property. For when, an event. For stage, a scene id.',
  ),
  target: text('The object or marker it acts on, or "" for none.'),
  details: list(nameValue, 'Details and parameters, as name and value pairs.'),
  line: text('The script line id this step says or follows, or "" for none.'),
  sketch: text('The placed sketch id this step comes from, or "" for none.'),
  together: yesNo('True if it runs at the same time as the step before it.'),
  repeat: whole('How many times it runs; 1 for once.'),
  why: text('One sentence under 25 words saying why this step is there, for "Why this step?"'),
});
const STEPS = list(PLAN_STEP, 'The plan, 1 to 12 steps, in order.');

const tool = (
  name: ToolName,
  description: string,
  properties: Readonly<Record<string, JsonSchema>>,
  optional: readonly string[] = [],
): ToolDefinition => ({
  name,
  description,
  strict: true,
  eager_input_streaming: true,
  input_schema: object(properties, optional),
});

const BUILDING =
  'Call it only while building an agreed plan, and only for the step it names in plan_step.';

const DEFINITIONS: Readonly<Record<ToolName, ToolDefinition>> = {
  explain: tool(
    'explain',
    'Answer the learner in words, without changing anything. The text is shown in the panel and may be read aloud.',
    {
      text: text('Under 120 words, in plain words for a child.'),
      highlight: list(
        text('A block id or an object name.'),
        'Blocks or objects to flash while the learner reads.',
      ),
    },
    ['highlight'],
  ),
  read_project: tool(
    'read_project',
    'Get the latest production and storyboard data, after several changes. Changes nothing.',
    {},
  ),
  check_frame: tool(
    'check_frame',
    "Get the latest result of the automatic check for a frame: where what happened differs from the storyboard. It doesn't run the check. Use it to explain a flag in the learner's words. Changes nothing.",
    { frame: text('A frame id.') },
  ),
  script_check: tool(
    'script_check',
    'Get facts about how the script and storyboard line up: lines on no frame, frames with no line, characters not in the cast, cast never named, frames too short for their lines. Explain them and ask about them; never suggest replacement words. Changes nothing.',
    { scene: text('A scene id. Leave it out for the whole production.') },
    ['scene'],
  ),
  propose_plan: tool(
    'propose_plan',
    "Show the learner a short numbered plan before anything changes. Make it from the frame's sketches, script lines and shot where there is a frame. After a successful result, end your turn and wait: the learner edits the plan and presses Build these steps.",
    { frame: text('The frame id it is for. Leave it out if it is for no frame.'), steps: STEPS },
    ['frame'],
  ),
  revise_plan: tool(
    'revise_plan',
    'Replace the plan on show when the learner asks for changes in words. End your turn afterwards.',
    { plan: text('The plan id from propose_plan.'), steps: STEPS },
  ),
  add_model: tool(
    'add_model',
    `Add a model to the scene, as Backstage's Add does. Use only ids in the Backstage catalogue or the production's imported models. ${BUILDING}`,
    {
      backstage_item: text('A Backstage id: "Quadruped/Cat/AbyssinianCat".'),
      name: text('Its name in the scene. Made unique if taken; the result says the final name.'),
      position: vector,
      turn_degrees: number('Turn about the vertical axis from its default facing, in degrees.'),
      scale: number('Resize, 0.05 to 20; 1 is its usual size.'),
      ...CHANGE_FIELDS,
    },
    ['turn_degrees', 'scale'],
  ),
  set_property: tool('set_property', `Change how an object starts in the scene. ${BUILDING}`, {
    object: text('A name in the scene: "cat", or "camera".'),
    property: oneOf(
      ['position', 'turn_degrees', 'scale', 'paint', 'opacity', 'vehicle'],
      'Which property.',
    ),
    value: text(
      'As text: a position as "x, y, z" in metres; degrees or a scale as a number; a paint name or #rrggbb; opacity from 0 to 1; or the name of the object it rides on.',
    ),
    ...CHANGE_FIELDS,
  }),
  insert_statement: tool(
    'insert_statement',
    `Add one Story API procedure block to a method. Words a character says must be a script line's exact words, given in line, or come from the learner's own request. ${BUILDING}`,
    {
      method: METHOD,
      parent_block: PARENT,
      position: POSITION,
      target: text('An object name, "this" for the scene, or a joint in the catalog\'s form.'),
      procedure: text('A Story API procedure on the target\'s class: "move", "turn", "say".'),
      arguments: list(nameValue, 'The required parameters.'),
      details: list(nameValue, 'Optional details: duration, animationStyle and so on.'),
      line: text('The script line id whose words this block says.'),
      ...CHANGE_FIELDS,
    },
    ['parent_block', 'details', 'line'],
  ),
  insert_control: tool(
    'insert_control',
    `Add a control block that later blocks can go inside. The result gives its id, for parent_block. ${BUILDING}`,
    {
      method: METHOD,
      parent_block: PARENT,
      position: POSITION,
      kind: oneOf(CONTROL_KINDS, 'Which control block.'),
      count: whole('For count: how many times, from 1.'),
      condition: object(
        {
          target: text('The object the function asks about, or "" for a plain true or false.'),
          function: text('A Story API function, or "true" or "false".'),
          arguments: list(nameValue, "The function's parameters."),
        },
        [],
        'For while and if.',
      ),
      items: list(
        text('An object name.'),
        'For forEach and eachTogether: the objects to go through.',
      ),
      ...CHANGE_FIELDS,
    },
    ['parent_block', 'count', 'condition', 'items'],
  ),
  declare_procedure: tool(
    'declare_procedure',
    `Make a new procedure, a block of the learner's own. The result gives its name, for insert_statement. ${BUILDING}`,
    {
      class: text('"Scene", or a class in the program.'),
      name: text("The new procedure's name."),
      parameters: list(
        object({
          name: text("The parameter's name."),
          type: text('A type from the Story API catalog.'),
        }),
        'Its parameters.',
      ),
      ...CHANGE_FIELDS,
    },
    ['parameters'],
  ),
  add_event_listener: tool(
    'add_event_listener',
    `Add a block that runs when something happens. The result gives its id: pass it as parent_block to put blocks in its handler. ${BUILDING}`,
    {
      event: oneOf(LISTENER_EVENTS, 'Which event, from the Story API catalog.'),
      objects: list(
        text('An object name.'),
        'The objects it is about: what is clicked (none for any), what the arrow keys move, or the first group.',
      ),
      other_objects: list(
        text('An object name.'),
        'The second group, for collisions and proximity; otherwise none.',
      ),
      number: number('Seconds between runs for timer; metres for proximity.'),
      ...CHANGE_FIELDS,
    },
    ['number'],
  ),
  stage_scene: tool(
    'stage_scene',
    `Place a scene's cast, props, set, backdrop and camera from its storyboard frames, as Set up from storyboard does. It places only what the storyboard has; stand-ins stay stand-ins. ${BUILDING}`,
    {
      scene: text('A scene id.'),
      from_frame: text('The frame to take positions from. Leave it out for the first.'),
      ...CHANGE_FIELDS,
    },
    ['from_frame'],
  ),
  code_frame: tool(
    'code_frame',
    'Start building the agreed plan for a frame. The result says which method and block to build in; blocks built after it in this request are linked to the frame. Refused if the learner has not pressed Build these steps.',
    { frame: text('A frame id with an agreed plan.') },
  ),
};

/** Every tool, in a fixed order. */
export const TOOLS: readonly ToolDefinition[] = TOOL_NAMES.map((name) => DEFINITIONS[name]);

// ---- Checking a call's input (spec 04, section 1.6) ------------------------------------------

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const wholeFrom1 = (v: unknown) =>
  typeof v === 'number' && (!Number.isInteger(v) || v < 1)
    ? 'should be a whole number from 1'
    : null;
const upToWords = (most: number) => (v: unknown) =>
  typeof v === 'string' && wordCount(v) > most ? `should be under ${most + 1} words` : null;

/** What the schema can't say, by field name. */
const RULES: Readonly<Record<string, (value: unknown) => string | null>> = {
  plan_step: wholeFrom1,
  repeat: wholeFrom1,
  count: wholeFrom1,
  scale: (v) =>
    typeof v === 'number' && (v < 0.05 || v > 20) ? 'should be from 0.05 to 20' : null,
  position: (v) =>
    typeof v === 'string' && !/^(end|\d+)$/.test(v) ? 'should be "end" or a whole number' : null,
  narration: upToWords(24),
  text: upToWords(119),
  words: upToWords(19),
  why: upToWords(24),
  steps: (v) =>
    Array.isArray(v) && (v.length < 1 || v.length > 12) ? 'should have 1 to 12 steps' : null,
};

/** Strings that may be empty: "" means none. */
const MAY_BE_EMPTY = ['target', 'line', 'sketch', 'value'];

const TYPE_WORDS = {
  object: 'an object',
  array: 'a list',
  string: 'text',
  number: 'a number',
  integer: 'a whole number',
  boolean: 'true or false',
} as const;

const fits = (schema: JsonSchema, value: unknown): boolean => {
  switch (schema.type) {
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return Number.isInteger(value);
    case 'boolean':
      return typeof value === 'boolean';
  }
};

function problem(schema: JsonSchema, value: unknown, path: string, key: string): string | null {
  const where = path || 'The input';
  if (!fits(schema, value)) return `${where} should be ${TYPE_WORDS[schema.type]}.`;
  if (schema.enum && !schema.enum.includes(value as string))
    return `${where} should be one of ${schema.enum.join(', ')}.`;
  if (schema.type === 'string' && value === '' && !MAY_BE_EMPTY.includes(key))
    return `${where} is empty.`;
  const rule = RULES[key]?.(value);
  if (rule) return `${where} ${rule}.`;

  if (schema.type === 'array' && schema.items)
    for (const [i, item] of (value as unknown[]).entries()) {
      const found = problem(schema.items, item, `${path}[${i}]`, key);
      if (found) return found;
    }

  if (schema.type === 'object') {
    const record = value as Record<string, unknown>;
    const properties = schema.properties ?? {};
    const at = (name: string) => (path ? `${path}.${name}` : name);
    for (const name of Object.keys(record))
      if (!(name in properties)) return `${at(name)} isn't allowed.`;
    for (const name of schema.required ?? [])
      if (!(name in record)) return `${at(name)} is missing.`;
    for (const [name, sub] of Object.entries(properties))
      if (name in record) {
        const found = problem(sub, record[name], at(name), name);
        if (found) return found;
      }
  }
  return null;
}

export type InputCheck = { readonly ok: true } | { readonly ok: false; readonly message: string };

/**
 * Checks a call's input against its tool, before it runs. A failure answers `bad_argument` with
 * the message, and nothing runs. Streamed input can arrive cut off, so this is never skipped.
 */
export function checkToolInput(name: string, input: unknown): InputCheck {
  const definition = TOOLS.find((t) => t.name === name);
  if (!definition) return { ok: false, message: `There is no tool called ${name}.` };
  const found = problem(definition.input_schema, input, '', '');
  return found ? { ok: false, message: found } : { ok: true };
}

// ---- Results (spec 04, section 3) ------------------------------------------------------------

export const TOOL_ERROR_CODES = [
  'unknown_object',
  'unknown_block',
  'unknown_method',
  'unknown_frame',
  'unknown_line',
  'bad_argument',
  'not_allowed_here',
  'would_break_program',
  'limit_reached',
  'no_agreed_plan',
  'not_in_plan',
  'not_in_script',
] as const;
export type ToolErrorCode = (typeof TOOL_ERROR_CODES)[number];

export type ToolOutcome =
  | {
      readonly ok: true;
      readonly ids: Readonly<Record<string, string>>;
      readonly summary: string;
    }
  | { readonly ok: false; readonly error: ToolErrorCode; readonly message: string };

/** The `tool_result` block for a call, marked as an error when it failed. */
export function toolResult(toolUseId: string, outcome: ToolOutcome) {
  return {
    type: 'tool_result',
    tool_use_id: toolUseId,
    content: JSON.stringify(outcome),
    ...(outcome.ok ? {} : { is_error: true }),
  } as const;
}
