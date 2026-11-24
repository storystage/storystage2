/**
 * The film's sounds as the code editors word them (decision 0076, workplan 7.17; `14-editors.md`
 * section 3a): a block's sound is chosen from them by label and written as its id. Read each time
 * they're asked for, so a sound imported while a method is open is offered too, without the editor
 * being made again.
 */
import type { SoundClip } from '@storystage/production';
import type { CascadeOptions } from '@storystage/story-api/editing';

/** What the editors and the shared cascade are given: `references` and `referenceWord`. */
export type SoundWords = Pick<CascadeOptions, 'references' | 'referenceWord'>;

/** The words for the sounds `clips` gives when asked (the open film's `manifest.sounds`). */
export function soundWords(clips: () => readonly SoundClip[]): SoundWords {
  return {
    references: (type) =>
      type === 'Audio' ? clips().map((c) => ({ value: c.id, words: c.label })) : [],
    referenceWord: (type, value) =>
      type === 'Audio' ? clips().find((c) => c.id === value)?.label : undefined,
  };
}

/**
 * `soundWords` for sounds given since, by `show`: the Code editor gives its editors `words` once,
 * and shows them the film's sounds as they change.
 */
export function shownSoundWords(start: readonly SoundClip[]): {
  readonly words: SoundWords;
  show(clips: readonly SoundClip[]): void;
} {
  let clips = start;
  return {
    words: soundWords(() => clips),
    show: (next) => {
      clips = next;
    },
  };
}
