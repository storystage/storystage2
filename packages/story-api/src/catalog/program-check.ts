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
import type {
  Args,
  AstNode,
  Call,
  Expression,
  FieldDecl,
  FunctionCall,
  ListenerDecl,
  MethodDecl,
  NodeId,
  Problem,
  Program,
  TypeDecl,
  TypeRef,
} from '@storystage/ast';
import {
  checkValues,
  classOfType,
  enumValues,
  findEntry,
  findEvent,
  fits,
  isEnumName,
  isStoryType,
} from './catalog.ts';
import type { CallProblem } from './catalog.ts';
import type { ApiClass, TypeName } from './types.ts';
import { STORY_CLASSES } from '../vocabulary.ts';
import words from '../strings/en-GB.json' with { type: 'json' };

export interface ProgramCheckOptions {
  /**
   * Whether the model a scene puts in a field has a joint (spec 02, section 5, rule 3). A
   * program doesn't say which model that is, so the caller asks the scene and the manifest.
   */
  readonly jointExists?: (field: NodeId, joint: string) => boolean;
}

/** `null` is a type that can't be known, which always fits. */
type Known = TypeRef | null;

const story = (name: string): TypeRef => ({ kind: 'story', name });
const NUMBER = story('Number');
const WHOLE = story('WholeNumber');
const BOOLEAN = story('Boolean');
const TEXT = story('Text');

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

  const types = new Map<NodeId, TypeDecl>(program.types.map((t) => [t.id, t]));
  const fields = new Map<NodeId, FieldDecl>();
  const methods = new Map<NodeId, { method: MethodDecl; owner: TypeDecl }>();
  const variables = new Map<NodeId, TypeRef>();
  for (const type of program.types) {
    for (const field of type.fields) fields.set(field.id, field);
    for (const method of type.methods) methods.set(method.id, { method, owner: type });
    walk(type, (node) => {
      if (node.kind === 'local' || node.kind === 'parameter' || node.kind === 'loopItem')
        variables.set(node.id, node.type);
    });
  }

  /** A user type's chain of parents, itself first. */
  const parentsOf = (id: NodeId): readonly TypeDecl[] => {
    const chain: TypeDecl[] = [];
    for (let at = types.get(id); at && !chain.includes(at);) {
      chain.push(at);
      at = at.extends.kind === 'user' ? types.get(at.extends.type) : undefined;
    }
    return chain;
  };

  /** The Story API's name for a type: a learner's class is the story class it builds on. */
  const storyName = (type: TypeRef): TypeName | null => {
    if (type.kind === 'story') return isStoryType(type.name) ? (type.name as TypeName) : null;
    if (type.kind === 'array') {
      const item = storyName(type.of);
      return item === null ? null : (`${item}[]` as TypeName);
    }
    const root = parentsOf(type.type).at(-1)?.extends;
    return root?.kind === 'story' ? storyName(root) : null;
  };

  const classOf = (type: Known): ApiClass | null => {
    const name = type === null ? null : storyName(type);
    return name === null ? null : classOfType(name);
  };

  function typeFits(value: Known, wanted: TypeRef): boolean {
    if (value === null) return true;
    if (wanted.kind === 'array')
      return value.kind === 'array' ? typeFits(value.of, wanted.of) : false;
    if (wanted.kind === 'user')
      return value.kind === 'user' && parentsOf(value.type).some((t) => t.id === wanted.type);
    const given = storyName(value);
    return given === null || !isStoryType(wanted.name) || fits(given, wanted.name as TypeName);
  }

  function typeOf(e: Expression, self: TypeRef): Known {
    switch (e.kind) {
      case 'number':
        return NUMBER;
      case 'wholeNumber':
        return WHOLE;
      case 'boolean':
      case 'compare':
      case 'logic':
      case 'not':
        return BOOLEAN;
      case 'text':
      case 'join':
        return TEXT;
      case 'enum':
        return story(e.type);
      case 'none':
        return null;
      case 'this':
        return self;
      case 'fieldRef':
        return fields.get(e.field)?.type ?? null;
      case 'variableRef':
        return variables.get(e.variable) ?? null;
      case 'arrayOf':
        return { kind: 'array', of: e.of };
      case 'arrayLength':
        return WHOLE;
      case 'arrayItem': {
        const array = typeOf(e.array, self);
        return array?.kind === 'array' ? array.of : null;
      }
      case 'arithmetic': {
        const left = typeOf(e.left, self);
        const right = typeOf(e.right, self);
        if (left === null || right === null) return null;
        const whole = storyName(left) === 'WholeNumber' && storyName(right) === 'WholeNumber';
        return whole && e.op !== 'divide' ? WHOLE : NUMBER;
      }
      case 'functionCall': {
        if (e.callee.kind === 'user') return methods.get(e.callee.method)?.method.returns ?? null;
        const cls = classOf(typeOf(e.target, self));
        const entry = cls && findEntry(cls, e.callee.name);
        return entry?.kind === 'function' ? story(entry.returns) : null;
      }
    }
  }

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
