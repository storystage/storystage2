/**
 * The narration queue (`docs/spec/06-speech.md` section 3.1, carried over from StoryStage 1).
 * Captions show at once, whether or not anything is spoken (rule 7). Speech follows the build
 * and never holds it up.
 */
import { speakable } from './speakable.ts';

/** Says one utterance. `browserSpeaker` is the real one; tests use a fake. */
export interface Speaker {
  /** Calls `onEnd` once, when the utterance has finished or failed. */
  speak(text: string, onEnd: () => void): void;
  /** Stops at once. A cancelled utterance's `onEnd` isn't called. */
  cancel(): void;
}

export interface NarrationItem {
  readonly id: string;
  /** The caption, and what is spoken. */
  readonly text: string;
  /** The plan step it belongs to, if any. Lets a waiting item be cut to "Step 3 done." */
  readonly step?: number;
}

export type NarrationEvent =
  | { readonly type: 'caption'; readonly item: NarrationItem }
  | { readonly type: 'speaking'; readonly id: string }
  | { readonly type: 'spoken'; readonly id: string }
  | { readonly type: 'stopped' };

/** More than this many waiting, and the older ones are cut short or dropped. */
export const MAX_WAITING = 5;

interface Waiting {
  readonly id: string;
  readonly utterances: string[];
  readonly step?: number;
}

export interface NarrationOptions {
  /** Spoken steps, a learner setting. Off: captions only. */
  readonly spoken: boolean;
  readonly onEvent: (event: NarrationEvent) => void;
}

export class NarrationQueue {
  readonly #speaker: Speaker | null;
  readonly #options: NarrationOptions;
  #waiting: Waiting[] = [];
  #current: Waiting | null = null;
  /** Changes on Stop, so a late `onEnd` from before it does nothing. */
  #generation = 0;

  constructor(speaker: Speaker | null, options: NarrationOptions) {
    this.#speaker = speaker;
    this.#options = options;
  }

  /** Shows the caption now, and speaks it in turn. */
  say(item: NarrationItem): void {
    this.#options.onEvent({ type: 'caption', item });
    if (!this.#speaker || !this.#options.spoken) return;
    const utterances = speakable(item.text);
    if (utterances.length === 0) return;
    this.#waiting.push({
      id: item.id,
      utterances,
      ...(item.step === undefined ? {} : { step: item.step }),
    });
    this.#catchUp();
    if (!this.#current) this.#next();
  }

  /** Stop: clears the queue and stops speaking. Undoes nothing. */
  stop(): void {
    this.#clear();
    this.#options.onEvent({ type: 'stopped' });
  }

  /** A new learner request: what is left of the last one isn't spoken. */
  newRequest(): void {
    this.#clear();
  }

  #clear(): void {
    this.#generation += 1;
    this.#waiting = [];
    if (this.#current) this.#speaker?.cancel();
    this.#current = null;
  }

  /** Cuts older steps to "Step N done." and drops older items that aren't steps. */
  #catchUp(): void {
    const older = this.#waiting.length - MAX_WAITING;
    if (older <= 0) return;
    this.#waiting = this.#waiting.flatMap((item, i) => {
      if (i >= older) return [item];
      return item.step === undefined ? [] : [{ ...item, utterances: [`Step ${item.step} done.`] }];
    });
  }

  #next(): void {
    const item = this.#waiting.shift();
    this.#current = item ?? null;
    if (!item) return;
    this.#options.onEvent({ type: 'speaking', id: item.id });
    this.#speakFrom(item, 0, this.#generation);
  }

  #speakFrom(item: Waiting, index: number, generation: number): void {
    const text = item.utterances[index];
    if (text === undefined) {
      this.#options.onEvent({ type: 'spoken', id: item.id });
      this.#next();
      return;
    }
    this.#speaker?.speak(text, () => {
      if (generation === this.#generation) this.#speakFrom(item, index + 1, generation);
    });
  }
}
