/**
 * Checks a program: its shape, then the rules a schema can't state (`docs/spec/01-ast.md`,
 * section 2). Every load and every edit comes through here.
 */
import type { NodeId } from './ids.ts';
import { isTooDeep, validateSchema, type SchemaProblem } from './schema.ts';
import type {
  AstNode,
  Args,
  Call,
  Expression,
  FunctionCall,
  ListenerDecl,
  MethodDecl,
  ParameterDecl,
  Program,
  Statement,
  TypeRef,
} from './nodes.ts';
import { childrenOf, walkProgram } from './walk.ts';

export type ProblemCode =
  | 'shape'
  | 'too_long'
  | 'too_deep'
  | 'duplicate_id'
  | 'missing_reference'
  | 'out_of_scope'
  | 'duplicate_name'
  | 'extends_cycle'
  | 'bad_assign'
  | 'bad_return'
  | 'bad_call'
  | 'bad_parameter'
  /** From a check passed in (WP4.2, WP8). */
  | 'outside';

export interface Problem {
  readonly code: ProblemCode;
  /** For developers and logs; never shown to learners. */
  readonly message: string;
  readonly node: NodeId | null;
  /** The name it concerns, for a refusal in plain words. */
  readonly name?: string;
  /** A check from outside can give its own refusal in plain words. */
  readonly reason?: string;
}

export interface ValidateOptions {
  /** More rules, such as the Story API's. Runs only on a program that passed the rest. */
  readonly check?: (program: Program) => readonly Problem[];
  /** Skip unknown kinds, unknown properties and the rules, for a file from a newer version. */
  readonly lenient?: boolean;
}

interface Variable {
  readonly name: string;
  readonly assignable: boolean;
}

function checkRules(program: Program): Problem[] {
  const problems: Problem[] = [];
  const add = (code: ProblemCode, message: string, node: NodeId, name?: string) =>
    problems.push({ code, message, node, ...(name === undefined ? {} : { name }) });

  const seen = new Set<NodeId>();
  const types = new Set<NodeId>();
  const fields = new Set<NodeId>();
  const methods = new Map<NodeId, MethodDecl>();
  const variables = new Set<NodeId>();
  walkProgram(program, (node) => {
    if (seen.has(node.id)) add('duplicate_id', `Two nodes have the id ${node.id}.`, node.id);
    seen.add(node.id);
    if (node.kind === 'type') types.add(node.id);
    else if (node.kind === 'field') fields.add(node.id);
    else if (node.kind === 'method') methods.set(node.id, node);
    else if (node.kind === 'local' || node.kind === 'parameter' || node.kind === 'loopItem')
      variables.add(node.id);
  });

  const unique = (named: readonly { id: NodeId; name: string }[]) => {
    const names = new Set<string>();
    for (const { id, name } of named) {
      if (names.has(name)) add('duplicate_name', `Two declarations are called ${name}.`, id, name);
      names.add(name);
    }
  };

  const typeRef = (ref: TypeRef, at: NodeId): void => {
    if (ref.kind === 'array') typeRef(ref.of, at);
    else if (ref.kind === 'user' && !types.has(ref.type))
      add('missing_reference', `There is no type ${ref.type}.`, at);
  };

  // What's in scope at this point in the walk: variables come and go as lists start and end.
  const scope = new Map<NodeId, Variable>();

  const declare = (id: NodeId, name: string, type: TypeRef, assignable: boolean) => {
    typeRef(type, id);
    if ([...scope.values()].some((v) => v.name === name))
      add('duplicate_name', `${name} is already in scope.`, id, name);
    scope.set(id, { name, assignable });
  };

  const args = (values: Args) => {
    for (const value of Object.values(values)) expression(value);
  };

  const call = (node: Call | FunctionCall) => {
    expression(node.target);
    args(node.args);
    args(node.details);
    if (node.callee.kind !== 'user') return;
    const method = methods.get(node.callee.method);
    if (!method) {
      add('missing_reference', `There is no method ${node.callee.method}.`, node.id);
      return;
    }
    if (node.kind === 'functionCall' && method.returns === null)
      add('bad_call', `${method.name} is a procedure, so it has no value.`, node.id);
    if (Object.keys(node.details).length > 0)
      add('bad_call', `A call to ${method.name} can't have details.`, node.id);
    const parameters = new Set<string>(method.params.map((p) => p.id));
    for (const key of Object.keys(node.args))
      if (!parameters.has(key)) add('bad_call', `${method.name} has no parameter ${key}.`, node.id);
    for (const p of method.params)
      if (p.default === null && !Object.hasOwn(node.args, p.id))
        add('bad_call', `The call to ${method.name} needs ${p.name}.`, node.id);
  };

  function expression(e: Expression): void {
    switch (e.kind) {
      case 'variableRef':
        if (!scope.has(e.variable)) {
          if (variables.has(e.variable))
            add('out_of_scope', `${e.variable} isn't in scope here.`, e.id);
          else add('missing_reference', `There is no variable ${e.variable}.`, e.id);
        }
        break;
      case 'fieldRef':
        if (!fields.has(e.field)) add('missing_reference', `There is no field ${e.field}.`, e.id);
        expression(e.target);
        return;
      case 'functionCall':
        call(e);
        return;
      case 'arrayOf':
        typeRef(e.of, e.id);
        break;
      default:
    }
    for (const child of childrenOf(e)) expression(child.node as Expression);
  }

  interface Context {
    readonly method: MethodDecl | null;
    readonly together: boolean;
  }

  const statements = (list: readonly Statement[], context: Context) => {
    const added: NodeId[] = [];
    for (const s of list) {
      statement(s, context);
      if (s.kind === 'local') {
        declare(s.id, s.name, s.type, s.constant !== true);
        added.push(s.id);
      }
    }
    for (const id of added) scope.delete(id);
  };

  const assignTarget = (target: Expression, at: NodeId) => {
    if (target.kind === 'variableRef') {
      if (scope.get(target.variable)?.assignable === false)
        add('bad_assign', `${scope.get(target.variable)!.name} can't be changed.`, at);
    } else if (target.kind !== 'fieldRef' && target.kind !== 'arrayItem')
      add('bad_assign', `Can't assign to a ${target.kind}.`, at);
  };

  const returnStatement = (s: Statement & { kind: 'return' }, context: Context) => {
    if (s.value) expression(s.value);
    if (!context.method) add('bad_return', 'A listener has nothing to return from.', s.id);
    else if (context.together) add('bad_return', "Can't return from inside do together.", s.id);
    else if ((s.value === null) !== (context.method.returns === null))
      add('bad_return', `${context.method.name} has the wrong kind of return.`, s.id);
  };

  function statement(s: Statement, context: Context): void {
    switch (s.kind) {
      case 'doInOrder':
        statements(s.body, context);
        break;
      case 'doTogether':
        statements(s.body, { ...context, together: true });
        break;
      case 'count':
        expression(s.times);
        statements(s.body, context);
        break;
      case 'while':
        expression(s.condition);
        statements(s.body, context);
        break;
      case 'forEach':
      case 'eachTogether':
        expression(s.items);
        declare(s.item.id, s.item.name, s.item.type, false);
        statements(s.body, s.kind === 'eachTogether' ? { ...context, together: true } : context);
        scope.delete(s.item.id);
        break;
      case 'if':
        expression(s.condition);
        statements(s.then, context);
        statements(s.else, context);
        break;
      case 'local':
        expression(s.value);
        break;
      case 'assign':
        assignTarget(s.target, s.id);
        expression(s.target);
        expression(s.value);
        break;
      case 'comment':
        break;
      case 'call':
        call(s);
        break;
      case 'return':
        returnStatement(s, context);
        break;
    }
  }

  const callable = (
    node: MethodDecl | ListenerDecl,
    params: readonly ParameterDecl[],
    method: MethodDecl | null,
  ) => {
    for (const p of params) {
      if (p.default) expression(p.default);
      if (!method && p.default)
        add('bad_parameter', "A listener's parameter comes from the event.", p.id);
      declare(p.id, p.name, p.type, true);
    }
    statements(node.body, { method, together: false });
    scope.clear();
  };

  unique(program.types);
  for (const type of program.types) {
    typeRef(type.extends, type.id);
    unique([...type.fields, ...type.methods]);
    for (const field of type.fields) {
      typeRef(field.type, field.id);
      if (field.initial) expression(field.initial);
    }
    for (const method of type.methods) {
      if (method.returns) typeRef(method.returns, method.id);
      callable(method, method.params, method);
    }
    for (const listener of type.listeners) {
      args(listener.args);
      args(listener.details);
      callable(listener, listener.params, null);
    }
  }

  const parents = new Map<NodeId, NodeId>();
  for (const type of program.types)
    if (type.extends.kind === 'user') parents.set(type.id, type.extends.type);
  for (const start of parents.keys()) {
    let at: NodeId | undefined = start;
    for (let steps = 0; at !== undefined; steps++) {
      at = parents.get(at);
      if (at === start || steps > parents.size) {
        add('extends_cycle', 'A type ends up extending itself.', start);
        break;
      }
    }
  }

  return problems;
}

/** Everything wrong with `value` as a program. An empty list means it's valid. */
export const TOO_DEEP: Problem = {
  code: 'too_deep',
  message: 'The program is nested too deeply.',
  node: null,
};

/** The schema's problems, as `validateProgram` reports them. */
export const shapeProblems = (shape: readonly SchemaProblem[]): Problem[] =>
  shape.map(({ at, message, tooLong }) => ({
    code: tooLong ? 'too_long' : 'shape',
    message: `${at || 'The program'} ${message}.`,
    node: null,
  }));

/** The rules a schema can't state, then the check from outside: for a program whose shape is right. */
export function validateRules(program: Program, options: ValidateOptions = {}): Problem[] {
  const problems = checkRules(program);
  return problems.length > 0 ? problems : [...(options.check?.(program) ?? [])];
}

export function validateProgram(value: unknown, options: ValidateOptions = {}): Problem[] {
  if (isTooDeep(value)) return [TOO_DEEP];
  const shape = validateSchema(value, options.lenient ?? false);
  if (shape.length > 0) return shapeProblems(shape);
  if (options.lenient) return [];
  return validateRules(value as Program, options);
}

/** The node's name, if it has one: a declaration, a local or a loop item. */
export const nameOf = (node: AstNode): string | null =>
  'name' in node && typeof node.name === 'string' ? node.name : null;
