/**
 * Talk to type across the studio (`docs/spec/06-speech.md` sections 1.5 and 1.7): S7's one
 * `Dictation`, one take at a time, and which field it's for. A take for another field cancels
 * the one going. The words go into the field as one undo step: the studio's history is sealed
 * either side of them, so they never join the typing before or after.
 */
import type { Dictation, DictationState } from '@storystage/speech';
import type { FieldSpeech } from '@storystage/ui';
import { words } from '../strings.ts';

/** What every field's mic shows: which field the take is for, and how it's going. */
export interface TakesState {
  readonly field: string | null;
  readonly phase: DictationState['phase'];
  readonly level: number;
  /** The last take's trouble, in S7's words, for the field it was for. */
  readonly problem: { readonly field: string; readonly words: string } | null;
}

const QUIET: TakesState = { field: null, phase: 'idle', level: 0, problem: null };

/** A `DictationError`'s words, or `null` for one that says nothing (`busy`, `cancelled`). */
function problemWords(e: unknown): string | null {
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code: string }).code;
    if (code === 'busy' || code === 'cancelled') return null;
    const message = (e as { message?: unknown }).message;
    if (typeof message === 'string' && message !== '') return message;
  }
  return words.t('talkToType.stopped');
}

export class Takes {
  private readonly dictation: Dictation;
  /** Seals the studio's history, so the words are one step of their own. */
  private readonly seal: () => void;
  private current: TakesState = QUIET;
  private readonly listeners = new Set<() => void>();
  /** Where the words of the take going now are put. */
  private insert: ((words: string) => void) | null = null;
  /** Set while the words are being collected, so a take that stopped itself isn't collected twice. */
  private collecting = false;
  private readonly unwatch: () => void;

  constructor(dictation: Dictation, seal: () => void) {
    this.dictation = dictation;
    this.seal = seal;
    let before = dictation.state.get().phase;
    this.unwatch = dictation.state.subscribe((s) => {
      this.set({ phase: this.current.field ? s.phase : 'idle', level: s.level });
      // It stopped listening by itself (30 seconds, or the window lost focus): collect the words.
      if (before === 'listening' && s.phase === 'working' && !this.collecting && this.insert)
        void this.collect();
      before = s.phase;
    });
  }

  get state(): TakesState {
    return this.current;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** What one field's mic needs. */
  forField(field: string): FieldSpeech {
    const s = this.current;
    const mine = s.field === field;
    return {
      phase: mine ? s.phase : 'idle',
      level: mine ? s.level : 0,
      problem: s.problem?.field === field ? s.problem.words : null,
      toggle: (insert) => void this.toggle(field, insert),
      cancel: () => {
        if (this.current.field === field) this.cancel();
      },
    };
  }

  /** The mic tapped on `field`: a take for it starts, or the one going stops and its words go in. */
  async toggle(field: string, insert: (words: string) => void): Promise<void> {
    const s = this.current;
    if (s.field === field && this.dictation.state.get().phase === 'listening') {
      this.insert = insert;
      return this.collect();
    }
    if (s.field !== null) this.cancel();
    this.insert = insert;
    this.set({ field, problem: null, phase: 'listening', level: 0 });
    try {
      await this.dictation.start();
    } catch (e) {
      this.fail(field, e);
    }
  }

  /** Stops the take and throws the audio away. */
  cancel(): void {
    this.insert = null;
    this.dictation.cancel();
    this.set({ field: null, phase: 'idle', level: 0 });
  }

  /** Lets the studio go: a take going is cancelled. */
  dispose(): void {
    if (this.current.field !== null) this.cancel();
    this.unwatch();
    this.listeners.clear();
  }

  private async collect(): Promise<void> {
    const field = this.current.field;
    const insert = this.insert;
    if (field === null || !insert) return;
    this.collecting = true;
    try {
      const { text } = await this.dictation.stop();
      if (this.current.field !== field) return;
      this.seal();
      insert(text);
      this.seal();
      this.insert = null;
      this.set({ field: null, phase: 'idle', level: 0 });
    } catch (e) {
      this.fail(field, e);
    } finally {
      this.collecting = false;
    }
  }

  private fail(field: string, e: unknown): void {
    if (this.current.field !== field) return;
    const words = problemWords(e);
    this.insert = null;
    this.set({
      field: null,
      phase: 'idle',
      level: 0,
      problem: words === null ? null : { field, words },
    });
  }

  private set(change: Partial<TakesState>): void {
    this.current = { ...this.current, ...change };
    for (const l of [...this.listeners]) l();
  }
}
