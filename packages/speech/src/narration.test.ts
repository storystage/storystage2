import { describe, expect, it } from 'vitest';
import { MAX_WAITING, NarrationQueue, type NarrationEvent, type Speaker } from './narration.ts';

/** A speaker that records what it was asked to say and finishes only when told. */
function fakeSpeaker() {
  const said: string[] = [];
  let finish: (() => void) | null = null;
  let cancels = 0;
  const speaker: Speaker = {
    speak(text, onEnd) {
      said.push(text);
      finish = onEnd;
    },
    cancel() {
      cancels += 1;
      finish = null;
    },
  };
  return {
    speaker,
    said,
    cancels: () => cancels,
    /** The current utterance ends. */
    end() {
      const f = finish;
      finish = null;
      f?.();
    },
  };
}

function setUp(options: { spoken?: boolean; speaker?: Speaker | null } = {}) {
  const fake = fakeSpeaker();
  const events: NarrationEvent[] = [];
  const queue = new NarrationQueue(options.speaker === undefined ? fake.speaker : options.speaker, {
    spoken: options.spoken ?? true,
    onEvent: (e) => events.push(e),
  });
  return { fake, events, queue };
}

const captions = (events: readonly NarrationEvent[]) =>
  events.flatMap((e) => (e.type === 'caption' ? [e.item.text] : []));

describe('NarrationQueue (spec 06, section 3.1)', () => {
  it('shows each caption at once, and speaks the items in order', () => {
    const { fake, events, queue } = setUp();
    queue.say({ id: 'a', text: 'A cat appears.', step: 1 });
    queue.say({ id: 'b', text: 'The cat walks.', step: 2 });
    expect(captions(events)).toEqual(['A cat appears.', 'The cat walks.']);
    expect(fake.said).toEqual(['A cat appears.']);
    fake.end();
    expect(fake.said).toEqual(['A cat appears.', 'The cat walks.']);
    fake.end();
    expect(events.filter((e) => e.type !== 'caption')).toEqual([
      { type: 'speaking', id: 'a' },
      { type: 'spoken', id: 'a' },
      { type: 'speaking', id: 'b' },
      { type: 'spoken', id: 'b' },
    ]);
  });

  it('speaks a long item as several utterances, one after another', () => {
    const { fake, queue } = setUp();
    const long = 'The owl flies up to the highest branch of the tree. '.repeat(10).trim();
    queue.say({ id: 'a', text: long });
    let guard = 0;
    while (fake.said.join(' ') !== long && guard++ < 20) fake.end();
    expect(fake.said.length).toBeGreaterThan(1);
    expect(fake.said.join(' ')).toBe(long);
  });

  it('shows captions but says nothing when Spoken steps is off', () => {
    const { fake, events, queue } = setUp({ spoken: false });
    queue.say({ id: 'a', text: 'A cat appears.' });
    expect(captions(events)).toEqual(['A cat appears.']);
    expect(fake.said).toEqual([]);
  });

  it('shows captions with no voice on the device (rule 7)', () => {
    const { events, queue } = setUp({ speaker: null });
    queue.say({ id: 'a', text: 'A cat appears.' });
    expect(captions(events)).toEqual(['A cat appears.']);
  });

  it('stops speaking and clears the queue on Stop, without touching the captions', () => {
    const { fake, events, queue } = setUp();
    queue.say({ id: 'a', text: 'One.' });
    queue.say({ id: 'b', text: 'Two.' });
    queue.stop();
    expect(fake.cancels()).toBe(1);
    expect(events.at(-1)).toEqual({ type: 'stopped' });
    fake.end();
    expect(fake.said).toEqual(['One.']);
    expect(captions(events)).toEqual(['One.', 'Two.']);
  });

  it('ignores a speaker that reports the end of an utterance after Stop', () => {
    const said: string[] = [];
    const ends: (() => void)[] = [];
    const careless: Speaker = {
      speak: (text, onEnd) => {
        said.push(text);
        ends.push(onEnd);
      },
      cancel: () => {},
    };
    const queue = new NarrationQueue(careless, { spoken: true, onEvent: () => {} });
    queue.say({ id: 'a', text: 'One.' });
    queue.stop();
    queue.say({ id: 'c', text: 'Three.' });
    ends[0]?.();
    queue.say({ id: 'd', text: 'Four.' });
    // "Four." waits for "Three." to finish, rather than talking over it.
    expect(said).toEqual(['One.', 'Three.']);
    ends[1]?.();
    expect(said).toEqual(['One.', 'Three.', 'Four.']);
  });

  it('carries on normally after a Stop', () => {
    const { fake, queue } = setUp();
    queue.say({ id: 'a', text: 'One.' });
    queue.stop();
    queue.say({ id: 'b', text: 'Two.' });
    expect(fake.said).toEqual(['One.', 'Two.']);
  });

  it('a new learner request clears what is left of the last one', () => {
    const { fake, queue } = setUp();
    queue.say({ id: 'a', text: 'One.' });
    queue.say({ id: 'b', text: 'Two.' });
    queue.newRequest();
    queue.say({ id: 'c', text: 'Three.' });
    expect(fake.said).toEqual(['One.', 'Three.']);
  });

  it(`shortens older steps when more than ${MAX_WAITING} are waiting, so speech catches up`, () => {
    const { fake, queue } = setUp();
    for (let step = 1; step <= 9; step++)
      queue.say({ id: `s${step}`, text: `This is the long words for step ${step}.`, step });
    let guard = 0;
    while (guard++ < 20) fake.end();
    expect(fake.said).toEqual([
      'This is the long words for step 1.',
      'Step 2 done.',
      'Step 3 done.',
      'Step 4 done.',
      'This is the long words for step 5.',
      'This is the long words for step 6.',
      'This is the long words for step 7.',
      'This is the long words for step 8.',
      'This is the long words for step 9.',
    ]);
  });

  it('drops, rather than shortens, older items that are not steps', () => {
    const { fake, events, queue } = setUp();
    for (let i = 1; i <= 7; i++) queue.say({ id: `e${i}`, text: `Note ${i}.` });
    let guard = 0;
    while (guard++ < 20) fake.end();
    expect(fake.said).toEqual(['Note 1.', 'Note 3.', 'Note 4.', 'Note 5.', 'Note 6.', 'Note 7.']);
    expect(captions(events)).toHaveLength(7);
  });

  it('shows a caption for an item with nothing speakable, and skips it', () => {
    const { fake, events, queue } = setUp();
    queue.say({ id: 'a', text: '**' });
    queue.say({ id: 'b', text: 'Two.' });
    expect(captions(events)).toEqual(['**', 'Two.']);
    expect(fake.said).toEqual(['Two.']);
  });
});
