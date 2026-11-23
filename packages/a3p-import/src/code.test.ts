import { validateProgram, type Statement } from '@storystage/ast';
import { jointFromAlice } from '@storystage/backstage';
import { checkProgram } from '@storystage/story-api/program-check';
import { describe, expect, it } from 'vitest';
import {
  color,
  constant,
  create,
  field,
  invoke,
  javaMethod,
  javaType,
  method,
  n,
  num,
  on,
  param,
  resource,
  self,
  statement,
  text,
  userType,
  whole,
  world,
} from './alice-testing.ts';
import { buildProgram } from './code.ts';
import type { AliceNode } from './decode.ts';
import { importSetUp } from './world.ts';

// Spec 19, sections 3, 5 and 6, on small decoded worlds in Alice's shapes.

const catType = userType('Cat', javaType('SBiped'));
const cat = field('cat', catType, create(resource('biped', 'Alice')));
const camera = field('camera', javaType('SCamera'));

function build(script: AliceNode[], more: { methods?: AliceNode[]; fields?: AliceNode[] } = {}) {
  const alice = world(
    [camera, cat, ...(more.fields ?? [])],
    [],
    [method('myFirstMethod', script), ...(more.methods ?? [])],
  );
  const built = buildProgram(alice, importSetUp(alice));
  const scene = built.program.types[0]!;
  return { built, scene, body: scene.methods.find((m) => m.id === built.sceneMethod)!.body };
}

const valid = (built: ReturnType<typeof buildProgram>) =>
  validateProgram(built.program, { check: (p) => checkProgram(p) });

describe('calls (spec 19, 5.1)', () => {
  it('go through the Story API’s alice lists, with values and details by name', () => {
    const { built, body } = build([
      statement(
        invoke(
          on(cat),
          javaMethod('SMovableTurnable', 'move'),
          [constant('MoveDirection', 'FORWARD'), num(2)],
          [
            ['Move', 'duration', num(0.5)],
            ['Move', 'animationStyle', constant('AnimationStyle', 'BEGIN_AND_END_ABRUPTLY')],
          ],
        ),
      ),
    ]);
    expect(body[0]).toMatchObject({
      kind: 'call',
      target: { kind: 'fieldRef' },
      callee: { kind: 'story', name: 'move' },
      args: { direction: { kind: 'enum', value: 'forward' }, amount: { kind: 'number', value: 2 } },
      details: {
        duration: { kind: 'number', value: 0.5 },
        animationStyle: { kind: 'enum', type: 'AnimationStyle', value: 'beginAndEndAbruptly' },
      },
    });
    expect(built.gaps).toEqual([]);
    expect(valid(built)).toEqual([]);
  });

  it('call the learner’s own methods, with their parameters', () => {
    const height = param('height', javaType('java.lang.Double'));
    const hop = method(
      'hop',
      [
        statement(
          invoke(on(cat), javaMethod('SMovableTurnable', 'move'), [
            constant('MoveDirection', 'UP'),
            n('ParameterAccess', { parameter: height }),
          ]),
        ),
      ],
      { params: [height] },
    );
    const call = invoke(self(), hop, []);
    (call.props as Record<string, unknown>)['requiredArguments'] = [
      n('SimpleArgument', { parameter: height, expression: num(1) }),
    ];
    const { built, scene, body } = build([statement(call)], { methods: [hop] });
    const hopDecl = scene.methods.find((m) => m.name === 'hop')!;
    expect(hopDecl.params.map((p) => p.name)).toEqual(['height']);
    expect(body[0]).toMatchObject({
      kind: 'call',
      callee: { kind: 'user', method: hopDecl.id },
      args: { [hopDecl.params[0]!.id]: { value: 1 } },
    });
    expect(hopDecl.body[0]).toMatchObject({
      args: { amount: { kind: 'variableRef', variable: hopDecl.params[0]!.id } },
    });
    expect(valid(built)).toEqual([]);
  });

  it('leave a note in place of a block StoryStage left out, saying why (0069, 2)', () => {
    const { built, body } = build([
      statement(invoke(on(cat), javaMethod('SMarker', 'setColorId'), [num(1)]), false),
    ]);
    expect(body[0]).toMatchObject({ kind: 'comment', enabled: false });
    expect((body[0] as { text: string }).text).toMatch(
      /^In Alice: cat set color id\. StoryStage leaves this out\. Aids for Alice’s own scene editor/,
    );
    expect(built.gaps).toEqual([
      expect.objectContaining({ kind: 'block', where: 'Scene.myFirstMethod' }),
    ]);
  });

  it('leave a note for a block StoryStage doesn’t know', () => {
    const { built, body } = build([
      statement(invoke(on(cat), javaMethod('SBiped', 'doTheFandango'))),
    ]);
    expect((body[0] as { text: string }).text).toBe(
      'In Alice: cat do the fandango. StoryStage doesn’t know this Alice block.',
    );
    expect(built.gaps[0]?.kind).toBe('unknown');
  });
});

describe('statements (spec 19, section 2)', () => {
  const say = (words: string) =>
    statement(invoke(on(cat), javaMethod('SModel', 'say'), [text(words)]));
  const local = n('UserLocal', {
    name: 'n',
    valueType: javaType('java.lang.Integer'),
    isFinal: false,
  });
  const read = n('LocalAccess', { local });

  it('come across: if and else if, loops, locals, assignment, notes and switched off', () => {
    const compare = (op: string, right: number) =>
      n('RelationalInfixExpression', {
        leftOperand: read,
        operator: op,
        rightOperand: whole(right),
      });
    const { built, body } = build([
      n('LocalDeclarationStatement', { local, initializer: whole(1), isEnabled: true }),
      n('ConditionalStatement', {
        booleanExpressionBodyPairs: [
          n('BooleanExpressionBodyPair', {
            expression: compare('EQUALS', 1),
            body: n('BlockStatement', { statements: [say('one')] }),
          }),
          n('BooleanExpressionBodyPair', {
            expression: compare('GREATER', 1),
            body: n('BlockStatement', { statements: [say('more')] }),
          }),
        ],
        elseBody: n('BlockStatement', { statements: [say('less')] }),
        isEnabled: true,
      }),
      n('CountLoop', {
        count: whole(3),
        body: n('BlockStatement', { statements: [say('hop')] }),
        isEnabled: true,
      }),
      n('WhileLoop', {
        conditional: compare('LESS', 5),
        body: n('BlockStatement', {
          statements: [
            statement(
              n('AssignmentExpression', {
                leftHandSide: read,
                operator: 'ASSIGN',
                rightHandSide: n('ArithmeticInfixExpression', {
                  leftOperand: read,
                  operator: 'PLUS',
                  rightOperand: whole(1),
                }),
              }),
            ),
          ],
        }),
        isEnabled: true,
      }),
      n('DoTogether', {
        body: n('BlockStatement', { statements: [say('a'), say('b')] }),
        isEnabled: true,
      }),
      n('Comment', { text: 'Now the cat waits', isEnabled: true }),
      { ...say('hidden'), props: { ...say('hidden').props, isEnabled: false } },
    ]);
    expect(body.map((s) => s.kind)).toEqual([
      'local',
      'if',
      'count',
      'while',
      'doTogether',
      'comment',
      'call',
    ]);
    const branch = body[1] as Extract<Statement, { kind: 'if' }>;
    expect(branch.condition).toMatchObject({ kind: 'compare', op: 'equal' });
    expect(branch.else[0]).toMatchObject({
      kind: 'if',
      condition: { op: 'greater' },
      else: [{ kind: 'call' }],
    });
    expect(body[3]).toMatchObject({
      body: [{ kind: 'assign', value: { kind: 'arithmetic', op: 'add' } }],
    });
    expect(body[6]!.enabled).toBe(false);
    expect(built.gaps).toEqual([]);
    expect(valid(built)).toEqual([]);
  });
});

describe('values (spec 19, 5.3)', () => {
  const sky = (c: AliceNode) =>
    statement(invoke(self(), javaMethod('SScene', 'setAtmosphereColor'), [c]));

  it('names Alice’s colours, and a mixed one by the nearest, reported', () => {
    const { built, body } = build([
      sky(constant('Color', 'DARK_GRAY')),
      sky(color(1, 0, 0)),
      sky(color(0.5, 0.45, 0.5)),
    ]);
    expect(
      body.map((s) => (s as unknown as { args: { color: { value: string } } }).args.color.value),
    ).toEqual(['darkGray', 'red', 'gray']);
    expect(built.gaps).toEqual([
      // In the words learners see in the blocks: en-GB.
      expect.objectContaining({ kind: 'value', why: expect.stringMatching(/nearest, grey,/) }),
    ]);
  });

  it('reports a value StoryStage doesn’t have, and the block keeps its usual one', () => {
    const { built } = build([
      statement(
        invoke(on(cat), javaMethod('SMovableTurnable', 'move'), [
          constant('MoveDirection', 'SIDEWAYS'),
          num(1),
        ]),
      ),
    ]);
    expect(built.gaps.map((g) => g.kind)).toEqual(['value', 'value']);
  });
});

describe('joints (spec 19, 5.2)', () => {
  it('become getJoint through the joint map, Alice’s generated getters too', () => {
    const elbow = invoke(on(cat), javaMethod('SJointedModel', 'getJoint'), [
      constant('resources.BipedResource', 'LEFT_ELBOW'),
    ]);
    const getter = method('getLeftFlap', [], { level: 'MANAGED', returns: javaType('SJoint') });
    const flap = invoke(on(cat), getter);
    const turn = (joint: AliceNode) =>
      statement(
        invoke(joint, javaMethod('STurnable', 'turn'), [
          constant('TurnDirection', 'LEFT'),
          num(0.25),
        ]),
      );
    const { body } = build([turn(elbow), turn(flap)]);
    expect(body[0]).toMatchObject({
      callee: { name: 'turn' },
      target: {
        kind: 'functionCall',
        callee: { name: 'getJoint' },
        args: { joint: { value: jointFromAlice('biped', 'LEFT_ELBOW') } },
      },
    });
    expect(body[1]).toMatchObject({ target: { args: { joint: { value: 'leftFlap' } } } });
  });
});

describe('events (spec 19, section 6)', () => {
  const listen = (alice: string, statements: AliceNode[], event?: AliceNode) =>
    statement(
      invoke(self(), javaMethod('SScene', alice), [
        n('LambdaExpression', {
          value: n('UserLambda', {
            requiredParameters: event ? [event] : [],
            body: n('BlockStatement', { statements }),
          }),
        }),
      ]),
    );

  it('keep a scene-start listener that does more, without its call to the script', () => {
    const script = method('myFirstMethod', []);
    const start = listen('addSceneActivationListener', [
      statement(invoke(self(), script)),
      statement(invoke(on(cat), javaMethod('SModel', 'say'), [text('Ready')])),
    ]);
    const init = method('initializeEventListeners', [start], { level: 'MANAGED' });
    const alice = world([camera, cat], [], [script, init]);
    // The call names the very `myFirstMethod` the scene holds.
    const sceneType = (alice.props['fields'] as AliceNode[])[0]!.props['valueType'] as AliceNode;
    const held = (sceneType.props['methods'] as AliceNode[]).find(
      (m) => m.props['name'] === 'myFirstMethod',
    )!;
    const lambda = (
      (start.props['expression'] as AliceNode).props['requiredArguments'] as AliceNode[]
    )[0]!.props['expression'] as AliceNode;
    (lambda.props as Record<string, unknown>)['value'] = n('UserLambda', {
      requiredParameters: [],
      body: n('BlockStatement', {
        statements: [
          statement(invoke(self(), held)),
          statement(invoke(on(cat), javaMethod('SModel', 'say'), [text('Ready')])),
        ],
      }),
    });
    const built = buildProgram(alice, importSetUp(alice));
    const [listener] = built.program.types[0]!.listeners;
    expect(listener!.event).toBe('sceneStart');
    expect(listener!.body).toHaveLength(1);
    expect(listener!.body[0]).toMatchObject({ callee: { name: 'say' } });
    expect(built.gaps).toContainEqual(
      expect.objectContaining({ kind: 'event', what: 'when the scene starts: myFirstMethod' }),
    );
  });

  it('become listeners; one that only starts the script goes, as StoryStage starts it anyway', () => {
    const event = param('event', javaType('org.lgna.story.event.MouseClickOnObjectEvent'));
    const clicked = invoke(
      n('ParameterAccess', { parameter: event }),
      javaMethod('event.MouseClickOnObjectEvent', 'getModelAtMouseLocation'),
    );
    const init = method(
      'initializeEventListeners',
      [
        listen('addSceneActivationListener', [
          statement(invoke(self(), method('myFirstMethod', []))),
        ]),
        listen(
          'addMouseClickOnObjectListener',
          [statement(invoke(clicked, javaMethod('SModel', 'say'), [text('Ouch')]))],
          event,
        ),
      ],
      { level: 'MANAGED' },
    );
    const alice = world([camera, cat], [], [method('myFirstMethod', []), init]);
    // The scene-start listener calls the very `myFirstMethod` the scene holds.
    const sceneType = (alice.props['fields'] as AliceNode[])[0]!.props['valueType'] as AliceNode;
    const script = (sceneType.props['methods'] as AliceNode[]).find(
      (m) => m.props['name'] === 'myFirstMethod',
    )!;
    const first = (init.props['body'] as AliceNode).props['statements'] as AliceNode[];
    const lambda = (
      (first[0]!.props['expression'] as AliceNode).props['requiredArguments'] as AliceNode[]
    )[0]!.props['expression'] as AliceNode;
    (lambda.props as Record<string, unknown>)['value'] = n('UserLambda', {
      requiredParameters: [],
      body: n('BlockStatement', { statements: [statement(invoke(self(), script))] }),
    });
    const built = buildProgram(alice, importSetUp(alice));
    const listeners = built.program.types[0]!.listeners;
    expect(listeners.map((l) => l.event)).toEqual(['clickOnObject']);
    const model = listeners[0]!.params.find((p) => p.name === 'model')!;
    expect(listeners[0]!.body[0]).toMatchObject({
      callee: { name: 'say' },
      target: { kind: 'variableRef', variable: model.id },
    });
  });
});

describe('classes (spec 19, 3.4–3.5)', () => {
  it('keeps a gallery class the learner wrote in, with only the learner’s members', () => {
    const dance = method('dance', [
      statement(
        invoke(self(), javaMethod('SMovableTurnable', 'move'), [
          constant('MoveDirection', 'UP'),
          num(1),
        ]),
      ),
    ]);
    const own = userType('Cat', javaType('SBiped'), {
      methods: [dance, method('setAliceResource', [], { level: 'MANAGED' })],
    });
    const ownCat = field('cat', own, create(resource('biped', 'Alice')));
    const alice = world([camera, ownCat], [], [method('myFirstMethod', [])]);
    const built = buildProgram(alice, importSetUp(alice));
    const [scene, kept] = built.program.types;
    expect(kept).toMatchObject({
      name: 'Cat',
      extends: { kind: 'story', name: 'Biped' },
      methods: [{ name: 'dance' }],
    });
    expect(scene!.fields.find((f) => f.name === 'cat')!.type).toEqual({
      kind: 'user',
      type: kept!.id,
    });
    expect(valid(built)).toEqual([]);
  });
});

describe('a procedure’s inputs (found reviewing #642)', () => {
  /** `show(given)`, taking a `type`, and the script passing it `value`. */
  const passing = (type: AliceNode, value: AliceNode) => {
    const given = param('given', type);
    const show = method('show', [], { params: [given] });
    const call = n('MethodInvocation', {
      expression: self(),
      method: show,
      requiredArguments: [n('SimpleArgument', { expression: value, parameter: given })],
      keyedArguments: [],
    });
    const made = build([statement(call)], { methods: [show] });
    const input = made.scene.methods.find((m) => m.name === 'show')!.params[0]!;
    return { ...made, input };
  };
  const resourceValue = () => n('ResourceExpression', {});

  it('keeps paint as paint, so a colour fits it', () => {
    const { built, input } = passing(javaType('Paint'), constant('Color', 'RED'));
    expect(input.type).toEqual({ kind: 'story', name: 'Paint' });
    expect(built.gaps).toEqual([]);
    expect(valid(built)).toEqual([]);
  });

  it('keeps a sound as a sound, and says when the call’s sound couldn’t come across', () => {
    const { built, body, input } = passing(javaType('AudioSource'), resourceValue());
    expect(input.type).toEqual({ kind: 'story', name: 'Audio' });
    expect(Object.values((body[0] as Statement & { kind: 'call' }).args)).toMatchObject([
      { kind: 'none' },
    ]);
    expect(built.gaps).toMatchObject([
      {
        kind: 'value',
        where: 'Scene.myFirstMethod',
        why: expect.stringContaining('choosing again'),
      },
    ]);
    expect(valid(built)).toEqual([]);
  });

  it('keeps a list of sounds as one', () => {
    const list = n(
      'JavaType',
      {},
      { java: { kind: 'type', name: '[Lorg.lgna.story.AudioSource;' } },
    );
    const show = method('show', [], { params: [param('given', list)] });
    const { scene } = build([], { methods: [show] });
    expect(scene.methods.find((m) => m.name === 'show')!.params[0]!.type).toEqual({
      kind: 'array',
      of: { kind: 'story', name: 'Audio' },
    });
  });

  it('reports an input of a type StoryStage hasn’t got, and the value passed to it', () => {
    const { built, input } = passing(javaType('Position'), resourceValue());
    expect(input.type).toEqual({ kind: 'story', name: 'Thing' });
    expect(built.gaps).toMatchObject([
      { kind: 'value', where: 'Scene.show', what: 'input given, a kind of position' },
      { kind: 'value', where: 'Scene.myFirstMethod' },
    ]);
    expect(valid(built)).toEqual([]);
  });

  it('says nothing of an input that takes any object', () => {
    const { built, input } = passing(javaType('SThing'), on(cat));
    expect(input.type).toEqual({ kind: 'story', name: 'Thing' });
    expect(built.gaps).toEqual([]);
  });
});

describe('3D text (format 1.10.0)', () => {
  // The class is Text, and as a type it's TextModel, as Text is words (spec 02, section 1, rule 3).
  const title = field('title', javaType('STextModel'));

  it('types a 3D text object TextModel, so its own blocks fit it', () => {
    const { built, scene } = build(
      [statement(invoke(on(title), javaMethod('STextModel', 'setValue'), [text('Hello')]))],
      { fields: [title] },
    );
    expect(scene.fields.find((f) => f.name === 'title')!.type).toEqual({
      kind: 'story',
      name: 'TextModel',
    });
    expect(built.gaps).toEqual([]);
    expect(valid(built)).toEqual([]);
  });

  it('types an input of 3D text TextModel, and one of words Text', () => {
    const show = method('show', [], {
      params: [param('sign', javaType('STextModel')), param('words', javaType('java.lang.String'))],
    });
    const { built, scene } = build([], { methods: [show] });
    expect(scene.methods.find((m) => m.name === 'show')!.params.map((p) => p.type)).toEqual([
      { kind: 'story', name: 'TextModel' },
      { kind: 'story', name: 'Text' },
    ]);
    expect(valid(built)).toEqual([]);
  });

  it('has a learner’s class of 3D text extend TextModel', () => {
    // A class is kept when the learner wrote in it (spec 19, 3.4), so this one has a move.
    const own = userType('Sign', javaType('STextModel'), { methods: [method('flash', [])] });
    const sign = field('sign', own);
    const alice = world([camera, sign], [], [method('myFirstMethod', [])]);
    const built = buildProgram(alice, importSetUp(alice));
    const [scene, kept] = built.program.types;
    expect(kept).toMatchObject({ name: 'Sign', extends: { kind: 'story', name: 'TextModel' } });
    expect(scene!.fields.find((f) => f.name === 'sign')!.type).toEqual({
      kind: 'user',
      type: kept!.id,
    });
    expect(valid(built)).toEqual([]);
  });
});
