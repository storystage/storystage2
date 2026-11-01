import { describe, expect, it } from 'vitest';
import palette from '../alice/palette.json';
import {
  API_CLASSES,
  catalogText,
  checkCall,
  classChain,
  entriesOf,
  findEntry,
  findEvent,
  fits,
  inRange,
  isKindOf,
} from './catalog.ts';
import { MOVE_AXES, ROLL_AXES, TURN_AXES } from './axes.ts';
import { DETAILS, IGNORED_DETAILS } from './details.ts';
import { CLASS_MAP, DROPPED, DROPPED_VALUES, JOINT_GETTERS } from './dropped.ts';
import { ENTRIES, STAGE_NEEDS } from './entries.ts';
import { EVENTS } from './events.ts';
import { ADDED_ENUMS, BASIC_TYPES, ENUMS, REFERENCE_TYPES } from './types.ts';
import type { EnumName, TypeName } from './types.ts';
import words from '../strings/en-GB.json';
import { STORY_CLASSES, type Vec3 } from '../vocabulary.ts';

const members = palette.classes.flatMap((c) => c.members.map((m) => ({ cls: c.name, ...m })));
const id = (m: { cls: string; name: string }) => `${m.cls}.${m.name}`;

const covered = new Set([
  ...ENTRIES.flatMap((e) => e.alice),
  ...EVENTS.flatMap((e) => e.alice),
  ...EVENTS.flatMap((e) => e.gives.flatMap((g) => g.alice ?? [])),
]);
const droppedNames = new Set(DROPPED.flatMap((g) => g.members));
const isDropped = (m: { cls: string; name: string }) =>
  droppedNames.has(id(m)) || droppedNames.has(`${m.cls}.*`);
const isJointGetter = (m: { returns: string }) => m.returns in JOINT_GETTERS;

/** `IN_FRONT_OF` is `inFrontOf`; `DIGIT_0` is `digit0`. */
const camel = (constant: string) =>
  constant.toLowerCase().replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());

describe('nothing from Alice goes missing (4.1: anything dropped or added is listed)', () => {
  it('accounts for every palette member', () => {
    const lost = members.filter((m) => !covered.has(id(m)) && !isDropped(m) && !isJointGetter(m));
    expect(lost.map(id)).toEqual([]);
  });

  it('never both keeps and drops a member', () => {
    expect(members.filter((m) => covered.has(id(m)) && isDropped(m)).map(id)).toEqual([]);
  });

  it('names only real palette members', () => {
    const real = new Set(members.map(id));
    const named = [...covered, ...droppedNames].filter((n) => !n.endsWith('.*'));
    expect(named.filter((n) => !real.has(n))).toEqual([]);
  });

  it('places every Alice class', () => {
    expect(palette.classes.filter((c) => /^S[A-Z]/.test(c.name) && !(c.name in CLASS_MAP))).toEqual(
      [],
    );
  });

  it('turns every joint getter into one function', () => {
    expect(findEntry('Biped', 'getJoint')?.kind).toBe('function');
    expect(findEntry('Quadruped', 'getJointChain')?.kind).toBe('function');
    expect(members.filter(isJointGetter).length).toBeGreaterThan(100);
  });

  it('accounts for every value of every enumeration', () => {
    const wrong: string[] = [];
    for (const [type, constants] of Object.entries(palette.values)) {
      const dropped = DROPPED_VALUES[type];
      if (dropped === 'rest') continue;
      const ours = type in ENUMS ? ENUMS[type as EnumName] : [];
      for (const constant of constants) {
        if (!dropped?.includes(constant) && !(ours as readonly string[]).includes(camel(constant)))
          wrong.push(`${type}.${constant}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps only real values where it keeps a subset', () => {
    const real = palette.values.Key.map(camel);
    expect(ENUMS.Key.filter((k) => !real.includes(k))).toEqual([]);
  });

  it('adds only the enumerations it says it adds', () => {
    const fromAlice = Object.keys(palette.values);
    const added = Object.keys(ENUMS).filter((name) => !fromAlice.includes(name));
    expect(added.sort()).toEqual([...ADDED_ENUMS].sort());
  });

  it('marks every entry with no Alice origin as an addition', () => {
    const noOrigin = ENTRIES.filter((e) => e.alice.length === 0 && e.task === '4.3');
    expect(noOrigin.map((e) => e.name).sort()).toEqual(['getJoint', 'getJointChain']);
    expect(ENTRIES.filter((e) => e.task !== '4.3' && e.alice.length > 0)).toEqual([]);
  });
});

describe('entries match Alice', () => {
  const aliceMember = (name: string) => members.find((m) => id(m) === name)!;

  it('keeps Alice parameter names, unless the entry is a merge of several', () => {
    const wrong = ENTRIES.flatMap((e) =>
      e.alice
        .filter((a) => {
          const given = aliceMember(a).params.map((p) => p.name);
          return given.join() !== e.params.map((p) => p.name).join();
        })
        .map((a) => `${e.on}.${e.name} from ${a}`),
    );
    expect(wrong).toEqual([]);
  });

  it('offers every detail Alice offers, except those she ignores', () => {
    const wrong: string[] = [];
    for (const e of ENTRIES) {
      for (const a of e.alice) {
        const keyword = aliceMember(a).details;
        const details = keyword ? palette.keywords[keyword as keyof typeof palette.keywords] : {};
        for (const d of Object.keys(details)) {
          if (!e.details.includes(d) && !IGNORED_DETAILS.includes(`${a}.${d}`))
            wrong.push(`${a}.${d}`);
        }
        for (const d of e.details) if (!(d in details)) wrong.push(`extra ${a}.${d}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps the kind of each block', () => {
    const wrong = ENTRIES.flatMap((e) =>
      e.alice.filter((a) => aliceMember(a).kind !== e.kind).map((a) => a),
    );
    expect(wrong).toEqual([]);
  });
});

describe('the metadata holds together', () => {
  it('has no two entries with one name on a class', () => {
    const names = ENTRIES.map((e) => `${e.on}.${e.name}`);
    expect(names.length).toBe(new Set(names).size);
  });

  it('uses only details that exist', () => {
    const named = [...ENTRIES, ...EVENTS].flatMap((e) => e.details);
    expect(named.filter((d) => !(d in DETAILS))).toEqual([]);
  });

  it('gives every default a value of its type, or says what it means', () => {
    for (const [name, d] of Object.entries(DETAILS)) {
      if (d.default === null) expect(d.defaultMeans, name).toBeTruthy();
      if (d.type in ENUMS) {
        expect(ENUMS[d.type as EnumName] as readonly unknown[], name).toContain(d.default);
      }
    }
  });

  it('explains every need of the stage, and needs nothing unexplained', () => {
    const used = [
      ...ENTRIES.map((e) => e.runs as string),
      ...EVENTS.map((e) => e.from as string),
    ].filter((r) => r.startsWith('needs:'));
    const needs = new Set(used.map((r) => r.slice('needs:'.length)));
    expect([...needs].sort()).toEqual(Object.keys(STAGE_NEEDS).sort());
  });

  it('records an Unreal concept for every entry and event (4.7)', () => {
    const blank = [...ENTRIES, ...EVENTS].filter((e) => !e.unreal.trim());
    expect(blank).toEqual([]);
  });

  it('uses the same BML names as the crosswalk (4.7)', () => {
    const bml = new Set([
      'wait',
      'gaze',
      'pointing',
      'locomotion',
      'speech',
      'posture',
      'gesture',
      'faceLexeme',
    ]);
    expect(ENTRIES.filter((e) => e.bml && !bml.has(e.bml))).toEqual([]);
  });

  it('covers every concrete story class', () => {
    for (const cls of STORY_CLASSES) {
      expect(API_CLASSES).toContain(cls);
      expect(entriesOf(cls).length, cls).toBeGreaterThan(0);
    }
  });
});

describe('display words', () => {
  const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
  const all = words as Record<string, string>;
  /** The strings under a prefix, by the rest of their key. */
  const group = (prefix: string) =>
    Object.fromEntries(
      Object.entries(all)
        .filter(([key]) => key.startsWith(`${prefix}.`))
        .map(([key, text]) => [key.slice(prefix.length + 1), text]),
    );

  it('has a word for every class', () => {
    expect(Object.keys(group('class')).sort()).toEqual([...API_CLASSES].sort());
  });

  it('has one phrase per entry, with a place for each parameter', () => {
    const phrases = group('entry');
    expect(Object.keys(phrases).sort()).toEqual(ENTRIES.map((e) => `${e.on}.${e.name}`).sort());
    for (const e of ENTRIES) {
      const phrase = phrases[`${e.on}.${e.name}`]!;
      expect(placeholders(phrase).sort(), phrase).toEqual(e.params.map((p) => p.name).sort());
    }
  });

  it('has one phrase per event, with a place for each thing it needs', () => {
    const phrases = group('event');
    expect(Object.keys(phrases).sort()).toEqual(EVENTS.map((e) => e.name).sort());
    for (const e of EVENTS) {
      expect(placeholders(phrases[e.name]!).sort(), e.name).toEqual(
        e.args.map((a) => a.name).sort(),
      );
    }
  });

  it('has a word for every parameter, detail and value, and none left over', () => {
    const params = new Set(
      [...ENTRIES.flatMap((e) => e.params), ...EVENTS.flatMap((e) => [...e.args, ...e.gives])].map(
        (p) => p.name,
      ),
    );
    expect(Object.keys(group('param')).sort()).toEqual([...params].sort());
    expect(Object.keys(group('detail')).sort()).toEqual(Object.keys(DETAILS).sort());
    for (const [name, values] of Object.entries(ENUMS)) {
      expect(Object.keys(group(`value.${name}`)).sort(), name).toEqual([...values].sort());
    }
  });

  it('keeps to the plain words of rule 9', () => {
    const text = Object.values(all).join('\n').toLowerCase();
    for (const banned of ['ast', 'node', 'field', 'invocation', 'token', 'schema', 'api']) {
      expect(text, banned).not.toMatch(new RegExp(`\\b${banned}\\b`));
    }
  });

  it('uses British spelling', () => {
    expect(all['value.Color.darkGray']).toBe('dark grey');
    expect(all['value.BubblePosition.center']).toBe('centre');
  });
});

describe('classes', () => {
  it('walks a class up to Thing', () => {
    expect(classChain('Biped')).toEqual([
      'Biped',
      'JointedModel',
      'Model',
      'MovableTurnable',
      'Turnable',
      'Thing',
    ]);
  });

  it('lets a joint turn but not move, and the ground do neither', () => {
    expect(findEntry('Joint', 'turn')).toBeDefined();
    expect(findEntry('Joint', 'move')).toBeUndefined();
    expect(findEntry('Ground', 'turn')).toBeUndefined();
  });

  it('gives each class its own blocks and its parents’', () => {
    const biped = entriesOf('Biped').map((e) => e.name);
    expect(biped).toEqual(expect.arrayContaining(['walkTo', 'getJoint', 'say', 'move', 'delay']));
    expect(entriesOf('Prop').map((e) => e.name)).not.toContain('walkTo');
    expect(findEntry('Flyer', 'spreadWings')).toBeDefined();
    expect(findEntry('Biped', 'spreadWings')).toBeUndefined();
  });

  it('knows kinds', () => {
    expect(isKindOf('Biped', 'Model')).toBe(true);
    expect(isKindOf('Camera', 'Model')).toBe(false);
  });
});

describe('fits', () => {
  it.each<[TypeName, TypeName, boolean]>([
    ['Number', 'Number', true],
    ['WholeNumber', 'Number', true],
    ['Number', 'WholeNumber', false],
    ['Color', 'Paint', true],
    ['Biped', 'Thing', true],
    ['Biped', 'Model', true],
    ['Thing', 'Biped', false],
    ['Joint', 'Thing', true],
    ['Marker', 'Thing', true],
    ['TextModel', 'Model', true],
    ['Text', 'Thing', false],
    ['Text', 'TextModel', false],
    ['Biped[]', 'Thing[]', true],
    ['Biped', 'Thing[]', false],
    ['Number', 'Text', false],
  ])('%s into %s: %s', (value, wanted, expected) => {
    expect(fits(value, wanted)).toBe(expected);
  });

  it('knows every basic and reference type by name', () => {
    for (const t of [...BASIC_TYPES, ...REFERENCE_TYPES]) expect(fits(t, t)).toBe(true);
  });
});

describe('limits', () => {
  it.each([
    ['portion', 0, true],
    ['portion', 1, true],
    ['portion', 1.1, false],
    ['portion', -0.1, false],
    ['positive', 0, false],
    ['positive', 0.5, true],
    ['positiveOrZero', 0, true],
    ['positiveOrZero', -1, false],
  ] as const)('%s, %s: %s', (range, value, expected) => {
    expect(inRange(value, range)).toBe(expected);
  });

  it('carries Alice’s limits', () => {
    const range = (cls: 'Model' | 'Thing', name: string) => findEntry(cls, name)?.params[0]?.range;
    expect(range('Model', 'setOpacity')).toBe('portion');
    expect(range('Model', 'resize')).toBe('positive');
    expect(range('Model', 'setWidth')).toBe('positive');
    expect(DETAILS['duration']?.range).toBe('positiveOrZero');
  });
});

describe('directions, in glTF axes (a model faces +Z, Y up, right-handed)', () => {
  const cross = (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y + 0,
    y: a.z * b.x - a.x * b.z + 0,
    z: a.x * b.y - a.y * b.x + 0,
  });
  /** Where a quarter turn about `axis` sends a perpendicular `v`. */
  const quarterTurn = cross;

  it('points forward along +Z and left along +X', () => {
    expect(MOVE_AXES.forward).toEqual({ x: 0, y: 0, z: 1 });
    expect(MOVE_AXES.left).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('is right-handed, with up from left and forward', () => {
    expect(cross(MOVE_AXES.forward, MOVE_AXES.left)).toEqual(MOVE_AXES.up);
  });

  it('turning left swings the front to the left', () => {
    expect(quarterTurn(TURN_AXES.left, MOVE_AXES.forward)).toEqual(MOVE_AXES.left);
    expect(quarterTurn(TURN_AXES.right, MOVE_AXES.forward)).toEqual(MOVE_AXES.right);
  });

  it('turning forward tips the top to the front', () => {
    expect(quarterTurn(TURN_AXES.forward, MOVE_AXES.up)).toEqual(MOVE_AXES.forward);
    expect(quarterTurn(TURN_AXES.backward, MOVE_AXES.up)).toEqual(MOVE_AXES.backward);
  });

  it('rolling left tips the top to the left', () => {
    expect(quarterTurn(ROLL_AXES.left, MOVE_AXES.up)).toEqual(MOVE_AXES.left);
    expect(quarterTurn(ROLL_AXES.right, MOVE_AXES.up)).toEqual(MOVE_AXES.right);
  });
});

describe('checkCall', () => {
  const good = { direction: 'MoveDirection', amount: 'Number' } as const;

  it('accepts a good call', () => {
    expect(checkCall({ on: 'Biped', name: 'move', args: good })).toEqual([]);
  });

  it('accepts details the block has', () => {
    const details = { duration: 'WholeNumber', asSeenBy: 'Camera' } as const;
    expect(checkCall({ on: 'Biped', name: 'move', args: good, details })).toEqual([]);
  });

  it('refuses a block the class doesn’t have', () => {
    expect(checkCall({ on: 'Prop', name: 'walkTo', args: { target: 'Thing' } })).toEqual([
      { code: 'unknown_block' },
    ]);
  });

  it('asks for every required value', () => {
    expect(checkCall({ on: 'Biped', name: 'move', args: { amount: 'Number' } })).toEqual([
      { code: 'missing_value', name: 'direction' },
    ]);
  });

  it('refuses a value of the wrong type', () => {
    const args = { direction: 'MoveDirection', amount: 'Text' } as const;
    expect(checkCall({ on: 'Biped', name: 'move', args })).toEqual([
      { code: 'wrong_type', name: 'amount' },
    ]);
  });

  it('refuses a parameter or detail the block doesn’t have', () => {
    const args = { ...good, speed: 'Number' } as const;
    const details = { pathStyle: 'PathStyle' } as const;
    expect(checkCall({ on: 'Biped', name: 'move', args, details })).toEqual([
      { code: 'unknown_value', name: 'speed' },
      { code: 'unknown_value', name: 'pathStyle' },
    ]);
  });

  it('allows a value whose type isn’t known yet', () => {
    const args = { direction: null, amount: null };
    expect(checkCall({ on: 'Biped', name: 'move', args })).toEqual([]);
  });
});

describe('events', () => {
  it('finds an event by name', () => {
    expect(findEvent('timer')?.args).toEqual([{ name: 'seconds', type: 'Number' }]);
    expect(findEvent('whenPigsFly')).toBeUndefined();
  });
});

describe('catalogText', () => {
  const text = catalogText();

  it('lists blocks with parameters, details and results', () => {
    expect(text).toContain(
      'proc move(direction: MoveDirection, amount: Number; duration?, animationStyle?, asSeenBy?)',
    );
    expect(text).toContain('func isCollidingWith(other: Thing) -> Boolean');
    expect(text).toContain('class Biped extends JointedModel');
    expect(text).toContain('MoveDirection: left, right, up, down, forward, backward');
    expect(text).toContain('timer(seconds: Number) gives seconds: Number');
  });

  it('stays well under the Prompter’s budget of 40,000 tokens', () => {
    // Three characters a token is a cautious guess: names like this split into short tokens.
    expect(text.length / 3).toBeLessThan(40_000);
  });

  it('never carries Alice’s class names', () => {
    expect(text).not.toMatch(/\bS(Thing|Biped|Model)\b/);
  });
});
