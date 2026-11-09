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
