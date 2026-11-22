import { nodeId, type Statement } from '@storystage/ast';
import { exampleProduction, type Production } from '@storystage/production';
import type { AudioOut } from '@storystage/speech';
import { describe, expect, it, vi } from 'vitest';
import { hasSpeakLines, speakLines } from './speakLines.ts';
import { Voices, productionVoices, voiceOf, withAccent, withPreset } from './voices.ts';

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
  it('is one per character, by name, the same in every scene, from its class', () => {
    const voices = productionVoices(example);
    const penguin1 = voiceOf(example, voices, s1.id, 'penguin');
    const s3 = example.scenes[2]!;
    expect(penguin1).not.toBeNull();
    expect(voiceOf(example, voices, s3.id, 'penguin')).toEqual(penguin1);
    expect(voiceOf(example, voices, s1.id, 'fox')).not.toEqual(penguin1);
    expect(penguin1!.accent).toBe('british');
    expect(voiceOf(example, voices, s1.id, 'nobody')).toBeNull();
  });

  it('is the film’s own when it has one, and the rest follow its accent', () => {
    const fox = {
      preset: 'animal',
      base: 'am_adam',
      pitch: 0.9,
      formant: 1.1,
      speed: 1,
      accent: 'american',
    } as const;
    const p: Production = { ...example, manifest: { ...example.manifest, voices: { fox } } };
    const voices = productionVoices(p);
    expect(voiceOf(p, voices, s1.id, 'fox')).toEqual(fox);
    expect(voiceOf(p, voices, s1.id, 'penguin')!.accent).toBe('american');
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
  const delays: (number | undefined)[] = [];
  const out: AudioOut = {
    play: (s, _rate, delay) => {
      played.push(s);
      delays.push(delay);
    },
    stop: vi.fn(),
  };
  return { engine, out, said, played, delays };
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

/** The browser version's files: `bytes` to download, and a download that reports progress. */
function files(bytes: number, fail = false) {
  return {
    toDownload: vi.fn(async () => bytes),
    download: vi.fn(async (onProgress: (done: number, total: number) => void) => {
      onProgress(bytes / 2, bytes);
      if (fail) throw new Error('offline');
      onProgress(bytes, bytes);
    }),
  };
}

describe('the browser version’s voices (spec 06 section 4.6)', () => {
  it('asks before downloading, makes nothing until agreed, then downloads with progress', async () => {
    const f = fakes();
    const make = vi.fn(() => f.engine);
    const kokoro = files(121_000_000);
    const voices = new Voices({ engine: make, out: () => f.out, settle: 0, files: kokoro });
    voices.update(withLines(one));
    await settle();
    expect(voices.state).toMatchObject({ status: 'ask', download: { total: 121_000_000 } });
    expect(make).not.toHaveBeenCalled();
    voices.start(one.id);
    expect(f.played).toHaveLength(0);
    const seen: string[] = [];
    voices.subscribe(() => seen.push(voices.state.status));
    await voices.download();
    await settle();
    expect(seen).toContain('downloading');
    expect(voices.state).toMatchObject({ status: 'ready', silent: 0 });
    expect(f.said).toEqual(['Oh no, the ice is moving!']);
  });

  it('doesn’t ask when the voices are already on this device', async () => {
    const f = fakes();
    const voices = new Voices({
      engine: () => f.engine,
      out: () => f.out,
      settle: 0,
      files: files(0),
    });
    voices.update(withLines(one));
    await settle();
    expect(voices.state.status).toBe('ready');
  });

  it('says so when the download fails, and asks again', async () => {
    const f = fakes();
    const voices = new Voices({
      engine: () => f.engine,
      out: () => f.out,
      settle: 0,
      files: files(1000, true),
    });
    voices.update(withLines(one));
    await settle();
    await voices.download();
    expect(voices.state).toMatchObject({ status: 'ask', problem: expect.stringMatching(/\w/) });
  });
});

describe('Rehearse’s timing and Settings › Voices', () => {
  it('starts a line when the picture gets there', async () => {
    const f = fakes();
    const voices = new Voices({ engine: () => f.engine, out: () => f.out, settle: 0 });
    voices.update(withLines(one));
    await settle();
    voices.start(one.id, 0.1);
    expect(f.delays).toEqual([0.1]);
  });

  it('gives a character a preset and keeps every voice in the film', () => {
    const before = productionVoices(example);
    const p = withPreset(example, 'penguin', 'girl');
    expect(p.manifest.voices?.penguin?.preset).toBe('girl');
    expect(p.manifest.voices?.fox).toEqual(before.get('fox'));
    expect(p.manifest.voices?.penguin?.base).not.toBe(p.manifest.voices?.fox?.base);
  });

  it('changes every voice to the other accent, with the same presets', () => {
    const p = withAccent(example, 'american');
    const voices = Object.values(p.manifest.voices ?? {});
    expect(voices.length).toBeGreaterThan(1);
    expect(voices.every((v) => v.accent === 'american')).toBe(true);
    expect(voices.map((v) => v.preset)).toEqual(
      [...productionVoices(example).values()].map((v) => v.preset),
    );
  });

  it('plays a sample in a character’s voice', async () => {
    const f = fakes();
    const voices = new Voices({ engine: () => f.engine, out: () => f.out, settle: 0 });
    voices.update(example);
    expect(await voices.sample('penguin', 'Hello, I’m penguin.')).toBe(true);
    expect(f.said).toEqual(['Hello, I’m penguin.']);
    expect(f.played).toHaveLength(1);
  });
});
