/**
 * WP4.2: the Story API's check on a whole program, for `check` in `validateProgram` and the edit
 * session (spec 01, section 4.5; spec 02, section 9a). S2's rules have already passed when this
 * runs, so ids are unique and every reference resolves: `ast` looks after structure, and this
 * looks after meaning. Everything is `outside`, with a `reason` in plain words, which is what the
 * learner sees when an edit is refused.
 *
 * A wrong refusal stops a learner working, so a type that can't be known passes: an empty slot
 * (`none`) never refuses anything.
 *
 * Reached by `@storystage/story-api/program-check`, so that only what needs it depends on `ast`.
 */
import { walk } from '@storystage/ast';
import { BOOLEAN, NUMBER, programTypes, storyType as story, WHOLE } from './program-types.ts';
import type {
  Args,
  AstNode,
  Call,
  Expression,
  FunctionCall,
  ListenerDecl,
  NodeId,
  Problem,
  Program,
  TypeRef,
} from '@storystage/ast';
import {
  checkValues,
  enumValues,
  findEntry,
  findEvent,
  isEnumName,
  isStoryType,
} from './catalog.ts';
import type { CallProblem } from './catalog.ts';
import { STORY_CLASSES } from '../vocabulary.ts';
import words from '../strings/en-GB.json' with { type: 'json' };

export interface ProgramCheckOptions {
  /**
   * Whether the model a scene puts in a field has a joint (spec 02, section 5, rule 3). A
   * program doesn't say which model that is, so the caller asks the scene and the manifest.
   */
  readonly jointExists?: (field: NodeId, joint: string) => boolean;
  /**
   * Whether the production has a scene with this id (WP8.3). A scene id in a program is text, so
   * one can outlive its scene: deleting a scene is refused only while code uses its type.
   */
  readonly sceneExists?: (scene: string) => boolean;
}

/** Classes a learner's class can extend. The `Text` class is `TextModel` as a type. */
const EXTENDABLE: ReadonlySet<string> = new Set([
  ...STORY_CLASSES.filter((c) => c !== 'Text'),
  'TextModel',
]);

const allWords = words as Readonly<Record<string, string>>;
const reason = (key: string, word = '') => (allWords[`check.${key}`] ?? '').replace('{word}', word);
const wordFor = (name: string) => allWords[`param.${name}`] ?? allWords[`detail.${name}`] ?? name;

const REASON_OF_CALL_PROBLEM = {
  unknown_block: 'unknownBlock',
  missing_value: 'missingValue',
  unknown_value: 'unknownValue',
  wrong_type: 'wrongType',
} as const;

/** Everything wrong with a program as far as the Story API can tell. Empty means it's fine. */
export function checkProgram(
  program: Program,
  options: ProgramCheckOptions = {},
): readonly Problem[] {
  const problems: Problem[] = [];
  const add = (node: NodeId, key: string, message: string, name?: string, word?: string) =>
    problems.push({
      code: 'outside',
      message,
      node,
      reason: reason(key, word ?? wordFor(name ?? '')),
      ...(name === undefined ? {} : { name }),
    });

  const { methods, storyName, classOf, typeFits, typeOf } = programTypes(program);

  const named = (args: Args, self: TypeRef) =>
    Object.fromEntries(
      Object.entries(args).map(([name, value]) => {
        const type = typeOf(value, self);
        return [name, type === null ? null : storyName(type)];
      }),
    );

  const report = (at: NodeId, found: readonly CallProblem[], about: string) => {
    for (const { code, name } of found)
      add(at, REASON_OF_CALL_PROBLEM[code], `${about}: ${code}.`, name ?? about, name);
  };

  const typeRef = (type: TypeRef, at: NodeId) => {
    if (type.kind === 'array') typeRef(type.of, at);
    else if (type.kind === 'story' && !isStoryType(type.name))
      add(at, 'unknownType', `There is no type ${type.name}.`, type.name, '');
  };

  const fit = (e: Expression, wanted: TypeRef, self: TypeRef, at: NodeId) => {
    if (!typeFits(typeOf(e, self), wanted))
      add(at, 'wrongHere', `This doesn't fit a ${JSON.stringify(wanted)}.`);
  };

  const storyCall = (node: Call | FunctionCall, name: string, self: TypeRef) => {
    const target = typeOf(node.target, self);
    if (target === null) return;
    const cls = classOf(target);
    const entry = cls && findEntry(cls, name);
    if (!cls || !entry) {
      add(node.id, 'unknownBlock', `${cls ?? 'This'} has no ${name}.`, name, '');
      return;
    }
    if (entry.kind === 'function' && node.kind === 'call')
      add(node.id, 'givesAValue', `${name} is a function, so it needs a place to go.`, name, '');
    if (entry.kind === 'procedure' && node.kind === 'functionCall')
      add(node.id, 'noValue', `${name} is a procedure, so it has no value.`, name, '');
    report(
      node.id,
      checkValues(entry.params, entry.details, named(node.args, self), named(node.details, self)),
      name,
    );
    const joint = node.args['joint'];
    if (
      name === 'getJoint' &&
      joint?.kind === 'enum' &&
      node.target.kind === 'fieldRef' &&
      options.jointExists?.(node.target.field, joint.value) === false
    )
      add(node.id, 'noSuchJoint', `There is no joint ${joint.value}.`, joint.value, '');
    for (const p of entry.params) {
      const scene = node.args[p.name];
      if (
        p.type === 'SceneId' &&
        scene?.kind === 'text' &&
        options.sceneExists?.(scene.value) === false
      )
        add(node.id, 'noSuchScene', `There is no scene ${scene.value}.`, p.name, scene.value);
    }
  };

  const userCall = (node: Call | FunctionCall, method: NodeId, self: TypeRef) => {
    const found = methods.get(method);
    if (!found) return;
    const target = typeOf(node.target, self);
    if (target !== null && !typeFits(target, { kind: 'user', type: found.owner.id }))
      add(
        node.id,
        'notOnThis',
        `${found.method.name} isn't on this object.`,
        found.method.name,
        '',
      );
    for (const parameter of found.method.params) {
      const value = node.args[parameter.id];
      if (value && !typeFits(typeOf(value, self), parameter.type))
        add(
          node.id,
          'wrongType',
          `${parameter.name} is the wrong type.`,
          parameter.name,
          parameter.name,
        );
    }
  };

  const listener = (node: ListenerDecl, self: TypeRef) => {
    const event = findEvent(node.event);
    if (!event) {
      add(node.id, 'unknownEvent', `There is no event ${node.event}.`, node.event, '');
      return;
    }
    report(
      node.id,
      checkValues(event.args, event.details, named(node.args, self), named(node.details, self)),
      node.event,
    );
    for (const parameter of node.params) {
      const given = event.gives.find((g) => g.name === parameter.name);
      const type = given ? story(given.type) : null;
      // A handler may narrow what it's given: `setOfVisuals` can promise only bipeds.
      if (!type || !(typeFits(type, parameter.type) || typeFits(parameter.type, type)))
        add(parameter.id, 'wrongHandler', `${node.event} gives no ${parameter.name}.`);
    }
  };

  function visit(node: AstNode, self: TypeRef): void {
    switch (node.kind) {
      case 'field':
        typeRef(node.type, node.id);
        if (node.initial) fit(node.initial, node.type, self, node.id);
        break;
      case 'method':
        if (node.returns) typeRef(node.returns, node.id);
        break;
      case 'parameter':
        typeRef(node.type, node.id);
        if (node.default) fit(node.default, node.type, self, node.id);
        break;
      case 'loopItem':
        typeRef(node.type, node.id);
        break;
      case 'listener':
        listener(node, self);
        break;
      case 'count':
        fit(node.times, WHOLE, self, node.id);
        break;
      case 'while':
      case 'if':
        fit(node.condition, BOOLEAN, self, node.id);
        break;
      case 'forEach':
      case 'eachTogether':
        fit(node.items, { kind: 'array', of: node.item.type }, self, node.id);
        break;
      case 'local':
        typeRef(node.type, node.id);
        fit(node.value, node.type, self, node.id);
        break;
      case 'assign': {
        const target = typeOf(node.target, self);
        if (target) fit(node.value, target, self, node.id);
        break;
      }
      case 'call':
      case 'functionCall':
        if (node.callee.kind === 'story') storyCall(node, node.callee.name, self);
        else userCall(node, node.callee.method, self);
        break;
      case 'enum':
        if (!isEnumName(node.type) && node.type !== 'JointId')
          add(node.id, 'unknownType', `There is no type ${node.type}.`, node.type, '');
        else if (isEnumName(node.type) && !enumValues(node.type).includes(node.value))
          add(node.id, 'unknownChoice', `${node.type} has no ${node.value}.`, node.value, '');
        break;
      case 'arithmetic':
        fit(node.left, NUMBER, self, node.id);
        fit(node.right, NUMBER, self, node.id);
        break;
      case 'logic':
        fit(node.left, BOOLEAN, self, node.id);
        fit(node.right, BOOLEAN, self, node.id);
        break;
      case 'not':
        fit(node.value, BOOLEAN, self, node.id);
        break;
      case 'compare':
        if (node.op !== 'equal' && node.op !== 'notEqual') {
          fit(node.left, NUMBER, self, node.id);
          fit(node.right, NUMBER, self, node.id);
        }
        break;
      case 'arrayOf':
        typeRef(node.of, node.id);
        for (const item of node.items) fit(item, node.of, self, node.id);
        break;
      case 'arrayItem':
        fit(node.index, WHOLE, self, node.id);
        if (typeOf(node.array, self)?.kind !== 'array' && typeOf(node.array, self) !== null)
          add(node.id, 'wrongHere', 'Only a list has items.');
        break;
      case 'arrayLength':
        if (typeOf(node.array, self)?.kind !== 'array' && typeOf(node.array, self) !== null)
          add(node.id, 'wrongHere', 'Only a list has a length.');
        break;
      default:
    }
  }

  for (const type of program.types) {
    const self: TypeRef = { kind: 'user', type: type.id };
    if (type.extends.kind === 'story' && !EXTENDABLE.has(type.extends.name))
      add(type.id, 'cantExtend', `${type.name} can't extend ${type.extends.name}.`, type.name, '');
    walk(type, (node) => visit(node, self));
    for (const method of type.methods) {
      if (method.returns === null) continue;
      const returns = method.returns;
      walk(method, (node) => {
        if (node.kind === 'return' && node.value) fit(node.value, returns, self, node.id);
      });
    }
  }
  return problems;
}
