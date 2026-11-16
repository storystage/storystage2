/**
 * The set-up wizard's logic (`docs/spec/04-prompter.md` section 4.4, WP13.6). The studio draws
 * the pages (spec 05, section 1); this is what they run on. The key itself is only ever in the
 * native layer's system dialog and its secure store: nothing here takes it, holds it or gives it
 * (CLAUDE.md rule 1).
 */

/** Tauri's `invoke`, as far as these commands need it. */
export type Invoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

/** Spec 05, section 1.3. None of them takes or returns the key. */
export const KEY_COMMANDS = { add: 'key_add', status: 'key_status', remove: 'key_remove' } as const;

export const KEY_OUTCOMES = [
  'saved',
  'cancelled',
  'notAccepted',
  'noClaudeAccess',
  'unreachable',
  'storeUnavailable',
  'refusedByPolicy',
] as const;
export type KeyOutcome = (typeof KEY_OUTCOMES)[number];
export type KeyStatus = 'present' | 'absent';

/** What page 10c says for each outcome, exactly as spec 05 gives it. `cancelled` says nothing. */
export const KEY_OUTCOME_WORDS: Readonly<Record<KeyOutcome, string | null>> = {
  saved: 'Key works. Checked just now.',
  cancelled: null,
  notAccepted: "That key wasn't accepted.",
  noClaudeAccess: "That key works but can't use Claude models.",
  unreachable: "Couldn't reach Anthropic: check the internet connection or school proxy.",
  storeUnavailable: "This device can't keep the key safely, so the Prompter stays off.",
  refusedByPolicy: 'Turned off by your school',
};

/** When a command fails: the native layer is missing, or says something unexpected. */
export const SETUP_FAILED_WORDS = "That didn't work. Try again.";

/** The native layer's key commands. */
export interface PrompterKey {
  /** Opens the system dialog, checks what the adult pastes, and stores it if it works. */
  add(): Promise<KeyOutcome>;
  status(): Promise<KeyStatus>;
  /** Deletes the key, which switches the Prompter off. */
  remove(): Promise<void>;
}

const isOutcome = (value: unknown): value is KeyOutcome =>
  (KEY_OUTCOMES as readonly unknown[]).includes(value);

/** The Tauri apps' key commands. A reply that isn't one of spec 05's words is an error. */
export function tauriKey(invoke: Invoke): PrompterKey {
  return {
    async add() {
      const reply = await invoke(KEY_COMMANDS.add);
      if (!isOutcome(reply)) throw new Error('key_add gave something else');
      return reply;
    },
    async status() {
      const reply = await invoke(KEY_COMMANDS.status);
      if (reply !== 'present' && reply !== 'absent')
        throw new Error('key_status gave something else');
      return reply;
    },
    async remove() {
      await invoke(KEY_COMMANDS.remove);
    },
  };
}

// ---- The pages ----------------------------------------------------------------------------------

/** 10a to 10d (spec 05, section 1.1), and `done` once the wizard has ended. */
export type SetupPage = 'who' | 'about' | 'key' | 'ready' | 'done';

export interface SetupState {
  readonly page: SetupPage;
  /** On 10b: the adult has ticked that the Claude account is theirs. */
  readonly adultAccount: boolean;
  /** On 10c: the dialog is open, or the key is being checked. */
  readonly busy: boolean;
  /** The words to show on the page, or null. */
  readonly words: string | null;
  /** Whether a key is stored, as far as the wizard knows. */
  readonly keyStored: boolean;
  /** How the wizard ended: a learner skipped it, or an adult finished it. */
  readonly ended: 'learner' | 'finished' | null;
}

const START: SetupState = {
  page: 'who',
  adultAccount: false,
  busy: false,
  words: null,
  keyStored: false,
  ended: null,
};

export class PrompterSetup {
  readonly #key: PrompterKey;
  #state: SetupState = START;
  readonly #listeners = new Set<(state: SetupState) => void>();

  constructor(key: PrompterKey) {
    this.#key = key;
  }

  get state(): SetupState {
    return this.#state;
  }

  subscribe(listener: (state: SetupState) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #set(change: Partial<SetupState>): void {
    this.#state = { ...this.#state, ...change };
    for (const listener of this.#listeners) listener(this.#state);
  }

  /** Opens the wizard: on 10d if a key is already stored, so it can be checked or removed. */
  async open(): Promise<void> {
    this.#set({ ...START, busy: true });
    try {
      const stored = (await this.#key.status()) === 'present';
      this.#set({ busy: false, keyStored: stored, page: stored ? 'ready' : 'who' });
    } catch {
      this.#set({ busy: false, words: SETUP_FAILED_WORDS });
    }
  }

  /** 10a: a learner skips to the app, with the Prompter off. */
  learner(): void {
    if (this.#state.page !== 'who') return;
    this.#set({ page: 'done', ended: 'learner', words: null });
  }

  /** 10a: an adult carries on to 10b. */
  adult(): void {
    if (this.#state.page !== 'who') return;
    this.#set({ page: 'about', words: null });
  }

  /** 10b: the adult ticks, or unticks, that the Claude account is theirs. */
  setAdultAccount(ticked: boolean): void {
    if (this.#state.page !== 'about') return;
    this.#set({ adultAccount: ticked });
  }

  /** 10b: carries on to 10c, only once the account box is ticked. */
  next(): void {
    if (this.#state.page !== 'about' || !this.#state.adultAccount) return;
    this.#set({ page: 'key', words: null });
  }

  back(): void {
    if (this.#state.busy) return;
    const previous: Partial<Record<SetupPage, SetupPage>> = { about: 'who', key: 'about' };
    const to = previous[this.#state.page];
    if (to) this.#set({ page: to, words: null });
  }

  /** 10c: Add key. Opens the system dialog; a second press while it's open does nothing. */
  async addKey(): Promise<KeyOutcome | null> {
    if (this.#state.page !== 'key' || this.#state.busy) return null;
    this.#set({ busy: true, words: null });
    let outcome: KeyOutcome;
    try {
      outcome = await this.#key.add();
    } catch {
      this.#set({ busy: false, words: SETUP_FAILED_WORDS });
      return null;
    }
    const saved = outcome === 'saved';
    this.#set({
      busy: false,
      words: KEY_OUTCOME_WORDS[outcome],
      ...(saved ? { page: 'ready', keyStored: true } : {}),
    });
    return outcome;
  }

  /** 10d: Remove key. The Prompter is off, and the wizard starts again. */
  async removeKey(): Promise<void> {
    if (this.#state.page !== 'ready' || this.#state.busy) return;
    this.#set({ busy: true, words: null });
    try {
      await this.#key.remove();
      this.#set({ ...START });
    } catch {
      this.#set({ busy: false, words: SETUP_FAILED_WORDS });
    }
  }

  /** 10d: Done. Finishing the wizard with a key is the only way the Prompter comes on (0022). */
  finish(): void {
    if (this.#state.page !== 'ready' || !this.#state.keyStored) return;
    this.#set({ page: 'done', ended: 'finished', words: null });
  }
}
