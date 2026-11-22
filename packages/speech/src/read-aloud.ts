/**
 * Reading one short text aloud when the learner presses for it (`docs/spec/06-speech.md` section
 * 3.3): "Read it to me" on a study task's card (spec 14 section 6.4). Not the narration queue,
 * which follows the Prompter's build.
 */
import type { Speaker } from './narration.ts';
import { speakable } from './speakable.ts';

/**
 * Says `text`, cleaned and split as section 2.2 says, one utterance after another. Returns a
 * stop function: it stops at once, and `onDone` isn't called. `onDone` is called once, after the
 * last utterance, or at once if there is nothing to say.
 */
export function readAloud(speaker: Speaker, text: string, onDone?: () => void): () => void {
  const pieces = speakable(text);
  let stopped = false;
  const next = (i: number): void => {
    if (stopped) return;
    if (i >= pieces.length) {
      stopped = true;
      onDone?.();
      return;
    }
    speaker.speak(pieces[i]!, () => next(i + 1));
  };
  next(0);
  return () => {
    if (stopped) return;
    stopped = true;
    speaker.cancel();
  };
}
