import { describe, expect, it, vi } from 'vitest';
import type { Speaker } from './narration.ts';
import { readAloud } from './read-aloud.ts';

/** A speaker that finishes each utterance when the test says so. */
function fakeSpeaker() {
  const said: string[] = [];
  let finish: (() => void) | null = null;
  const speaker: Speaker = {
    speak(text, onEnd) {
      said.push(text);
      finish = onEnd;
    },
    cancel: vi.fn(() => {
      finish = null;
    }),
  };
  return { speaker, said, end: () => finish?.() };
}

/** Two sentences too long to say as one utterance (section 2.2: at most 300 characters). */
const wave = `Make Teddy wave${' and wave'.repeat(20)}.`;
const walk = `Then make him walk${' and walk'.repeat(20)} to the tree.`;

describe('readAloud (spec 06, section 3.3)', () => {
  it('says the text in turn, cleaned, then says it is done', () => {
    const { speaker, said, end } = fakeSpeaker();
    const done = vi.fn();
    readAloud(speaker, `**${wave}** ${walk}`, done);
    expect(said).toEqual([wave]);
    end();
    expect(said).toEqual([wave, walk]);
    expect(done).not.toHaveBeenCalled();
    end();
    end();
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('stops at once when told, and never says it finished', () => {
    const { speaker, said, end } = fakeSpeaker();
    const done = vi.fn();
    const stop = readAloud(speaker, `${wave} ${walk}`, done);
    stop();
    stop();
    end();
    expect(said).toEqual([wave]);
    expect(speaker.cancel).toHaveBeenCalledTimes(1);
    expect(done).not.toHaveBeenCalled();
  });

  it('says nothing for text with no words, and is done at once', () => {
    const { speaker, said } = fakeSpeaker();
    const done = vi.fn();
    const stop = readAloud(speaker, ' ** ', done);
    expect(said).toEqual([]);
    expect(done).toHaveBeenCalledTimes(1);
    stop();
    expect(speaker.cancel).not.toHaveBeenCalled();
  });
});
