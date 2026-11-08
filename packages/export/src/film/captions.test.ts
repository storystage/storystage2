import { sceneId, type ScriptLine, type LineId } from '@storystage/production';
import { micros } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { captionsAt, captionsFor, srt, webVtt, type SpokenLine } from './captions.ts';

const S1 = sceneId('s1');
const S2 = sceneId('s2');

const line = (over: Partial<SpokenLine> & Pick<SpokenLine, 'text'>): SpokenLine => ({
  scene: S1,
  object: 'owl',
  kind: 'say',
  start: 0,
  duration: micros(2),
  ...over,
});

let n = 0;
const dialogue = (scene: typeof S1, character: string, text: string): ScriptLine => ({
  id: `l${n++}` as LineId,
  scene,
  kind: 'dialogue',
  character,
  text,
  pinnedFrame: null,
});

describe('captionsFor', () => {
  it("names the script's character when a dialogue line in that scene has the same words", () => {
    const script = [dialogue(S1, 'Hoot', 'Here is the key.'), dialogue(S2, 'Owl', 'Goodbye.')];
    const captions = captionsFor(
      [
        line({ text: 'Here is the key.' }),
        line({ text: 'Goodbye.', start: micros(3) }),
        line({ scene: S2, object: 'fox', text: 'Goodbye.', start: micros(6) }),
      ],
      script,
    );
    expect(captions.map((c) => c.text)).toEqual([
      'HOOT: Here is the key.',
      'OWL: Goodbye.',
      'OWL: Goodbye.',
    ]);
  });

  it("otherwise uses the object's name, in capitals", () => {
    const [caption] = captionsFor([line({ object: 'snowyOwl', text: 'Hello.' })], []);
    expect(caption!.text).toBe('SNOWYOWL: Hello.');
  });

  it('matches the script loosely: case, spaces and end punctuation', () => {
    const [caption] = captionsFor(
      [line({ text: '  here is the KEY ' })],
      [dialogue(S1, 'Hoot', 'Here is the key!')],
    );
    expect(caption!.text).toBe('HOOT: here is the KEY');
  });

  it('takes no time over a long run of marks that is not at the end', () => {
    const long = '!'.repeat(100_000) + 'a';
    const started = performance.now();
    const [caption] = captionsFor([line({ text: long })], [dialogue(S1, 'Hoot', long + '!')]);
    expect(caption!.text.startsWith('HOOT: ')).toBe(true);
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it('leaves out thoughts, and empty words', () => {
    const captions = captionsFor(
      [line({ text: 'Hmm…', kind: 'think' }), line({ text: '   ' }), line({ text: 'Hi.' })],
      [],
    );
    expect(captions.map((c) => c.text)).toEqual(['OWL: Hi.']);
  });

  it('captions speak lines, with their script words', () => {
    const [caption] = captionsFor([line({ kind: 'speak', text: 'Run!' })], []);
    expect(caption!.text).toBe('OWL: Run!');
  });

  it('lasts as long as its line, at least a second, counted from the film start', () => {
    const captions = captionsFor(
      [
        line({ text: 'A.', start: micros(1), duration: micros(3) }),
        line({ text: 'B.', start: micros(5), duration: micros(0.2) }),
      ],
      [],
      { offset: micros(4) },
    );
    expect(captions.map((c) => [c.start, c.end])).toEqual([
      [micros(5), micros(8)],
      [micros(9), micros(10)],
    ]);
  });

  it('puts them in time order, keeping the order of lines that start together', () => {
    const captions = captionsFor(
      [
        line({ text: 'Later.', start: micros(2) }),
        line({ text: 'First.', object: 'cat', start: 0 }),
        line({ text: 'Second.', object: 'dog', start: 0 }),
      ],
      [],
    );
    expect(captions.map((c) => c.text)).toEqual(['CAT: First.', 'DOG: Second.', 'OWL: Later.']);
  });
});

describe('captionsAt', () => {
  const captions = captionsFor(
    [
      line({ text: 'One.', start: 0, duration: micros(5) }),
      line({ text: 'Two.', start: micros(1), duration: micros(5) }),
      line({ text: 'Three.', start: micros(2), duration: micros(5) }),
    ],
    [],
  );

  it('stacks two at once, earliest first', () => {
    expect(captionsAt(captions, micros(1.5)).map((c) => c.text)).toEqual([
      'OWL: One.',
      'OWL: Two.',
    ]);
  });

  it('shows at most two, the two that started last', () => {
    expect(captionsAt(captions, micros(2.5)).map((c) => c.text)).toEqual([
      'OWL: Two.',
      'OWL: Three.',
    ]);
  });

  it('shows a caption from its start up to, not including, its end', () => {
    expect(captionsAt(captions, micros(5))).toHaveLength(2);
    expect(captionsAt(captions, micros(7))).toEqual([]);
  });
});

describe('caption files', () => {
  const captions = captionsFor(
    [
      line({ text: 'Is 3 < 4 & 5 > 2?', start: micros(1), duration: micros(1.5) }),
      line({ text: 'Yes.', object: 'cat', start: micros(61), duration: micros(2) }),
    ],
    [],
  );

  it('writes WebVTT, escaping the words', () => {
    expect(webVtt(captions)).toBe(
      [
        'WEBVTT',
        '',
        '1',
        '00:00:01.000 --> 00:00:02.500',
        'OWL: Is 3 &lt; 4 &amp; 5 &gt; 2?',
        '',
        '2',
        '00:01:01.000 --> 00:01:03.000',
        'CAT: Yes.',
        '',
      ].join('\n'),
    );
  });

  it('writes SRT with the same captions', () => {
    expect(srt(captions)).toBe(
      [
        '1',
        '00:00:01,000 --> 00:00:02,500',
        'OWL: Is 3 &lt; 4 &amp; 5 &gt; 2?',
        '',
        '2',
        '00:01:01,000 --> 00:01:03,000',
        'CAT: Yes.',
        '',
      ].join('\n'),
    );
  });

  it('keeps a line break in the words from ending the cue', () => {
    const [caption] = captionsFor([line({ text: 'Oh.\n\n\nNo.' })], []);
    expect(webVtt([caption!])).toContain('OWL: Oh. No.\n');
  });

  it('writes an empty file for a film with no lines', () => {
    expect(webVtt([])).toBe('WEBVTT\n');
    expect(srt([])).toBe('');
  });
});
