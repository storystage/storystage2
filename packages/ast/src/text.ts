/**
 * The program as read-only Python-like text, with each node's place in it for highlighting
 * (`docs/spec/01-ast.md`, section 6). `packages/text-view` builds the view and the Java-like
 * wording on this.
 */
import type { NodeId } from './ids.ts';
import type {
  Args,
  AstNode,
  Callee,
  Expression,
  ListenerDecl,
  MethodDecl,
  ParameterDecl,
  Program,
  Statement,
  TypeDecl,
  TypeRef,
} from './nodes.ts';
import { nameOf } from './validate.ts';
import { indexProgram, type Location } from './walk.ts';

export interface TextSpan {
  readonly node: NodeId;
  readonly start: number;
  readonly end: number;
}

export interface ProgramText {
  readonly text: string;
  /** Every node, outermost first. */
  readonly spans: readonly TextSpan[];
}

const NEWER = '(from a newer StoryStage)';
const INDENT = '    ';

const SYMBOLS: Readonly<Record<string, string>> = {
  add: '+',
  subtract: '-',
  multiply: '*',
  divide: '/',
  remainder: '%',
  equal: '==',
  notEqual: '!=',
  less: '<',
  lessOrEqual: '<=',
  greater: '>',
  greaterOrEqual: '>=',
  and: 'and',
  or: 'or',
};

const OPERATORS: ReadonlySet<string> = new Set(['arithmetic', 'compare', 'logic', 'join', 'not']);

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

class Writer {
  text = '';
  readonly spans: TextSpan[] = [];
  /** What each new line starts with. */
  private margin = '';
  private readonly index: ReadonlyMap<NodeId, Location>;

  constructor(program: Program) {
    this.index = indexProgram(program);
  }

  write(text: string): void {
    this.text += text;
  }

  /** Writes what `body` writes, as the span for `node`. Reserves its place, so outer comes first. */
  span(node: AstNode, body: () => void): void {
    const place = this.spans.length;
    this.spans.push({ node: node.id, start: 0, end: 0 });
    const start = this.text.length;
    body();
    this.spans[place] = { node: node.id, start, end: this.text.length };
  }

  /** Starts a line. Its text and the span around it go in the caller's hands. */
  startLine(): void {
    this.text += this.margin;
  }

  endLine(): void {
    this.text += '\n';
  }

  /** Runs `body` with `extra` added to the margin. */
  inMargin(extra: string, body: () => void): void {
    const margin = this.margin;
    this.margin += extra;
    body();
    this.margin = margin;
  }

  nameOf(id: NodeId): string {
    const at = this.index.get(id);
    return (at && nameOf(at.node)) ?? '?';
  }

  type(ref: TypeRef): string {
    if (ref.kind === 'array') return `${this.type(ref.of)}[]`;
    return ref.kind === 'user' ? this.nameOf(ref.type) : ref.name;
  }

  calleeName(callee: Callee): string {
    return callee.kind === 'user' ? this.nameOf(callee.method) : callee.name;
  }

  /** `name=value` for each argument, sorted, so the order doesn't depend on how it was built. */
  arguments(lists: readonly { args: Args; user: boolean }[]): void {
    let first = true;
    for (const { args, user } of lists) {
      const named = Object.entries(args).map(([key, value]) => ({
        name: user ? this.nameOf(key as NodeId) : key,
        value,
      }));
      for (const { name, value } of named.sort((a, b) => byName(a.name, b.name))) {
        if (!first) this.write(', ');
        first = false;
        this.write(`${name}=`);
        this.expression(value);
      }
    }
  }

  private callParts(node: { target: Expression; callee: Callee; args: Args; details: Args }): void {
    this.expression(node.target);
    this.write(`.${this.calleeName(node.callee)}(`);
    this.arguments([
      { args: node.args, user: node.callee.kind === 'user' },
      { args: node.details, user: false },
    ]);
    this.write(')');
  }

  private operand(e: Expression): void {
    if (!OPERATORS.has(e.kind)) {
      this.expression(e);
      return;
    }
    this.write('(');
    this.expression(e);
    this.write(')');
  }

  private list(items: readonly Expression[]): void {
    this.write('[');
    items.forEach((item, i) => {
      if (i > 0) this.write(', ');
      this.expression(item);
    });
    this.write(']');
  }

  expression(e: Expression): void {
    this.span(e, () => {
      switch (e.kind) {
        case 'number':
        case 'wholeNumber':
          this.write(String(e.value));
          break;
        case 'boolean':
          this.write(e.value ? 'True' : 'False');
          break;
        case 'text':
          this.write(JSON.stringify(e.value));
          break;
        case 'enum':
          this.write(`${e.type}.${e.value}`);
          break;
        case 'none':
          this.write('None');
          break;
        case 'this':
          this.write('self');
          break;
        case 'fieldRef':
          this.expression(e.target);
          this.write(`.${this.nameOf(e.field)}`);
          break;
        case 'variableRef':
          this.write(this.nameOf(e.variable));
          break;
        case 'functionCall':
          this.callParts(e);
          break;
        case 'arithmetic':
        case 'compare':
        case 'logic':
          this.operand(e.left);
          this.write(` ${SYMBOLS[e.op]!} `);
          this.operand(e.right);
          break;
        case 'join':
          this.operand(e.left);
          this.write(' + ');
          this.operand(e.right);
          break;
        case 'not':
          this.write('not ');
          this.operand(e.value);
          break;
        case 'arrayOf':
          this.list(e.items);
          break;
        case 'arrayItem':
          this.operand(e.array);
          this.write('[');
          this.expression(e.index);
          this.write(']');
          break;
        case 'arrayLength':
          this.write('len(');
          this.expression(e.array);
          this.write(')');
          break;
        default:
          this.write(NEWER);
      }
    });
  }

  private block(statements: readonly Statement[]): void {
    this.inMargin(INDENT, () => {
      if (statements.length === 0) {
        this.startLine();
        this.write('pass');
        this.endLine();
      }
      for (const statement of statements) this.statement(statement);
    });
  }

  /** The parts of a statement after its first line's text. */
  private bodied(head: () => void, body: readonly Statement[]): void {
    head();
    this.write(':');
    this.endLine();
    this.block(body);
  }

  private statementBody(s: Statement): void {
    switch (s.kind) {
      case 'doInOrder':
        this.bodied(() => this.write('do_in_order'), s.body);
        break;
      case 'doTogether':
        this.bodied(() => this.write('do_together'), s.body);
        break;
      case 'count':
        this.bodied(() => {
          this.write('for _ in range(');
          this.expression(s.times);
          this.write(')');
        }, s.body);
        break;
      case 'while':
        this.bodied(() => {
          this.write('while ');
          this.expression(s.condition);
        }, s.body);
        break;
      case 'forEach':
      case 'eachTogether':
        this.bodied(() => {
          this.write(s.kind === 'forEach' ? 'for ' : 'each_together ');
          this.span(s.item, () => this.write(s.item.name));
          this.write(' in ');
          this.expression(s.items);
        }, s.body);
        break;
      case 'if':
        this.bodied(() => {
          this.write('if ');
          this.expression(s.condition);
        }, s.then);
        if (s.else.length > 0) {
          this.startLine();
          this.bodied(() => this.write('else'), s.else);
        }
        break;
      case 'local':
        this.write(`${s.name}: ${this.type(s.type)} = `);
        this.expression(s.value);
        this.endLine();
        break;
      case 'assign':
        this.expression(s.target);
        this.write(' = ');
        this.expression(s.value);
        this.endLine();
        break;
      case 'comment':
        s.text.split('\n').forEach((line, i) => {
          if (i > 0) this.startLine();
          this.write(`# ${line}`);
          this.endLine();
        });
        break;
      case 'call':
        this.callParts(s);
        this.endLine();
        break;
      case 'return':
        this.write('return');
        if (s.value) {
          this.write(' ');
          this.expression(s.value);
        }
        this.endLine();
        break;
      default:
        this.write(`# ${NEWER}`);
        this.endLine();
    }
  }

  statement(s: Statement): void {
    const body = () => {
      this.startLine();
      this.statementBody(s);
    };
    this.lineSpan(s, s.enabled === false ? () => this.inMargin('# off: ', body) : body);
  }

  /** The span for something written on whole lines, without the margin or the last new line. */
  private lineSpan(node: AstNode, body: () => void): void {
    const place = this.spans.length;
    this.spans.push({ node: node.id, start: 0, end: 0 });
    const before = this.text.length;
    body();
    const written = this.text.slice(before);
    const start = before + (written.length - written.trimStart().length);
    this.spans[place] = { node: node.id, start, end: this.text.trimEnd().length };
  }

  private parameter(p: ParameterDecl): void {
    this.span(p, () => {
      this.write(`${p.name}: ${this.type(p.type)}`);
      if (p.default) {
        this.write(' = ');
        this.expression(p.default);
      }
    });
  }

  private parameters(params: readonly ParameterDecl[], first: boolean): void {
    params.forEach((p, i) => {
      if (i > 0 || !first) this.write(', ');
      this.parameter(p);
    });
  }

  private method(m: MethodDecl): void {
    this.lineSpan(m, () => {
      this.startLine();
      this.write(`def ${m.name}(self`);
      this.parameters(m.params, false);
      this.write(')');
      if (m.returns) this.write(` -> ${this.type(m.returns)}`);
      this.write(':');
      this.endLine();
      this.block(m.body);
    });
  }

  private listener(l: ListenerDecl): void {
    this.lineSpan(l, () => {
      this.startLine();
      this.write(`when ${l.event}(`);
      this.arguments([
        { args: l.args, user: false },
        { args: l.details, user: false },
      ]);
      this.write(')');
      if (l.params.length > 0) {
        this.write(' with (');
        this.parameters(l.params, true);
        this.write(')');
      }
      this.write(':');
      this.endLine();
      this.block(l.body);
    });
  }

  type_(t: TypeDecl): void {
    this.lineSpan(t, () => {
      this.startLine();
      this.write(`class ${t.name}(${this.type(t.extends)}):`);
      this.endLine();
      this.inMargin(INDENT, () => {
        if (t.fields.length + t.methods.length + t.listeners.length === 0) {
          this.startLine();
          this.write('pass');
          this.endLine();
        }
        for (const field of t.fields)
          this.lineSpan(field, () => {
            this.startLine();
            this.write(`${field.name}: ${this.type(field.type)}`);
            if (field.initial) {
              this.write(' = ');
              this.expression(field.initial);
            } else this.write('  # set in the scene');
            this.endLine();
          });
        for (const method of t.methods) {
          this.gap();
          this.method(method);
        }
        for (const listener of t.listeners) {
          this.gap();
          this.listener(listener);
        }
      });
    });
  }

  /** A blank line, unless this is the first thing in the class. */
  gap(): void {
    if (!this.text.endsWith(':\n')) this.write('\n');
  }
}

/** The program as text, with where each node is in it. */
export function programText(program: Program): ProgramText {
  const out = new Writer(program);
  program.types.forEach((type, i) => {
    if (i > 0) out.write('\n');
    out.type_(type);
  });
  return { text: out.text, spans: out.spans };
}
