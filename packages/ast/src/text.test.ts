import { describe, expect, it } from 'vitest';
import { newProgram } from './build.ts';
import { applyEdit } from './edits.ts';
import { nodeId, type NodeId } from './ids.ts';
import type { Expression, Program, Statement, TypeDecl } from './nodes.ts';
import { serializeProgram } from './serialize.ts';
import { ids, sampleProgram } from './testing.ts';
import { programText } from './text.ts';
import { walkProgram } from './walk.ts';

const spanOf = (program: Program, id: NodeId) => {
  const { text, spans } = programText(program);
  const span = spans.find((s) => s.node === id);
  return span ? text.slice(span.start, span.end) : null;
};

/** The sample with statements in place of the main method's body. */
function withBody(body: readonly Statement[]): Program {
  const p = sampleProgram();
  const scene = p.types[0]!;
  const methods = [{ ...scene.methods[0]!, body }, ...scene.methods.slice(1)];
  return { ...p, types: [{ ...scene, methods }] };
}

const expr = (id: string, rest: object): Expression => ({ id: nodeId(id), ...rest }) as Expression;
const none = (id: string) => expr(id, { kind: 'none' });
const asText = (e: Expression) =>
  programText(withBody([{ id: nodeId('holder'), kind: 'return', value: e }]))
    .text.split('\n')
    .find((l) => l.includes('return '))!
    .trim()
    .slice('return '.length);

describe('programText', () => {
  it('writes the sample as Python-like text', () => {
    expect(programText(sampleProgram()).text).toBe(`class Scene1(Scene):
    camera: Camera  # set in the scene
    cat: Quadruped  # set in the scene
    score: WholeNumber = 0

    def myFirstMethod(self):
        self.cat.say(text="Hello")
        do_together:
            self.cat.move(amount=1, direction=Direction.forward, duration=2)
            # off: self.cat.turn(amount=0.25, direction=Direction.left)
        for _ in range(3):
            self.score = self.score + 1
        x: Number = self.cat.getDistanceTo(other=None)
        # Now the cat looks around
        for item in [self.cat]:
            pass
        each_together item in self.cat:
            pass
        if (x < 2) and (not False):
            self.cat.say(text="Near")
        while False:
            pass
        do_in_order:
            self.hop(height=2)

    def hop(self, height: Number = 1):
        pass

    def double(self) -> WholeNumber:
        return "a" + len([])

    when mouseClickObject(objects=[self.cat]) with (clicked: Quadruped):
        clicked.say(text=[][0])
`);
  });

  it('writes an empty program as nothing', () => {
    expect(programText({ schemaVersion: '1.0.0', types: [] })).toEqual({ text: '', spans: [] });
  });

  it('writes a new program', () => {
    const { text } = programText(newProgram(() => 0.5));
    expect(text).toContain('class Scene1(Scene):');
    expect(text).toContain('def myFirstMethod(self):\n        pass');
  });

  it('shows an else only when there is something in it', () => {
    const branch: Statement = {
      id: nodeId('ifstat'),
      kind: 'if',
      condition: expr('condit', { kind: 'boolean', value: true }),
      then: [],
      else: [{ id: nodeId('commnt'), kind: 'comment', text: 'no' }],
    };
    expect(programText(withBody([branch])).text).toContain(
      '        if True:\n            pass\n        else:\n            # no\n',
    );
  });

  it('puts a comment over several lines', () => {
    const text = programText(
      withBody([{ id: nodeId('commnt'), kind: 'comment', text: 'one\ntwo' }]),
    ).text;
    expect(text).toContain('        # one\n        # two\n');
  });

  it('marks every line of a block that is switched off', () => {
    const block: Statement = {
      id: nodeId('blocka'),
      kind: 'doInOrder',
      enabled: false,
      body: [{ id: nodeId('commnt'), kind: 'comment', text: 'hi' }],
    };
    expect(programText(withBody([block])).text).toContain(
      '        # off: do_in_order:\n        # off:     # hi\n',
    );
  });

  it('escapes text, so a quote or a new line can not break out', () => {
    expect(asText(expr('textaa', { kind: 'text', value: 'say "hi"\nthere' }))).toBe(
      '"say \\"hi\\"\\nthere"',
    );
  });

  it('brackets nested operators', () => {
    const a = expr('aaaaaa', { kind: 'number', value: 1 });
    const b = expr('bbbbbb', { kind: 'number', value: 2 });
    const sum = expr('sumsum', { kind: 'arithmetic', op: 'add', left: a, right: b });
    const c = expr('cccccc', { kind: 'number', value: 3 });
    expect(
      asText(expr('prodpr', { kind: 'arithmetic', op: 'multiply', left: sum, right: c })),
    ).toBe('(1 + 2) * 3');
  });

  it.each([
    ['add', '+'],
    ['subtract', '-'],
    ['multiply', '*'],
    ['divide', '/'],
    ['remainder', '%'],
  ])('writes %s as %s', (op, word) => {
    expect(
      asText(
        expr('opopop', { kind: 'arithmetic', op, left: none('leftaa'), right: none('rightt') }),
      ),
    ).toBe(`None ${word} None`);
  });

  it.each([
    ['equal', '=='],
    ['notEqual', '!='],
    ['less', '<'],
    ['lessOrEqual', '<='],
    ['greater', '>'],
    ['greaterOrEqual', '>='],
  ])('writes %s as %s', (op, word) => {
    expect(
      asText(expr('opopop', { kind: 'compare', op, left: none('leftaa'), right: none('rightt') })),
    ).toBe(`None ${word} None`);
  });

  it('writes a user type and a list of them', () => {
    const scene = sampleProgram().types[0]!;
    const cat: TypeDecl = {
      id: nodeId('cattyp'),
      kind: 'type',
      name: 'Cat',
      extends: { kind: 'user', type: scene.id },
      fields: [
        {
          id: nodeId('catsfd'),
          kind: 'field',
          name: 'friends',
          type: { kind: 'array', of: { kind: 'user', type: nodeId('cattyp') } },
          initial: null,
        },
      ],
      methods: [],
      listeners: [],
    };
    const text = programText({ schemaVersion: '1.0.0', types: [scene, cat] }).text;
    expect(text).toContain('class Cat(Scene1):\n    friends: Cat[]  # set in the scene\n');
  });

  it('writes pass for a class with nothing in it', () => {
    const empty: TypeDecl = {
      id: nodeId('emptyt'),
      kind: 'type',
      name: 'Empty',
      extends: { kind: 'story', name: 'Prop' },
      fields: [],
      methods: [],
      listeners: [],
    };
    expect(programText({ schemaVersion: '1.0.0', types: [empty] }).text).toBe(
      'class Empty(Prop):\n    pass\n',
    );
  });

  it('shows a rename at once, everywhere it is used', () => {
    const { program } = applyEdit(sampleProgram(), {
      kind: 'rename',
      label: 'x',
      node: ids.cat,
      name: 'tom',
    });
    const { text } = programText(program);
    expect(text).toContain('tom: Quadruped');
    expect(text).toContain('self.tom.say(text="Hello")');
    expect(text).not.toContain('self.cat');
  });

  it("doesn't depend on how a program was built", () => {
    const p = sampleProgram();
    expect(programText(JSON.parse(serializeProgram(p)) as Program)).toEqual(programText(p));
  });

  it('names a user argument by its parameter', () => {
    expect(programText(sampleProgram()).text).toContain('self.hop(height=2)');
  });

  describe('spans', () => {
    it('find a statement and an argument', () => {
      expect(spanOf(sampleProgram(), ids.say)).toBe('self.cat.say(text="Hello")');
      const call = sampleProgram().types[0]!.methods[0]!.body[0] as Statement & { kind: 'call' };
      expect(spanOf(sampleProgram(), call.args.text!.id)).toBe('"Hello"');
      expect(spanOf(sampleProgram(), call.target.id)).toBe('self.cat');
    });

    it('cover a whole block', () => {
      const span = spanOf(sampleProgram(), ids.together);
      expect(span?.startsWith('do_together:')).toBe(true);
      expect(span?.endsWith('direction=Direction.left)')).toBe(true);
    });

    it('find declarations', () => {
      expect(spanOf(sampleProgram(), ids.cat)).toBe('cat: Quadruped  # set in the scene');
      expect(spanOf(sampleProgram(), ids.height)).toBe('height: Number = 1');
      expect(spanOf(sampleProgram(), ids.hop)?.startsWith('def hop(')).toBe(true);
      expect(spanOf(sampleProgram(), ids.item)).toBe('item');
      expect(spanOf(sampleProgram(), ids.click)?.startsWith('when mouseClickObject(')).toBe(true);
    });

    it('exist for every node, and nest', () => {
      const program = sampleProgram();
      const { spans, text } = programText(program);
      const all = new Set(spans.map((s) => s.node));
      walkProgram(program, (n) => expect(all.has(n.id), n.kind).toBe(true));
      for (const s of spans) {
        expect(s.start).toBeLessThan(s.end);
        expect(s.end).toBeLessThanOrEqual(text.length);
      }
    });
  });

  describe('a file from a newer version, already through the lenient check', () => {
    const odd = { id: nodeId('oddone'), kind: 'dance' } as unknown as Statement;

    it('shows an unknown statement as a comment, and an unknown value in place', () => {
      const text = programText(withBody([odd])).text;
      expect(text).toContain('        # (from a newer StoryStage)\n');
      expect(asText(expr('oddval', { kind: 'sparkle' }))).toBe('(from a newer StoryStage)');
    });

    it('survives a reference to something it can not find', () => {
      const ref = expr('reffff', {
        kind: 'fieldRef',
        target: expr('thisth', { kind: 'this' }),
        field: 'nosuch',
      });
      expect(asText(ref)).toBe('self.?');
    });
  });
});
