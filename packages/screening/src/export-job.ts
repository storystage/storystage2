/**
 * An export in progress (WP11.3, spec 08 section 4). It lives outside the dialog, so **Keep
 * working** can close the dialog while the export goes on, and opening it again shows where it
 * is. It runs `exportFilm` (through `run`), tracks the step and the time left, stops at once on
 * **Stop export**, and saves the film through the host when it's made.
 */
import {
  ExportError,
  FilmRefused,
  type ExportProgress,
  type ExportStep,
  type FilmExport,
} from '@storystage/export';

/** Runs the export, stopping when `signal` aborts. The host binds the stage and the film. */
export type ExportRun = (
  signal: AbortSignal,
  onProgress: (progress: ExportProgress) => void,
) => Promise<FilmExport>;

export type ExportJobState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'running';
      readonly step: ExportStep;
      /** Of the whole export, 0 to 1. */
      readonly fraction: number;
      /** `null` until there's enough to go on. */
      readonly secondsLeft: number | null;
    }
  /** Made, but the learner backed out of saving it: Save again keeps the work. */
  | { readonly kind: 'unsaved'; readonly name: string }
  | {
      readonly kind: 'done';
      readonly name: string;
      readonly capped: boolean;
      /** The speak lines' sound, for the dialog's note (`FilmExport.sound`); always set here. */
      readonly sound?: FilmExport['sound'];
    }
  /** Refused before it started, each reason in plain words. */
  | { readonly kind: 'refused'; readonly reasons: readonly string[] }
  | { readonly kind: 'failed'; readonly words: string };

export interface ExportJobOptions {
  /** The run `start` uses when it's given none. */
  readonly run?: ExportRun;
  /** Saves the MP4 and its caption files (the host's file saving, decision 0028). */
  readonly save: (film: FilmExport) => Promise<void>;
  /** Milliseconds, for the time left. */
  readonly now?: () => number;
}

const SAVE_WORDS = 'The film was made, but it could not be saved. Try saving it again.';

/** The host's `FileError('cancelled')`: the learner closed the save dialog. */
const backedOut = (e: unknown) =>
  typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'cancelled';

export class ExportJob {
  private readonly options: ExportJobOptions;
  private readonly listeners = new Set<() => void>();
  private stopping: AbortController | null = null;
  private made: FilmExport | null = null;
  private started = 0;
  state: ExportJobState = { kind: 'idle' };

  constructor(options: ExportJobOptions) {
    this.options = options;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  get running(): boolean {
    return this.state.kind === 'running';
  }

  /**
   * Starts an export, unless one is running. `run` is the export as the learner asked for it
   * now: the film and the choices at the moment they pressed Export film.
   */
  start(run: ExportRun | undefined = this.options.run): void {
    if (this.running || !run) return;
    const stopping = new AbortController();
    this.stopping = stopping;
    this.made = null;
    this.started = this.now();
    this.set({ kind: 'running', step: 'frames', fraction: 0, secondsLeft: null });
    run(stopping.signal, (p) => {
      if (this.stopping !== stopping) return;
      this.set({ kind: 'running', ...p, secondsLeft: this.secondsLeft(p.fraction) });
    }).then(
      async (film) => {
        if (this.stopping !== stopping) return;
        this.made = film;
        await this.saveMade();
      },
      (e: unknown) => {
        if (this.stopping !== stopping) return;
        this.stopping = null;
        if (e instanceof FilmRefused) this.set({ kind: 'refused', reasons: e.reasons });
        else if (e instanceof ExportError && e.code === 'cancelled') this.set({ kind: 'idle' });
        else if (e instanceof ExportError) this.set({ kind: 'failed', words: e.message });
        else this.set({ kind: 'failed', words: new ExportError('encode_failed').message });
      },
    );
  }

  /** Stop export: stops at once and keeps nothing. */
  stop(): void {
    if (!this.running) return;
    this.stopping?.abort();
    this.stopping = null;
    this.set({ kind: 'idle' });
  }

  /** After the learner backed out of saving: the same film, saved again. */
  async saveAgain(): Promise<void> {
    if (this.state.kind === 'unsaved') await this.saveMade();
  }

  private async saveMade(): Promise<void> {
    const film = this.made;
    if (!film) return;
    try {
      await this.options.save(film);
      this.stopping = null;
      this.made = null;
      this.set({ kind: 'done', name: film.name, capped: film.capped, sound: film.sound });
    } catch (e) {
      if (backedOut(e)) this.set({ kind: 'unsaved', name: film.name });
      else this.set({ kind: 'failed', words: SAVE_WORDS });
    }
  }

  private secondsLeft(fraction: number): number | null {
    if (fraction <= 0) return null;
    const spent = (this.now() - this.started) / 1000;
    return Math.max(0, Math.round((spent / fraction) * (1 - fraction)));
  }

  private now(): number {
    return (this.options.now ?? (() => performance.now()))();
  }

  private set(state: ExportJobState): void {
    this.state = state;
    for (const l of this.listeners) l();
  }
}
