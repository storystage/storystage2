/**
 * The program model (`docs/spec/01-ast.md`, section 1). Everything is immutable plain JSON: an
 * edit makes a new program and shares what didn't change. `ast` doesn't know the Story API, so
 * procedure, class, enum and event names are strings here (spec section 0).
 */
import type { NodeId } from './ids.ts';

/** A whole program: every type in the production. Not a node: nothing refers to it. */
export interface Program {
  /** Semantic version of the program format (spec section 7). */
  readonly schemaVersion: string;
  readonly types: readonly TypeDecl[];
}

interface NodeBase {
  readonly id: NodeId;
  /** The node this one was copied from (spec section 3). */
  readonly copiedFrom?: NodeId;
}

/** A Story API or basic type by name, a type in this program by id, or a list of either. */
export type TypeRef =
  | { readonly kind: 'story'; readonly name: string }
  | { readonly kind: 'user'; readonly type: NodeId }
  | { readonly kind: 'array'; readonly of: TypeRef };

/** What a call calls: a Story API procedure or function by name, or a user method by id. */
export type Callee =
  | { readonly kind: 'story'; readonly name: string }
  | { readonly kind: 'user'; readonly method: NodeId };

/** Keyed by the Story API parameter's name, or the user parameter's id. */
export type Args = Readonly<Record<string, Expression>>;

// ---- Declarations ----------------------------------------------------------------------------

export interface TypeDecl extends NodeBase {
  readonly kind: 'type';
  readonly name: string;
  readonly extends: TypeRef;
  readonly fields: readonly FieldDecl[];
  readonly methods: readonly MethodDecl[];
  readonly listeners: readonly ListenerDecl[];
}

export interface FieldDecl extends NodeBase {
  readonly kind: 'field';
  readonly name: string;
  readonly type: TypeRef;
  /** `null` for a scene object: how it starts is in the scene's set-up. */
  readonly initial: Expression | null;
}

export interface MethodDecl extends NodeBase {
  readonly kind: 'method';
  readonly name: string;
  /** `null` for a procedure. */
  readonly returns: TypeRef | null;
  readonly params: readonly ParameterDecl[];
  readonly body: readonly Statement[];
}

export interface ParameterDecl extends NodeBase {
  readonly kind: 'parameter';
  readonly name: string;
  readonly type: TypeRef;
  /** What a call leaving this parameter out gets. Always `null` on a listener's parameter. */
  readonly default: Expression | null;
}

export interface ListenerDecl extends NodeBase {
  readonly kind: 'listener';
  /** An event kind from the Story API (`mouseClickObject`, `timer`). */
  readonly event: string;
  /** What the event needs: clicked objects, seconds between runs. */
  readonly args: Args;
  /** The values the event hands its handler. */
  readonly params: readonly ParameterDecl[];
  readonly body: readonly Statement[];
}

export type Declaration = TypeDecl | FieldDecl | MethodDecl | ParameterDecl | ListenerDecl;

/** A `forEach` or `eachTogether` variable. */
export interface LoopItem extends NodeBase {
  readonly kind: 'loopItem';
  readonly name: string;
  readonly type: TypeRef;
}

// ---- Statements ------------------------------------------------------------------------------

interface StatementBase extends NodeBase {
  /** `false` when the learner has switched it off. Left out when it's on. */
  readonly enabled?: false;
}

export interface DoInOrder extends StatementBase {
  readonly kind: 'doInOrder';
  readonly body: readonly Statement[];
}
export interface DoTogether extends StatementBase {
  readonly kind: 'doTogether';
  readonly body: readonly Statement[];
}
export interface Count extends StatementBase {
  readonly kind: 'count';
  readonly times: Expression;
  readonly body: readonly Statement[];
}
export interface While extends StatementBase {
  readonly kind: 'while';
  readonly condition: Expression;
  readonly body: readonly Statement[];
}
export interface ForEach extends StatementBase {
  readonly kind: 'forEach';
  readonly item: LoopItem;
  readonly items: Expression;
  readonly body: readonly Statement[];
}
export interface EachTogether extends StatementBase {
  readonly kind: 'eachTogether';
  readonly item: LoopItem;
  readonly items: Expression;
  readonly body: readonly Statement[];
}
export interface If extends StatementBase {
  readonly kind: 'if';
  readonly condition: Expression;
  readonly then: readonly Statement[];
  readonly else: readonly Statement[];
}
export interface Local extends StatementBase {
  readonly kind: 'local';
  readonly name: string;
  readonly type: TypeRef;
  readonly value: Expression;
  readonly constant?: true;
}
export interface Assign extends StatementBase {
  readonly kind: 'assign';
  readonly target: Expression;
  readonly value: Expression;
}
export interface Comment extends StatementBase {
  readonly kind: 'comment';
  readonly text: string;
}
export interface Call extends StatementBase {
  readonly kind: 'call';
  readonly target: Expression;
  readonly callee: Callee;
  readonly args: Args;
  readonly details: Args;
}
export interface Return extends StatementBase {
  readonly kind: 'return';
  readonly value: Expression | null;
}

export type Statement =
  | DoInOrder
  | DoTogether
  | Count
  | While
  | ForEach
  | EachTogether
  | If
  | Local
  | Assign
  | Comment
  | Call
  | Return;

// ---- Expressions -----------------------------------------------------------------------------

export const ARITHMETIC_OPS = ['add', 'subtract', 'multiply', 'divide', 'remainder'] as const;
export const COMPARE_OPS = [
  'equal',
  'notEqual',
  'less',
  'lessOrEqual',
  'greater',
  'greaterOrEqual',
] as const;
export const LOGIC_OPS = ['and', 'or'] as const;

export interface NumberLiteral extends NodeBase {
  readonly kind: 'number';
  readonly value: number;
}
export interface WholeNumberLiteral extends NodeBase {
  readonly kind: 'wholeNumber';
  readonly value: number;
}
export interface BooleanLiteral extends NodeBase {
  readonly kind: 'boolean';
  readonly value: boolean;
}
export interface TextLiteral extends NodeBase {
  readonly kind: 'text';
  readonly value: string;
}
export interface EnumLiteral extends NodeBase {
  readonly kind: 'enum';
  readonly type: string;
  readonly value: string;
}
export interface NoneLiteral extends NodeBase {
  readonly kind: 'none';
}
export interface This extends NodeBase {
  readonly kind: 'this';
}
export interface FieldRef extends NodeBase {
  readonly kind: 'fieldRef';
  readonly target: Expression;
  readonly field: NodeId;
}
export interface VariableRef extends NodeBase {
  readonly kind: 'variableRef';
  /** A `local`, `parameter` or `loopItem` in scope. */
  readonly variable: NodeId;
}
export interface FunctionCall extends NodeBase {
  readonly kind: 'functionCall';
  readonly target: Expression;
  readonly callee: Callee;
  readonly args: Args;
  readonly details: Args;
}
export interface Arithmetic extends NodeBase {
  readonly kind: 'arithmetic';
  readonly op: (typeof ARITHMETIC_OPS)[number];
  readonly left: Expression;
  readonly right: Expression;
}
export interface Compare extends NodeBase {
  readonly kind: 'compare';
  readonly op: (typeof COMPARE_OPS)[number];
  readonly left: Expression;
  readonly right: Expression;
}
export interface Logic extends NodeBase {
  readonly kind: 'logic';
  readonly op: (typeof LOGIC_OPS)[number];
  readonly left: Expression;
  readonly right: Expression;
}
export interface Not extends NodeBase {
  readonly kind: 'not';
  readonly value: Expression;
}
export interface Join extends NodeBase {
  readonly kind: 'join';
  readonly left: Expression;
  readonly right: Expression;
}
export interface ArrayOf extends NodeBase {
  readonly kind: 'arrayOf';
  readonly of: TypeRef;
  readonly items: readonly Expression[];
}
export interface ArrayItem extends NodeBase {
  readonly kind: 'arrayItem';
  readonly array: Expression;
  readonly index: Expression;
}
export interface ArrayLength extends NodeBase {
  readonly kind: 'arrayLength';
  readonly array: Expression;
}

export type Expression =
  | NumberLiteral
  | WholeNumberLiteral
  | BooleanLiteral
  | TextLiteral
  | EnumLiteral
  | NoneLiteral
  | This
  | FieldRef
  | VariableRef
  | FunctionCall
  | Arithmetic
  | Compare
  | Logic
  | Not
  | Join
  | ArrayOf
  | ArrayItem
  | ArrayLength;

export type AstNode = Declaration | LoopItem | Statement | Expression;
export type NodeKind = AstNode['kind'];

export const STATEMENT_KINDS = [
  'doInOrder',
  'doTogether',
  'count',
  'while',
  'forEach',
  'eachTogether',
  'if',
  'local',
  'assign',
  'comment',
  'call',
  'return',
] as const satisfies readonly Statement['kind'][];

export const EXPRESSION_KINDS = [
  'number',
  'wholeNumber',
  'boolean',
  'text',
  'enum',
  'none',
  'this',
  'fieldRef',
  'variableRef',
  'functionCall',
  'arithmetic',
  'compare',
  'logic',
  'not',
  'join',
  'arrayOf',
  'arrayItem',
  'arrayLength',
] as const satisfies readonly Expression['kind'][];

const STATEMENTS: ReadonlySet<string> = new Set(STATEMENT_KINDS);
export const isStatement = (node: AstNode): node is Statement => STATEMENTS.has(node.kind);
