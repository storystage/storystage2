import { nodeId, programText, type Program, type Statement } from '@storystage/ast';
import { ids, sampleProgram } from '@storystage/ast/testing';
import { describe, expect, it } from 'vitest';
import { constantName, javaText } from './java.ts';
import { linesOf, textOf } from './text.ts';

/** The sample with statements in place of the main method's body. */
function withBody(body: readonly Statement[]): Program {
  const p = sampleProgram();
  const scene = p.types[0]!;
  const methods = [{ ...scene.methods[0]!, body }, ...scene.methods.slice(1)];
  return { ...p, types: [{ ...scene, methods }] };
}

let n = 0;
const id = () => nodeId(`t${(n++).toString(36).padStart(5, '0')}`);
const note = (text: string): Statement => ({ id: id(), kind: 'comment', text });
const count = (times: number, body: Statement[]): Statement => ({
  id: id(),
  kind: 'count',
  times: { id: id(), kind: 'wholeNumber', value: times },
  body,
});

describe('javaText (Alice’s Java formatter, WP7.6)', () => {
  it('writes the sample as Java-like text', () => {
    expect(javaText(sampleProgram()).text).toBe(`class Scene1 extends Scene {
    Camera camera;  // set in the scene
    Quadruped cat;  // set in the scene
    WholeNumber score = 0;

    public void myFirstMethod() {
        this.cat.say("Hello");
        doTogether {
            this.cat.move(MoveDirection.FORWARD, 1.0, Move.duration(2.0));
            // off: this.cat.turn(TurnDirection.LEFT, 0.25);
        }
        for (int i = 0; i < 3; i++) {
            this.score = this.score + 1;
        }
        Number x = this.cat.getDistanceTo(null);
        // Now the cat looks around
        for (Quadruped item : { this.cat }) {
        }
        eachTogether (Quadruped item : this.cat) {
        }
        if ((x < 2.0) && (!false)) {
            this.cat.say("Near");
        }
        while (false) {
        }
        doInOrder {
            this.hop(2.0);
        }
    }

    public void hop(Number height = 1.0) {
    }

    public WholeNumber double() {
        return "a" + {}.length;
    }

    this.onClickOnObject(ClickOnObject.setOfVisuals({ this.cat }), (Quadruped model) -> {
        model.say({}[0]);
    });
}
`);
  });

  it('has a span for every node the Python-like text has', () => {
    const p = sampleProgram();
    const nodes = (spans: readonly { node: string }[]) => spans.map((s) => s.node).sort();
    expect(nodes(javaText(p).spans)).toEqual(nodes(programText(p).spans));
  });

  it('gives each statement its whole text, from its first word to its closing brace', () => {
    const { text, spans } = javaText(sampleProgram());
    const of = (node: string) => {
      const s = spans.find((x) => x.node === node)!;
      return text.slice(s.start, s.end);
    };
    expect(of(ids.say)).toBe('this.cat.say("Hello");');
    expect(of(ids.turn)).toBe('// off: this.cat.turn(TurnDirection.LEFT, 0.25);');
    expect(of(ids.count)).toBe(
      'for (int i = 0; i < 3; i++) {\n            this.score = this.score + 1;\n        }',
    );
    expect(of(ids.height)).toBe('Number height = 1.0');
  });

  it('names counters i, j and k by how deep they are, and writes else after its brace', () => {
    const branch: Statement = {
      id: id(),
      kind: 'if',
      condition: { id: id(), kind: 'boolean', value: true },
      then: [note('yes')],
      else: [note('no')],
    };
    const { text } = javaText(withBody([count(2, [count(3, [count(4, [])])]), branch]));
    expect(text).toContain('for (int i = 0; i < 2; i++) {');
    expect(text).toContain('for (int j = 0; j < 3; j++) {');
    expect(text).toContain('for (int k = 0; k < 4; k++) {');
    expect(text).toContain(
      'if (true) {\n            // yes\n        } else {\n            // no\n        }',
    );
  });

  it('writes a constant as final, and a listener with no arguments', () => {
    const local: Statement = {
      id: id(),
      kind: 'local',
      name: 'steps',
      type: { kind: 'story', name: 'WholeNumber' },
      value: { id: id(), kind: 'wholeNumber', value: 4 },
      constant: true,
    };
    const p = withBody([local]);
    const scene = p.types[0]!;
    const start = {
      id: id(),
      kind: 'listener',
      event: 'sceneStart',
      args: {},
      details: {},
      params: [],
      body: [],
    } as const;
    const { text } = javaText({ ...p, types: [{ ...scene, listeners: [start] }] });
    expect(text).toContain('final WholeNumber steps = 4;');
    expect(text).toContain('this.onSceneStart(() -> {\n    });');
  });

  it('writes choices as Java constants', () => {
    expect(constantName('forward')).toBe('FORWARD');
    expect(constantName('beginAndEndGently')).toBe('BEGIN_AND_END_GENTLY');
    expect(constantName('x2y')).toBe('X2Y');
  });
});

describe('textOf', () => {
  it('gives the Python-like text as programText writes it', () => {
    const p = sampleProgram();
    const { text, spans } = programText(p);
    expect(textOf(p, { style: 'python' })).toMatchObject({ text, spans });
  });

  for (const style of ['python', 'java'] as const) {
    it(`takes one method out of its class (${style})`, () => {
      const p = sampleProgram();
      const whole = textOf(p, { style });
      const one = textOf(p, { style, method: ids.main });
      expect(
        one.text.startsWith(
          style === 'java'
            ? 'public void myFirstMethod() {\n    this'
            : 'def myFirstMethod(self):\n    self',
        ),
      ).toBe(true);
      expect(one.text.endsWith(style === 'java' ? '\n}\n' : 'self.hop(height=2)\n')).toBe(true);
      // Every node in the method, and only those, with the same text but four spaces less indent.
      const unindent = (s: string) => s.replace(/\n {4}/g, '\n');
      const inWhole = new Map(whole.spans.map((s) => [s.node, whole.text.slice(s.start, s.end)]));
      for (const s of one.spans)
        expect(one.text.slice(s.start, s.end)).toBe(unindent(inWhole.get(s.node)!));
      expect(one.spans.map((s) => s.node)).not.toContain(ids.hop);
      expect(one.spans.map((s) => s.node)).toContain(ids.callHop);
    });
  }

  it('gives each line its block: the one starting on it, or the one it closes', () => {
    const { lines } = textOf(sampleProgram(), { style: 'java', method: ids.main });
    expect(lines.map((l) => l.node)).toEqual([
      ids.main,
      ids.say,
      ids.together,
      ids.move,
      ids.turn,
      ids.together,
      ids.count,
      ids.add,
      ids.count,
      ids.local,
      ids.note,
      ids.loop,
      ids.loop,
      ids.each,
      ids.each,
      ids.branch,
      lines[16]!.node, // the say inside the if
      ids.branch,
      ids.whileLoop,
      ids.whileLoop,
      ids.sequence,
      ids.callHop,
      ids.sequence,
      ids.main,
    ]);
    expect(lines[16]!.text.trim()).toBe('this.cat.say("Near");');
  });

  it('gives a blank line no block, and the class its own lines', () => {
    const { lines } = textOf(sampleProgram(), { style: 'python' });
    expect(lines[0]).toEqual({ text: 'class Scene1(Scene):', start: 0, node: ids.scene });
    expect(lines[1]!.node).toBe(ids.camera);
    expect(lines[4]).toMatchObject({ text: '', node: null });
  });

  it('is empty for a method that isn’t there', () => {
    expect(textOf(sampleProgram(), { style: 'java', method: nodeId('nowher') })).toEqual({
      text: '',
      spans: [],
      lines: [],
    });
  });
});

describe('linesOf', () => {
  it('gives the lines a block runs over, and the line a value is on', () => {
    const text = textOf(sampleProgram(), { style: 'java', method: ids.main });
    expect(linesOf(text, ids.count)).toEqual([6, 7, 8]);
    expect(linesOf(text, ids.say)).toEqual([1]);
    const amount = text.spans.find((s) => text.text.slice(s.start, s.end) === '1.0')!;
    expect(linesOf(text, amount.node)).toEqual([3]);
    expect(linesOf(text, ids.hop)).toEqual([]);
  });
});
