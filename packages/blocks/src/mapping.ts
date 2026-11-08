/**
 * A method as Blockly blocks, and back (`14-editors.md` section 3i.8). `toBlocks` gives the
 * workspace's saved form (Blockly's JSON serialization) for one method or listener; `fromBlocks`
 * reads the method's body back from it. Each block's id is its node's id, so a block always says
 * which part of the program it is, and the round trip gives back exactly the program's nodes.
 *
 * What the blocks don't draw (a node's types, a callee's id, a loop item) travels in the block's
 * `extraState`. Names the program gives (a variable's, a method's) are copied in as `label`, for
 * showing only: `fromBlocks` never reads them.
 */
import { isStatement } from '@storystage/ast';
import type {
  Args,
  Expression,
  ListenerDecl,
  LoopItem,
  MethodDecl,
  NodeId,
  Program,
  Statement,
  TypeRef,
} from '@storystage/ast';
import {
  LISTENER,
  METHOD,
  TARGET,
  USER_CALL,
  USER_FUNCTION,
  argInput,
  detailInput,
  enumType,
  itemInput,
  nodeType,
  storyStatementType,
  storyValueType,
} from './shapes.ts';

/** Blockly's saved form of one block (`Blockly.serialization.blocks.State`). */
export interface BlockState {
  type: string;
  id?: string;
  x?: number;
  y?: number;
  extraState?: Extra;
  fields?: Record<string, string | number | boolean>;
  inputs?: Record<string, { block?: BlockState }>;
  next?: { block?: BlockState };
  disabledReasons?: string[];
  deletable?: boolean;
}

/** Blockly's saved form of a workspace. */
export interface WorkspaceState {
  blocks: { languageVersion: 0; blocks: BlockState[] };
}

/** What a block carries beyond its slots and fields. */
export interface Extra {
  copiedFrom?: string;
  label?: string;
  details?: string[];
  method?: string;
  params?: { id: string; name: string }[];
  item?: LoopItem;
  name?: string;
  type?: TypeRef;
  constant?: true;
  hasValue?: boolean;
  field?: string;
  variable?: string;
  of?: TypeRef;
  count?: number;
  listener?: string;
  event?: string;
}

/** The reason Blockly records for a block the learner switched off. */
export const SWITCHED_OFF = 'MANUALLY_DISABLED';

// ---- Names -----------------------------------------------------------------------------------

/** Every name the program gives, by node id: types, fields, methods, parameters, variables. */
export function namesOf(program: Program): Map<string, string> {
  const names = new Map<string, string>();
  const statements = (list: readonly Statement[]) => {
    for (const s of list) {
      if (s.kind === 'local') names.set(s.id, s.name);
      if (s.kind === 'forEach' || s.kind === 'eachTogether') names.set(s.item.id, s.item.name);
      if ('body' in s) statements(s.body);
      if (s.kind === 'if') {
        statements(s.then);
        statements(s.else);
      }
    }
  };
  for (const t of program.types) {
    names.set(t.id, t.name);
    for (const f of t.fields) names.set(f.id, f.name);
    for (const m of [...t.methods, ...t.listeners]) {
      if (m.kind === 'method') names.set(m.id, m.name);
      for (const p of m.params) names.set(p.id, p.name);
      statements(m.body);
    }
  }
  return names;
}

const methodsById = (program: Program) =>
  new Map(program.types.flatMap((t) => t.methods).map((m) => [m.id as string, m]));

// ---- To blocks -------------------------------------------------------------------------------

/** The saved workspace for one method or listener: its header block, holding its body. */
export function toBlocks(program: Program, owner: MethodDecl | ListenerDecl): WorkspaceState {
  const names = namesOf(program);
  const methods = methodsById(program);
  const header: BlockState =
    owner.kind === 'method'
      ? {
          type: METHOD,
          id: owner.id,
          x: 16,
          y: 16,
          deletable: false,
          extraState: { label: owner.name },
          inputs: chain(owner.body),
        }
      : {
          type: LISTENER,
          id: owner.id,
          x: 16,
          y: 16,
          deletable: false,
          extraState: { event: owner.event, details: Object.keys(owner.details) },
          inputs: { ...args(owner.args), ...details(owner.details), ...chain(owner.body) },
        };
  return { blocks: { languageVersion: 0, blocks: [header] } };

  function chain(list: readonly Statement[], input = 'BODY'): BlockState['inputs'] {
    const first = linked(list);
    return first ? { [input]: { block: first } } : {};
  }

  function linked(list: readonly Statement[]): BlockState | undefined {
    let next: BlockState | undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      const block = statement(list[i]!);
      if (next) block.next = { block: next };
      next = block;
    }
    return next;
  }

  function args(values: Args): Record<string, { block: BlockState }> {
    return Object.fromEntries(
      Object.entries(values).map(([param, e]) => [argInput(param), { block: expression(e) }]),
    );
  }

  function details(values: Args): Record<string, { block: BlockState }> {
    return Object.fromEntries(
      Object.entries(values).map(([d, e]) => [detailInput(d), { block: expression(e) }]),
    );
  }

  function base(
    node: { id: NodeId; copiedFrom?: NodeId },
    type: string,
    extra: Extra = {},
  ): BlockState {
    const extraState = node.copiedFrom ? { ...extra, copiedFrom: node.copiedFrom } : extra;
    return Object.keys(extraState).length > 0
      ? { type, id: node.id, extraState }
      : { type, id: node.id };
  }

  function statement(s: Statement): BlockState {
    const block = statementBlock(s);
    if (s.enabled === false) block.disabledReasons = [SWITCHED_OFF];
    return block;
  }

  function statementBlock(s: Statement): BlockState {
    switch (s.kind) {
      case 'doInOrder':
      case 'doTogether':
        return { ...base(s, nodeType(s.kind)), inputs: chain(s.body) };
      case 'count':
        return {
          ...base(s, nodeType(s.kind)),
          inputs: { TIMES: { block: expression(s.times) }, ...chain(s.body) },
        };
      case 'while':
        return {
          ...base(s, nodeType(s.kind)),
          inputs: { CONDITION: { block: expression(s.condition) }, ...chain(s.body) },
        };
      case 'forEach':
      case 'eachTogether':
        return {
          ...base(s, nodeType(s.kind), { item: s.item, label: s.item.name }),
          inputs: { ITEMS: { block: expression(s.items) }, ...chain(s.body) },
        };
      case 'if':
        return {
          ...base(s, nodeType(s.kind)),
          inputs: {
            CONDITION: { block: expression(s.condition) },
            ...chain(s.then, 'THEN'),
            ...chain(s.else, 'ELSE'),
          },
        };
      case 'local':
        return {
          ...base(s, nodeType(s.kind), {
            name: s.name,
            type: s.type,
            ...(s.constant ? { constant: true as const } : {}),
            label: s.name,
          }),
          inputs: { VALUE: { block: expression(s.value) } },
        };
      case 'assign':
        return {
          ...base(s, nodeType(s.kind)),
          inputs: {
            TARGET: { block: expression(s.target) },
            VALUE: { block: expression(s.value) },
          },
        };
      case 'comment':
        return { ...base(s, nodeType(s.kind)), fields: { TEXT: s.text } };
      case 'return':
        return s.value === null
          ? base(s, nodeType(s.kind), { hasValue: false })
          : { ...base(s, nodeType(s.kind)), inputs: { VALUE: { block: expression(s.value) } } };
      case 'call':
        return call(s, 'statement');
    }
  }

  function call(
    c: Extract<Statement, { kind: 'call' }> | Extract<Expression, { kind: 'functionCall' }>,
    role: 'statement' | 'value',
  ): BlockState {
    const detailNames = Object.keys(c.details);
    const inputs = {
      [TARGET]: { block: expression(c.target) },
      ...args(c.args),
      ...details(c.details),
    };
    if (c.callee.kind === 'story') {
      const type =
        role === 'statement' ? storyStatementType(c.callee.name) : storyValueType(c.callee.name);
      return { ...base(c, type, detailNames.length ? { details: detailNames } : {}), inputs };
    }
    const method = methods.get(c.callee.method);
    return {
      ...base(c, role === 'statement' ? USER_CALL : USER_FUNCTION, {
        method: c.callee.method,
        params: (method?.params ?? []).map((p) => ({ id: p.id, name: p.name })),
        details: detailNames,
        label: method?.name ?? '',
      }),
      inputs,
    };
  }

  function expression(e: Expression): BlockState {
    switch (e.kind) {
      case 'number':
      case 'wholeNumber':
        return { ...base(e, nodeType(e.kind)), fields: { NUM: e.value } };
      case 'boolean':
        return { ...base(e, nodeType(e.kind)), fields: { BOOL: String(e.value) } };
      case 'text':
        return { ...base(e, nodeType(e.kind)), fields: { TEXT: e.value } };
      case 'enum':
        return { ...base(e, enumType(e.type)), fields: { VALUE: e.value } };
      case 'none':
      case 'this':
        return base(e, nodeType(e.kind));
      case 'fieldRef':
        return {
          ...base(e, nodeType(e.kind), { field: e.field, label: names.get(e.field) ?? '' }),
          inputs: { TARGET: { block: expression(e.target) } },
        };
      case 'variableRef':
        return base(e, nodeType(e.kind), {
          variable: e.variable,
          label: names.get(e.variable) ?? '',
        });
      case 'functionCall':
        return call(e, 'value');
      case 'arithmetic':
      case 'compare':
      case 'logic':
        return {
          ...base(e, nodeType(e.kind)),
          fields: { OP: e.op },
          inputs: { LEFT: { block: expression(e.left) }, RIGHT: { block: expression(e.right) } },
        };
      case 'not':
        return { ...base(e, nodeType(e.kind)), inputs: { VALUE: { block: expression(e.value) } } };
      case 'join':
        return {
          ...base(e, nodeType(e.kind)),
          inputs: { LEFT: { block: expression(e.left) }, RIGHT: { block: expression(e.right) } },
        };
      case 'arrayOf':
        return {
          ...base(e, nodeType(e.kind), { of: e.of, count: e.items.length }),
          inputs: Object.fromEntries(
            e.items.map((item, i) => [itemInput(i), { block: expression(item) }]),
          ),
        };
      case 'arrayItem':
        return {
          ...base(e, nodeType(e.kind)),
          inputs: { ARRAY: { block: expression(e.array) }, INDEX: { block: expression(e.index) } },
        };
      case 'arrayLength':
        return { ...base(e, nodeType(e.kind)), inputs: { ARRAY: { block: expression(e.array) } } };
    }
  }
}

// ---- From blocks -----------------------------------------------------------------------------

/** What a method's workspace holds: its body, and for a listener its arguments and details. */
export interface FromBlocks {
  readonly owner: NodeId;
  readonly body: readonly Statement[];
  readonly args: Args;
  readonly details: Args;
}

/** A block the mapping can't read: the workspace and the program disagree. */
export class BlocksMismatch extends Error {
  constructor(what: string) {
    super(`The blocks don't match the program: ${what}`);
    this.name = 'BlocksMismatch';
  }
}

/** Reads a method's body back from its saved workspace (the header block `toBlocks` made). */
export function fromBlocks(state: WorkspaceState): FromBlocks {
  const header = state.blocks.blocks.find((b) => b.type === METHOD || b.type === LISTENER);
  if (!header?.id) throw new BlocksMismatch('no method');
  return {
    owner: header.id as NodeId,
    body: list(header, 'BODY'),
    args: header.type === LISTENER ? argsOf(header) : {},
    details: header.type === LISTENER ? detailsOf(header) : {},
  };
}

const id = (b: BlockState): NodeId => {
  if (!b.id) throw new BlocksMismatch(`a ${b.type} block with no id`);
  return b.id as NodeId;
};

/** The node's own fields: its id, and `copiedFrom` if it has one. */
const own = (b: BlockState) =>
  b.extraState?.copiedFrom
    ? { id: id(b), copiedFrom: b.extraState.copiedFrom as NodeId }
    : { id: id(b) };

function list(b: BlockState, input: string): Statement[] {
  const out: Statement[] = [];
  for (let s = b.inputs?.[input]?.block; s; s = s.next?.block) out.push(statementOf(s));
  return out;
}

function slot(b: BlockState, input: string): Expression {
  const child = b.inputs?.[input]?.block;
  if (!child) throw new BlocksMismatch(`an empty ${input} on ${b.type}`);
  return expressionOf(child);
}

function argsOf(b: BlockState): Args {
  return Object.fromEntries(
    Object.keys(b.inputs ?? {})
      .filter((k) => k.startsWith('ARG_'))
      .map((k) => [k.slice('ARG_'.length), slot(b, k)]),
  );
}

function detailsOf(b: BlockState): Args {
  return Object.fromEntries(
    Object.keys(b.inputs ?? {})
      .filter((k) => k.startsWith('DETAIL_'))
      .map((k) => [k.slice('DETAIL_'.length), slot(b, k)]),
  );
}

const field = (b: BlockState, name: string) => {
  const v = b.fields?.[name];
  if (v === undefined) throw new BlocksMismatch(`no ${name} on ${b.type}`);
  return v;
};

function statementOf(b: BlockState): Statement {
  const s = statementNode(b);
  return b.disabledReasons?.includes(SWITCHED_OFF) ? { ...s, enabled: false } : s;
}

function statementNode(b: BlockState): Statement {
  const x = b.extraState ?? {};
  if (b.type.startsWith('ss_story_')) {
    return {
      ...own(b),
      kind: 'call',
      target: slot(b, TARGET),
      callee: { kind: 'story', name: b.type.slice('ss_story_'.length) },
      args: argsOf(b),
      details: detailsOf(b),
    };
  }
  if (b.type === USER_CALL) {
    return {
      ...own(b),
      kind: 'call',
      target: slot(b, TARGET),
      callee: { kind: 'user', method: x.method as NodeId },
      args: argsOf(b),
      details: detailsOf(b),
    };
  }
  switch (b.type) {
    case nodeType('doInOrder'):
      return { ...own(b), kind: 'doInOrder', body: list(b, 'BODY') };
    case nodeType('doTogether'):
      return { ...own(b), kind: 'doTogether', body: list(b, 'BODY') };
    case nodeType('count'):
      return { ...own(b), kind: 'count', times: slot(b, 'TIMES'), body: list(b, 'BODY') };
    case nodeType('while'):
      return { ...own(b), kind: 'while', condition: slot(b, 'CONDITION'), body: list(b, 'BODY') };
    case nodeType('forEach'):
    case nodeType('eachTogether'):
      if (!x.item) throw new BlocksMismatch(`no loop item on ${b.type}`);
      return {
        ...own(b),
        kind: b.type === nodeType('forEach') ? 'forEach' : 'eachTogether',
        item: x.item,
        items: slot(b, 'ITEMS'),
        body: list(b, 'BODY'),
      };
    case nodeType('if'):
      return {
        ...own(b),
        kind: 'if',
        condition: slot(b, 'CONDITION'),
        then: list(b, 'THEN'),
        else: list(b, 'ELSE'),
      };
    case nodeType('local'):
      if (x.name === undefined || !x.type)
        throw new BlocksMismatch('a variable with no name or type');
      return {
        ...own(b),
        kind: 'local',
        name: x.name,
        type: x.type,
        value: slot(b, 'VALUE'),
        ...(x.constant ? { constant: true as const } : {}),
      };
    case nodeType('assign'):
      return { ...own(b), kind: 'assign', target: slot(b, 'TARGET'), value: slot(b, 'VALUE') };
    case nodeType('comment'):
      return { ...own(b), kind: 'comment', text: String(field(b, 'TEXT')) };
    case nodeType('return'):
      return { ...own(b), kind: 'return', value: x.hasValue === false ? null : slot(b, 'VALUE') };
  }
  throw new BlocksMismatch(`a ${b.type} block where a statement goes`);
}

function expressionOf(b: BlockState): Expression {
  const x = b.extraState ?? {};
  if (b.type.startsWith('ss_storyfn_')) {
    return {
      ...own(b),
      kind: 'functionCall',
      target: slot(b, TARGET),
      callee: { kind: 'story', name: b.type.slice('ss_storyfn_'.length) },
      args: argsOf(b),
      details: detailsOf(b),
    };
  }
  if (b.type === USER_FUNCTION) {
    return {
      ...own(b),
      kind: 'functionCall',
      target: slot(b, TARGET),
      callee: { kind: 'user', method: x.method as NodeId },
      args: argsOf(b),
      details: detailsOf(b),
    };
  }
  if (b.type.startsWith('ss_enum_')) {
    return {
      ...own(b),
      kind: 'enum',
      type: b.type.slice('ss_enum_'.length),
      value: String(field(b, 'VALUE')),
    };
  }
  const op = () => field(b, 'OP') as never;
  switch (b.type) {
    case nodeType('number'):
      return { ...own(b), kind: 'number', value: Number(field(b, 'NUM')) };
    case nodeType('wholeNumber'):
      return { ...own(b), kind: 'wholeNumber', value: Number(field(b, 'NUM')) };
    case nodeType('boolean'):
      return { ...own(b), kind: 'boolean', value: String(field(b, 'BOOL')) === 'true' };
    case nodeType('text'):
      return { ...own(b), kind: 'text', value: String(field(b, 'TEXT')) };
    case nodeType('none'):
      return { ...own(b), kind: 'none' };
    case nodeType('this'):
      return { ...own(b), kind: 'this' };
    case nodeType('fieldRef'):
      return { ...own(b), kind: 'fieldRef', target: slot(b, 'TARGET'), field: x.field as NodeId };
    case nodeType('variableRef'):
      return { ...own(b), kind: 'variableRef', variable: x.variable as NodeId };
    case nodeType('arithmetic'):
      return {
        ...own(b),
        kind: 'arithmetic',
        op: op(),
        left: slot(b, 'LEFT'),
        right: slot(b, 'RIGHT'),
      };
    case nodeType('compare'):
      return {
        ...own(b),
        kind: 'compare',
        op: op(),
        left: slot(b, 'LEFT'),
        right: slot(b, 'RIGHT'),
      };
    case nodeType('logic'):
      return { ...own(b), kind: 'logic', op: op(), left: slot(b, 'LEFT'), right: slot(b, 'RIGHT') };
    case nodeType('not'):
      return { ...own(b), kind: 'not', value: slot(b, 'VALUE') };
    case nodeType('join'):
      return { ...own(b), kind: 'join', left: slot(b, 'LEFT'), right: slot(b, 'RIGHT') };
    case nodeType('arrayOf'):
      if (!x.of) throw new BlocksMismatch('a list with no type');
      return {
        ...own(b),
        kind: 'arrayOf',
        of: x.of,
        items: Array.from({ length: x.count ?? 0 }, (_, i) => slot(b, itemInput(i))),
      };
    case nodeType('arrayItem'):
      return { ...own(b), kind: 'arrayItem', array: slot(b, 'ARRAY'), index: slot(b, 'INDEX') };
    case nodeType('arrayLength'):
      return { ...own(b), kind: 'arrayLength', array: slot(b, 'ARRAY') };
  }
  throw new BlocksMismatch(`a ${b.type} block where a value goes`);
}

// ---- One node --------------------------------------------------------------------------------

/**
 * The saved form of one statement or value, alone: for the palette's blocks (a new call with its
 * values empty). It goes through `toBlocks`, so a palette block is drawn exactly as the same node
 * would be in a method.
 */
export function blockStateOf(program: Program, node: Statement | Expression): BlockState {
  const holder = 'blockStateOf' as NodeId;
  const statement: Statement = isStatement(node)
    ? node
    : { id: holder, kind: 'return', value: node as Expression };
  const method: MethodDecl = {
    id: holder,
    kind: 'method',
    name: '',
    returns: null,
    params: [],
    body: [statement],
  };
  const first = toBlocks(program, method).blocks.blocks[0]!.inputs!.BODY!.block!;
  if (statement.id !== holder) return { ...first, next: undefined };
  return first.inputs!.VALUE!.block!;
}
