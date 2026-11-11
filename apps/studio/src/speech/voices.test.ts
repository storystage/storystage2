import { nodeId, type Statement } from '@storystage/ast';
import { exampleProduction, type Production } from '@storystage/production';
import type { AudioOut } from '@storystage/speech';
import { describe, expect, it, vi } from 'vitest';
import { hasSpeakLines, speakLines } from './speakLines.ts';
import { Voices, productionVoices, voiceOf } from './voices.ts';

// Speak lines' voices in the studio (spec 06 sections 4.3, 4.5, 4.6) on a fake engine.

const example = exampleProduction();
const s1 = example.scenes[0]!;

const speak = (n: string, text: string, extra: Partial<Statement> = {}): Statement =>
  ({
    id: nodeId(`speak${n}`),
    kind: 'call',
    target: {
      id: nodeId(`speak${n}r`),
      kind: 'fieldRef',
      target: { id: nodeId(`speak${n}s`), kind: 'this' },
      field: nodeId('scene1p'),
    },
    callee: { kind: 'story', name: 'speakLine' },
    args: { text: { id: nodeId(`speak${n}x`), kind: 'text', value: text } },
    details: {},
    ...extra,
  }) as Statement;

/** The example with these statements added to scene 1's script method. */
function withLines(...added: Statement[]): Production {
  const [type, ...types] = example.program.types;
  const [method, ...methods] = type!.methods;
  return {
    ...example,
    program: {
      ...example.program,
      types: [
        { ...type!, methods: [{ ...method!, body: [...method!.body, ...added] }, ...methods] },
        ...types,
      ],
    },
  };
}

const one = speak('a', 'Oh no, the ice is moving!', {
  details: {
    line: { id: nodeId('speakal'), kind: 'text', value: 'l1' },
    duration: { id: nodeId('speakad'), kind: 'number', value: 2 },
  },
} as Partial<Statement>);
const two = speak('b', 'Hold on, fox!');

describe('speakLines', () => {
  it('finds each speak line with written words, who says it and its script line', () => {
    const p = withLines(one, two);
    expect(hasSpeakLines(example.program)).toBe(false);
    expect(hasSpeakLines(p.program)).toBe(true);
    expect(speakLines(p)).toEqual([
      {
        node: one.id,
        scene: s1.id,
        object: 'penguin',
        text: 'Oh no, the ice is moving!',
        line: 'l1',
        duration: 2,
      },
      { node: two.id, scene: s1.id, object: 'penguin', text: 'Hold on, fox!' },
    ]);
  });

  it('leaves out a line whose words aren’t written in the block', () => {
    const asked = speak('c', '', {
      args: { text: { id: nodeId('speakcq'), kind: 'variableRef', variable: nodeId('nowhere') } },
    } as Partial<Statement>);
    expect(speakLines(withLines(asked))).toEqual([]);
  });
});

describe('each character’s voice', () => {
  it('is one per model, the same in every scene, from its class', () => {
    const voices = productionVoices(example);
    const penguin1 = voiceOf(example, voices, s1.id, 'penguin');
    const s3 = example.scenes[2]!;
    expect(penguin1).not.toBeNull();
    expect(voiceOf(example, voices, s3.id, 'penguin')).toEqual(penguin1);
    expect(voiceOf(example, voices, s1.id, 'fox')).not.toEqual(penguin1);
    expect(penguin1!.accent).toBe('british');
    expect(voiceOf(example, voices, s1.id, 'nobody')).toBeNull();
  });
});

function fakes(fail = false) {
  const said: string[] = [];
  const engine = {
    sampleRate: 24_000,
    speak: vi.fn(async (text: string) => {
      if (fail) throw new Error('No Kokoro here.');
      said.push(text);
      return new Float32Array(2400);
    }),
    dispose: vi.fn(),
  };
  const played: Float32Array[] = [];
  const out: AudioOut = { play: (s) => void played.push(s), stop: vi.fn() };
  return { engine, out, said, played };
}

const settle = async () => {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
};

describe('Voices', () => {
  it('makes each line’s sound as the code changes, and plays it as its block starts', async () => {
    const f = fakes();
    const voices = new Voices({ engine: () => f.engine, out: () => f.out, settle: 0 });
    voices.update(withLines(one, two));
    await settle();
    expect(f.said.sort()).toEqual(['Hold on, fox!', 'Oh no, the ice is moving!']);
    expect(voices.state).toEqual({ status: 'ready', silent: 0 });
    voices.start(one.id);
    expect(f.played).toHaveLength(1);
    voices.start(nodeId('notASpeakLine'));
    expect(f.played).toHaveLength(1);
    voices.stop();
    expect(f.out.stop).toHaveBeenCalled();
  });

  it('gives the export the same sounds (S2’s FilmVoices)', async () => {
    const f = fakes();
    const voices = new Voices({ engine: () => f.engine, out: () => f.out, settle: 0 });
    voices.update(withLines(one));
    await settle();
    const film = voices.forFilm();
    expect(film.sampleRate).toBe(24_000);
    const line = { scene: s1.id, object: 'penguin', text: 'Oh no, the ice is moving!', seconds: 2 };
    await film.prepare([line]);
    expect(film.sound(line)).toBeInstanceOf(Float32Array);
    expect(film.sound({ ...line, object: 'nobody' })).toBeUndefined();
  });

  it('says when the lines can’t be voiced on this device, and keeps their captions', async () => {
    const f = fakes(true);
    const voices = new Voices({ engine: () => f.engine, out: () => f.out, settle: 0 });
    voices.update(withLines(one, two));
    await settle();
    expect(voices.state).toEqual({ status: 'unavailable', silent: 2 });
  });

  it('loads nothing for a film with no speak lines, and lets the engine go when asleep', async () => {
    const f = fakes();
    const make = vi.fn(() => f.engine);
    const voices = new Voices({ engine: make, out: () => f.out, settle: 0 });
    voices.update(example);
    await settle();
    expect(make).not.toHaveBeenCalled();
    expect(voices.state.status).toBe('idle');
    voices.update(withLines(one));
    await settle();
    voices.sleep();
    expect(f.engine.dispose).toHaveBeenCalled();
  });
});
