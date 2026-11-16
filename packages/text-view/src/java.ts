/**
 * The program as read-only Java-like text, following Alice 3's Java formatter (WP7.6): `this`,
 * semicolons and braces, arguments in the order the Story API gives them, details as
 * `Move.duration(2.0)` and choices as `MoveDirection.FORWARD`. The Python-like wording is
 * `programText` in `ast`; this gives the same spans, so highlighting works the same in both.
 */
import { indexProgram, nameOf } from '@storystage/ast';
import type {
  Args,
  AstNode,
  Callee,
  Expression,
  ListenerDecl,
  Location,
  MethodDecl,
  NodeId,
  ParameterDecl,
  Program,
  ProgramText,
  Statement,
  TextSpan,
  TypeDecl,
  TypeRef,
} from '@storystage/ast';
import { ENTRIES, EVENTS } from '@storystage/story-api';

const NEWER = '/* from a newer StoryStage */';
const INDENT = '    ';
const OFF = '// off: ';

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
  and: '&&',
  or: '||',
};

const OPERATORS: ReadonlySet<string> = new Set(['arithmetic', 'compare', 'logic', 'join', 'not']);

/** The loop counters, by how deep a count is inside others. */
const COUNTERS = ['i', 'j', 'k'];

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const capital = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);
/** `forward` → `FORWARD`, `beginAndEndGently` → `BEGIN_AND_END_GENTLY`, as Java's constants. */
export const constantName = (value: string) =>
  value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/** A Number shows its point, as Alice's Java does (1.0); a WholeNumber doesn't. */
const decimal = (value: number) =>
  Number.isInteger(value) && Math.abs(value) < 1e21 ? value.toFixed(1) : String(value);

/** The order of each procedure's, function's and event's arguments, by name. */
const ORDER: ReadonlyMap<string, readonly string[]> = new Map([
  ...ENTRIES.map((e) => [e.name, e.params.map((p) => p.name)] as const),
  ...EVENTS.map((e) => [e.name, e.args.map((p) => p.name)] as const),
]);

class JavaWriter {
  text = '';
  readonly spans: TextSpan[] = [];
  private margin = '';
  private counters = 0;
  private readonly index: ReadonlyMap<NodeId, Location>;

  constructor(program: Program) {
    this.index = indexProgram(program);
  }

  private write(text: string): void {
    this.text += text;
  }

  private span(node: AstNode, body: () => void): void {
    const place = this.spans.length;
    this.spans.push({ node: node.id, start: 0, end: 0 });
    const start = this.text.length;
    body();
    this.spans[place] = { node: node.id, start, end: this.text.length };
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

  private startLine(): void {
    this.text += this.margin;
  }

  private endLine(): void {
    this.text += '\n';
  }

  private inMargin(extra: string, body: () => void): void {
    const margin = this.margin;
    this.margin += extra;
    body();
    this.margin = margin;
  }

  private nameOf(id: NodeId): string {
    const at = this.index.get(id);
    return (at && nameOf(at.node)) ?? '?';
  }

  private type(ref: TypeRef): string {
    if (ref.kind === 'array') return `${this.type(ref.of)}[]`;
    return ref.kind === 'user' ? this.nameOf(ref.type) : ref.name;
  }

  private calleeName(callee: Callee): string {
    return callee.kind === 'user' ? this.nameOf(callee.method) : callee.name;
  }

  /** Values without names, in the order the method takes them, then the details by name. */
  private arguments(of: string, args: Args, details: Args, user: boolean): void {
    let first = true;
    const comma = () => {
      if (!first) this.write(', ');
      first = false;
    };
    const order = ORDER.get(of) ?? [];
    const place = (key: string) => {
      if (user) {
        const at = this.index.get(key as NodeId);
        return typeof at?.key === 'number' ? at.key : Infinity;
      }
      const i = order.indexOf(key);
      return i < 0 ? Infinity : i;
    };
    const keys = Object.keys(args).sort((a, b) => place(a) - place(b) || byName(a, b));
    for (const key of keys) {
      comma();
      this.expression(args[key]!);
    }
    for (const key of Object.keys(details).sort(byName)) {
      comma();
      this.write(`${capital(of)}.${key}(`);
      this.expression(details[key]!);
      this.write(')');
    }
  }

  private callParts(node: { target: Expression; callee: Callee; args: Args; details: Args }): void {
    const name = this.calleeName(node.callee);
    this.expression(node.target);
    this.write(`.${name}(`);
    this.arguments(name, node.args, node.details, node.callee.kind === 'user');
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

  expression(e: Expression): void {
    this.span(e, () => {
      switch (e.kind) {
        case 'number':
          this.write(decimal(e.value));
          break;
        case 'wholeNumber':
          this.write(String(e.value));
          break;
        case 'boolean':
          this.write(e.value ? 'true' : 'false');
          break;
        case 'text':
          this.write(JSON.stringify(e.value));
          break;
        case 'enum':
          this.write(`${e.type}.${constantName(e.value)}`);
          break;
        case 'none':
          this.write('null');
          break;
        case 'this':
          this.write('this');
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
          this.write('!');
          this.operand(e.value);
          break;
        case 'arrayOf':
          this.write('{');
          e.items.forEach((item, i) => {
            this.write(i > 0 ? ', ' : ' ');
            this.expression(item);
          });
          this.write(e.items.length > 0 ? ' }' : '}');
          break;
        case 'arrayItem':
          this.operand(e.array);
          this.write('[');
          this.expression(e.index);
          this.write(']');
          break;
        case 'arrayLength':
          this.operand(e.array);
          this.write('.length');
          break;
        default:
          this.write(NEWER);
      }
    });
  }

  /** ` {`, the statements a margin in, and the closing brace on a line of its own. */
  private block(statements: readonly Statement[], close = '}'): void {
    this.write(' {');
    this.endLine();
    this.inMargin(INDENT, () => {
      for (const statement of statements) this.statement(statement);
    });
    this.startLine();
    this.write(close);
    this.endLine();
  }

  private statementBody(s: Statement): void {
    switch (s.kind) {
      case 'doInOrder':
        this.write('doInOrder');
        this.block(s.body);
        break;
      case 'doTogether':
        this.write('doTogether');
        this.block(s.body);
        break;
      case 'count': {
        const n = this.counters;
        const i = COUNTERS[n] ?? `i${n + 1}`;
        this.write(`for (int ${i} = 0; ${i} < `);
        this.expression(s.times);
        this.write(`; ${i}++)`);
        this.counters++;
        this.block(s.body);
        this.counters--;
        break;
      }
      case 'while':
        this.write('while (');
        this.expression(s.condition);
        this.write(')');
        this.block(s.body);
        break;
      case 'forEach':
      case 'eachTogether':
        this.write(s.kind === 'forEach' ? 'for (' : 'eachTogether (');
        this.span(s.item, () => this.write(`${this.type(s.item.type)} ${s.item.name}`));
        this.write(' : ');
        this.expression(s.items);
        this.write(')');
        this.block(s.body);
        break;
      case 'if':
        this.write('if (');
        this.expression(s.condition);
        this.write(')');
        if (s.else.length === 0) {
          this.block(s.then);
          break;
        }
        this.write(' {');
        this.endLine();
        this.inMargin(INDENT, () => {
          for (const statement of s.then) this.statement(statement);
        });
        this.startLine();
        this.write('} else');
        this.block(s.else);
        break;
      case 'local':
        this.write(`${s.constant ? 'final ' : ''}${this.type(s.type)} ${s.name} = `);
        this.expression(s.value);
        this.write(';');
        this.endLine();
        break;
      case 'assign':
        this.expression(s.target);
        this.write(' = ');
        this.expression(s.value);
        this.write(';');
        this.endLine();
        break;
      case 'comment':
        s.text.split('\n').forEach((line, i) => {
          if (i > 0) this.startLine();
          this.write(`// ${line}`);
          this.endLine();
        });
        break;
      case 'call':
        this.callParts(s);
        this.write(';');
        this.endLine();
        break;
      case 'return':
        this.write('return');
        if (s.value) {
          this.write(' ');
          this.expression(s.value);
        }
        this.write(';');
        this.endLine();
        break;
      default:
        this.write(`// ${NEWER}`);
        this.endLine();
    }
  }

  statement(s: Statement): void {
    const body = () => {
      this.startLine();
      this.statementBody(s);
    };
    this.lineSpan(s, s.enabled === false ? () => this.inMargin(OFF, body) : body);
  }

  private parameter(p: ParameterDecl): void {
    this.span(p, () => {
      this.write(`${this.type(p.type)} ${p.name}`);
      if (p.default) {
        this.write(' = ');
        this.expression(p.default);
      }
    });
  }

  private parameters(params: readonly ParameterDecl[]): void {
    params.forEach((p, i) => {
      if (i > 0) this.write(', ');
      this.parameter(p);
    });
  }

  method(m: MethodDecl): void {
    this.lineSpan(m, () => {
      this.startLine();
      this.write(`public ${m.returns ? this.type(m.returns) : 'void'} ${m.name}(`);
      this.parameters(m.params);
      this.write(')');
      this.block(m.body);
    });
  }

  listener(l: ListenerDecl): void {
    this.lineSpan(l, () => {
      this.startLine();
      this.write(`this.on${capital(l.event)}(`);
      this.arguments(l.event, l.args, l.details, false);
      if (Object.keys(l.args).length + Object.keys(l.details).length > 0) this.write(', ');
      this.write('(');
      this.parameters(l.params);
      this.write(') ->');
      this.block(l.body, '});');
    });
  }

  type_(t: TypeDecl): void {
    this.lineSpan(t, () => {
      this.startLine();
      this.write(`class ${t.name} extends ${this.type(t.extends)} {`);
      this.endLine();
      this.inMargin(INDENT, () => {
        for (const field of t.fields)
          this.lineSpan(field, () => {
            this.startLine();
            this.write(`${this.type(field.type)} ${field.name}`);
            if (field.initial) {
              this.write(' = ');
              this.expression(field.initial);
              this.write(';');
            } else this.write(';  // set in the scene');
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
      this.startLine();
      this.write('}');
      this.endLine();
    });
  }

  /** A blank line, unless this is the first thing in the class. */
  private gap(): void {
    if (!this.text.endsWith('{\n')) this.write('\n');
  }
}

/** The program as Java-like text, with where each node is in it. */
export function javaText(program: Program): ProgramText {
  const out = new JavaWriter(program);
  program.types.forEach((type, i) => {
    if (i > 0) out.text += '\n';
    out.type_(type);
  });
  return { text: out.text, spans: out.spans };
}
