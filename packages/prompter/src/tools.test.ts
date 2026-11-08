import { describe, expect, it } from 'vitest';
import { STATEMENT_KINDS } from '@storystage/ast';
import { EVENTS } from '@storystage/story-api';
import { CHANGE_TOOLS, PLAN_TOOLS, READ_TOOLS, TOOL_NAMES } from './tool-names.ts';
import {
  CONTROL_KINDS,
  LISTENER_EVENTS,
  MAX_OPTIONAL_FIELDS,
  TOOL_ERROR_CODES,
  TOOLS,
  checkToolInput,
  toolResult,
  type JsonSchema,
} from './tools.ts';

const byName = new Map<string, (typeof TOOLS)[number]>(TOOLS.map((t) => [t.name, t]));
const schemaOf = (name: string) => byName.get(name)?.input_schema as JsonSchema;

/** Every object schema in a tool's input, with its path. */
function* objects(schema: JsonSchema, path = '$'): Generator<[string, JsonSchema]> {
  if (schema.type === 'object') {
    yield [path, schema];
    for (const [key, value] of Object.entries(schema.properties ?? {}))
      yield* objects(value, `${path}.${key}`);
  }
  if (schema.type === 'array' && schema.items) yield* objects(schema.items, `${path}[]`);
}

const keywords = (value: unknown): string[] =>
  typeof value === 'object' && value !== null
    ? Object.entries(value).flatMap(([k, v]) => [k, ...keywords(v)])
    : [];

describe('the tool list (spec 04, section 3)', () => {
  it('defines every tool once, in the order of TOOL_NAMES, which never changes', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(TOOL_NAMES);
    expect(JSON.stringify(TOOLS)).toBe(JSON.stringify(TOOLS));
  });

  it('makes every tool strict and streamed, with a description', () => {
    for (const tool of TOOLS) {
      expect(tool.strict).toBe(true);
      expect(tool.eager_input_streaming).toBe(true);
      expect(tool.description.length).toBeGreaterThan(40);
    }
  });

  it('closes every object, as strict mode requires', () => {
    for (const tool of TOOLS)
      for (const [path, object] of objects(tool.input_schema)) {
        expect(object.additionalProperties, `${tool.name} ${path}`).toBe(false);
        for (const key of object.required ?? [])
          expect(object.properties, `${tool.name} ${path}`).toHaveProperty(key);
      }
  });

  it('uses nothing strict mode refuses: no ranges, lengths, unions or recursion', () => {
    const banned = [
      'minimum',
      'maximum',
      'exclusiveMinimum',
      'exclusiveMaximum',
      'minLength',
      'maxLength',
      'minItems',
      'maxItems',
      'pattern',
      'anyOf',
      'oneOf',
      'allOf',
      '$ref',
      '$defs',
    ];
    for (const tool of TOOLS) {
      const used = keywords(tool.input_schema);
      expect(
        used.filter((k) => banned.includes(k)),
        tool.name,
      ).toEqual([]);
      for (const [, object] of objects(tool.input_schema))
        for (const value of Object.values(object.properties ?? {}))
          expect(Array.isArray(value.type), tool.name).toBe(false);
    }
  });

  it(`keeps optional fields to ${MAX_OPTIONAL_FIELDS} across all tools, inside strict mode's limit`, () => {
    let optional = 0;
    for (const tool of TOOLS)
      for (const [, object] of objects(tool.input_schema))
        optional += Object.keys(object.properties ?? {}).length - (object.required?.length ?? 0);
    expect(optional).toBeLessThanOrEqual(MAX_OPTIONAL_FIELDS);
  });

  it('asks every change for its narration and its plan step (sections 3, 6.4)', () => {
    for (const name of CHANGE_TOOLS.filter((n) => n !== 'code_frame'))
      expect(schemaOf(name).required, name).toEqual(
        expect.arrayContaining(['narration', 'plan_step']),
      );
    for (const name of [...READ_TOOLS, ...PLAN_TOOLS, 'code_frame'])
      expect(Object.keys(schemaOf(name).properties ?? {}), name).not.toContain('plan_step');
  });

  it('has no way to write the story (rule 4): nothing that plans or changes names a story part', () => {
    const writers = TOOLS.filter((t) => !(READ_TOOLS as readonly string[]).includes(t.name));
    const names = writers
      .flatMap((t) => [
        t.name,
        ...[...objects(t.input_schema)].flatMap(([, o]) => [
          ...Object.keys(o.properties ?? {}),
          ...Object.values(o.properties ?? {}).flatMap((p) => p.enum ?? []),
        ]),
      ])
      .map((n) => n.toLowerCase());
    for (const word of ['logline', 'synopsis', 'caption', 'heading', 'script'])
      expect(names.filter((n) => n.includes(word))).toEqual([]);
  });

  it("uses the AST's names for control blocks", () => {
    for (const kind of CONTROL_KINDS) expect(STATEMENT_KINDS).toContain(kind);
    expect(schemaOf('insert_control').properties?.kind?.enum).toEqual(CONTROL_KINDS);
  });

  it("uses the Story API's names for events, leaving out the scene start every scene has", () => {
    expect(LISTENER_EVENTS).toEqual(EVENTS.map((e) => e.name).filter((n) => n !== 'sceneStart'));
    expect(schemaOf('add_event_listener').properties?.event?.enum).toEqual(LISTENER_EVENTS);
  });
});

const good: Readonly<Record<string, unknown>> = {
  add_model: {
    backstage_item: 'Quadruped/Cat/AbyssinianCat',
    name: 'cat',
    position: { x: 0, y: 0, z: 2 },
    scale: 1,
    narration: 'A cat appears in the middle of your scene.',
    plan_step: 1,
  },
  set_property: {
    object: 'cat',
    property: 'opacity',
    value: '0.5',
    narration: 'The cat fades a little.',
    plan_step: 2,
  },
  insert_statement: {
    method: 'scene1',
    position: 'end',
    target: 'owl',
    procedure: 'say',
    arguments: [{ name: 'text', value: 'Here is the key.' }],
    line: 'l4',
    narration: 'The owl says its line.',
    plan_step: 3,
  },
  insert_control: {
    method: 'scene1',
    position: '0',
    kind: 'count',
    count: 3,
    narration: 'A count block will repeat the hop three times.',
    plan_step: 1,
  },
  declare_procedure: { class: 'Scene', name: 'hop', narration: 'A new hop block.', plan_step: 1 },
  add_event_listener: {
    event: 'clickOnObject',
    objects: ['penguin'],
    other_objects: [],
    narration: 'Clicking the penguin will do something.',
    plan_step: 1,
  },
  explain: { text: 'The move block makes something move.' },
  read_project: {},
  check_frame: { frame: 'f2-2' },
  script_check: {},
  propose_plan: {
    frame: 'f2-3',
    steps: [
      {
        words: 'The owl walks to the tree.',
        kind: 'do',
        actor: 'owl',
        action: 'moveTo',
        target: 'tree',
        details: [{ name: 'duration', value: '2' }],
        line: '',
        sketch: 'k4',
        together: false,
        repeat: 1,
        why: 'Your sketch has the owl by the tree.',
      },
    ],
  },
  revise_plan: { plan: 'p1', steps: [] },
  stage_scene: { scene: 's2', narration: 'Your cast takes their places.', plan_step: 1 },
  code_frame: { frame: 'f2-3' },
};

describe('checkToolInput (spec 04, section 1.6)', () => {
  it('has a good example for every tool, which passes', () => {
    expect(Object.keys(good).sort()).toEqual([...TOOL_NAMES].sort());
    for (const [name, input] of Object.entries(good))
      if (name !== 'revise_plan') expect(checkToolInput(name, input), name).toEqual({ ok: true });
  });

  it('refuses a tool it does not know', () => {
    expect(checkToolInput('write_logline', {})).toEqual({
      ok: false,
      message: 'There is no tool called write_logline.',
    });
  });

  const refused = (name: string, input: unknown) => {
    const result = checkToolInput(name, input);
    return result.ok ? null : result.message;
  };
  const withField = (name: string, field: string, value: unknown) => ({
    ...(good[name] as object),
    [field]: value,
  });
  const without = (name: string, field: string) =>
    Object.fromEntries(Object.entries(good[name] as object).filter(([k]) => k !== field));

  it('refuses a missing field, an extra field and a wrong type', () => {
    expect(refused('add_model', without('add_model', 'name'))).toMatch(/name is missing/);
    expect(refused('add_model', withField('add_model', 'colour', 'red'))).toMatch(
      /colour isn't allowed/,
    );
    expect(refused('add_model', withField('add_model', 'scale', '2'))).toMatch(
      /scale should be a number/,
    );
    expect(refused('set_property', withField('set_property', 'property', 'logline'))).toMatch(
      /property should be one of/,
    );
  });

  it('refuses input cut off part way, as a stream at max_tokens leaves it', () => {
    expect(
      refused('add_model', { backstage_item: 'Quadruped/Cat/AbyssinianCat', name: 'c' }),
    ).toMatch(/missing/);
    expect(refused('insert_statement', null)).toMatch(/should be an object/);
  });

  it("checks what strict mode can't: ranges, whole numbers and lengths", () => {
    expect(refused('add_model', withField('add_model', 'scale', 50))).toMatch(/scale/);
    expect(refused('add_model', withField('add_model', 'plan_step', 0))).toMatch(/plan_step/);
    expect(refused('add_model', withField('add_model', 'plan_step', 1.5))).toMatch(/plan_step/);
    expect(refused('insert_control', withField('insert_control', 'count', 0))).toMatch(/count/);
    expect(refused('insert_statement', withField('insert_statement', 'position', 'top'))).toMatch(
      /position/,
    );
    expect(
      refused('add_model', withField('add_model', 'narration', 'word '.repeat(30).trim())),
    ).toMatch(/narration/);
    expect(refused('explain', { text: 'word '.repeat(121).trim() })).toMatch(/text/);
    expect(refused('add_model', withField('add_model', 'name', ''))).toMatch(/name/);
  });

  it('wants between 1 and 12 plan steps', () => {
    expect(refused('propose_plan', { steps: [] })).toMatch(/1 to 12 steps/);
    const step = (good.propose_plan as { steps: unknown[] }).steps[0];
    expect(refused('propose_plan', { steps: Array(13).fill(step) })).toMatch(/1 to 12 steps/);
    expect(refused('revise_plan', { plan: 'p1', steps: [step] })).toBeNull();
  });

  it('checks every plan step, and says which one', () => {
    const [step] = (good.propose_plan as { steps: Record<string, unknown>[] }).steps;
    expect(refused('propose_plan', { steps: [step, { ...step, repeat: 0 }] })).toMatch(
      /steps\[1\]\.repeat/,
    );
    expect(refused('propose_plan', { steps: [{ ...step, words: 'w '.repeat(25) }] })).toMatch(
      /words/,
    );
  });
});

describe('toolResult (spec 04, section 3)', () => {
  it('reports success with the ids it made', () => {
    expect(
      toolResult('toolu_1', { ok: true, ids: { object: 'cat' }, summary: 'Added cat.' }),
    ).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: '{"ok":true,"ids":{"object":"cat"},"summary":"Added cat."}',
    });
  });

  it('reports a failure with its code, marked as an error', () => {
    expect(
      toolResult('toolu_2', { ok: false, error: 'not_in_plan', message: 'Step 2 moves the owl.' }),
    ).toEqual({
      type: 'tool_result',
      tool_use_id: 'toolu_2',
      content: '{"ok":false,"error":"not_in_plan","message":"Step 2 moves the owl."}',
      is_error: true,
    });
  });

  it('has the twelve codes in spec 04', () => {
    expect(TOOL_ERROR_CODES).toHaveLength(12);
    expect(TOOL_ERROR_CODES).toContain('would_break_program');
  });
});
