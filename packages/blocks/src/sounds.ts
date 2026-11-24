/**
 * A block's sound (decision 0076, workplan 7.17; `14-editors.md` section 3a): a `playAudio`
 * block's sound is chosen from the film's sounds by label ("Splash") and written as the text a
 * music cue's `sound` holds (`sn1`, or a shelf sound's Backstage id). The studio gives each
 * workspace the film's sounds; the sound block's ▾ offers them, read again each time it opens, so
 * a sound imported while the method is open is there too.
 */
import type * as Blockly from 'blockly/core';
import type { CascadeOptions } from '@storystage/story-api/editing';

/** The film's sounds and their words, as the editing model's options give them. */
export type FilmSoundWords = Pick<CascadeOptions, 'references' | 'referenceWord'>;

const FILM_SOUNDS = new WeakMap<Blockly.Workspace, FilmSoundWords>();

/** Gives `workspace`'s sound blocks the film's sounds. */
export function soundsFor(workspace: Blockly.Workspace, sounds: FilmSoundWords): void {
  FILM_SOUNDS.set(workspace, sounds);
}

/**
 * The sound block's choices: the film's sounds by label, and the sound the block holds even when
 * the film no longer has it (it plays as silence, spec 03 section 1.7), shown as it's written, so
 * the code is never changed by drawing it.
 */
export function soundChoices(drawn: string): Blockly.MenuGeneratorFunction {
  return function (this: Blockly.FieldDropdown) {
    const film = FILM_SOUNDS.get(this.getSourceBlock()?.workspace as Blockly.Workspace);
    const choices: [string, string][] = (film?.references?.('Audio') ?? []).map((s) => [
      s.words,
      s.value,
    ]);
    const current = this.getValue();
    for (const value of [drawn, ...(typeof current === 'string' ? [current] : [])])
      if (value !== '' && !choices.some(([, v]) => v === value))
        choices.push([film?.referenceWord?.('Audio', value) ?? value, value]);
    return choices.length > 0 ? choices : [['???', drawn]];
  };
}
