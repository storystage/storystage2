/**
 * Speak lines' voices in the studio (spec 06 sections 4.3, 4.5 and 4.6; WP14b): S1's Kokoro engine,
 * its `LineCache` and `LinePlayer`, for Rehearse and the export alike. Loaded only for a film with
 * speak lines. Each line's sound is made in the background as the code changes; Rehearse starts a
 * line's sound as its block starts, and a line not made yet stays silent with its caption.
 *
 * Each character's voice is the film's own (`manifest.voices[name]`, format 1.4.0), or else its
 * Backstage class's preset, keyed by its name so it sounds the same in every scene and two knights
 * sound different (section 4.3). In the browser version Kokoro's files are downloaded once, with
 * the learner's agreement and a progress bar, before anything is made (section 4.6); the apps
 * bundle them.
 */
import type { NodeId } from '@storystage/ast';
import type { Production, SceneId } from '@storystage/production';
import {
  DEFAULT_ACCENT,
  KokoroDownloadError,
  KokoroEngine,
  LineCache,
  LinePlayer,
  castVoices,
  downloadKokoro,
  kokoroToDownload,
  lineSeconds,
  makeLine,
  switchAccent,
  voiceFor,
  webAudioOut,
  type Accent,
  type AudioOut,
  type CastMember,
  type CastVoice,
  type Line,
  type Preset,
  type SpeechEngine,
} from '@storystage/speech';
import { speakLines, type SpeakLineAt } from './speakLines.ts';

/** Where the app serves Kokoro's files and ONNX Runtime's (S1's #371; S8 bundles them). */
export const KOKORO_PLACES = {
  assets: `${import.meta.env.BASE_URL}speech/kokoro/`,
  wasm: `${import.meta.env.BASE_URL}speech/ort/`,
};

/** What S1's engine says of a line cut off by `dispose`. */
const CLOSED = 'Speak line was closed.';

/** A speak line as the export names it (S2's `VoicedLine`). */
export interface VoicedLineLike {
  readonly scene: SceneId;
  readonly object: string;
  readonly text: string;
  readonly seconds: number;
}

export interface VoicesState {
  /**
   * `idle` with nothing to make; `ask` when the browser version needs the learner's agreement to
   * download the voices first; `downloading`; `making` while sounds are made; `ready` once they
   * are; `unavailable` when they can't be made on this device.
   */
  readonly status: 'idle' | 'ask' | 'downloading' | 'making' | 'ready' | 'unavailable';
  /** Lines whose sound couldn't be made: silent, with their captions (rule 7). */
  readonly silent: number;
  /** For `ask`: the bytes to download. For `downloading`: how far it has got. */
  readonly download?: { readonly done: number; readonly total: number };
  /** The last download's trouble, in plain words. */
  readonly problem?: string;
}

/** A character: a set-up object by name, with its class from the first scene it's in. */
export function characters(p: Production): CastMember[] {
  const cast: CastMember[] = [];
  const seen = new Set<string>();
  for (const { scene } of p.manifest.runningOrder) {
    const setup = p.scenes.find((s) => s.id === scene)?.setup;
    for (const o of setup?.objects ?? []) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      cast.push({ id: o.id, storyClass: o.class });
    }
  }
  return cast;
}

/** The film's accent: its stored voices', or else `fallback` (the device's Settings › Voices). */
export const accentOf = (p: Production, fallback: Accent = DEFAULT_ACCENT): Accent =>
  Object.values(p.manifest.voices ?? {})[0]?.accent ?? fallback;

/**
 * Each character's voice: the film's own first, so it sounds the same on every device; the class
 * decides only for a character the film has no voice for yet, by S1's `castVoices` (people
 * alternating woman and man, no two the same while there are voices to spare).
 */
export function productionVoices(
  p: Production,
  fallback: Accent = DEFAULT_ACCENT,
): Map<string, CastVoice> {
  const stored = p.manifest.voices ?? {};
  const cast = characters(p).filter((c) => !(c.id in stored));
  const voices = castVoices(cast, accentOf(p, fallback));
  for (const [name, voice] of Object.entries(stored)) voices.set(name, voice);
  return voices;
}

/** Every character's voice kept in the film, as it sounds now. */
const keptVoices = (p: Production, voices: ReadonlyMap<string, CastVoice>): Production => ({
  ...p,
  manifest: { ...p.manifest, voices: Object.fromEntries(voices) },
});

/**
 * The film with `name` given `preset` (Settings › Voices). Every character's voice is kept in the
 * film, so choosing one doesn't move the others.
 */
export function withPreset(
  p: Production,
  name: string,
  preset: Preset,
  fallback: Accent = DEFAULT_ACCENT,
): Production {
  const now = productionVoices(p, fallback);
  const accent = accentOf(p, fallback);
  // The first of the preset's voices no other character has, so two characters still differ.
  const taken = new Set(
    [...now].filter(([n]) => n !== name).map(([, v]) => `${v.base}/${v.pitch}`),
  );
  let voice = voiceFor(preset, accent, 0);
  for (let nth = 0; nth < 32; nth++) {
    const candidate = voiceFor(preset, accent, nth);
    if (!taken.has(`${candidate.base}/${candidate.pitch}`)) {
      voice = candidate;
      break;
    }
  }
  const next = new Map(now);
  next.set(name, voice);
  return keptVoices(p, next);
}

/** The film with every character's voice in the other accent: same presets (section 4.3). */
export function withAccent(p: Production, accent: Accent, fallback: Accent = DEFAULT_ACCENT) {
  const now = productionVoices(p, fallback);
  return keptVoices(
    p,
    new Map([...now].map(([name, v]) => [name, switchAccent(v, accent)] as const)),
  );
}

/** The voice of `object` in `scene`, or `null` for one that isn't in the scene's set-up. */
export function voiceOf(
  p: Production,
  voices: ReadonlyMap<string, CastVoice>,
  scene: SceneId,
  object: string,
): CastVoice | null {
  const there = p.scenes.find((s) => s.id === scene)?.setup.objects.some((x) => x.id === object);
  return there ? (voices.get(object) ?? null) : null;
}

/** S1's `Line` for a speak line, or `null` if its speaker has no voice. */
export function lineOf(
  p: Production,
  voices: ReadonlyMap<string, CastVoice>,
  at: SpeakLineAt,
): Line | null {
  const voice = voiceOf(p, voices, at.scene, at.object);
  return voice ? { text: at.text, voice, seconds: lineSeconds(at.text, at.duration) } : null;
}

/** Kokoro's files for the browser version: what's left to download, and the download. */
export interface VoiceFiles {
  toDownload(): Promise<number>;
  download(onProgress: (done: number, total: number) => void, signal: AbortSignal): Promise<void>;
}

/** The browser version's files, kept in Cache Storage by S1's `downloadKokoro`. */
export const browserVoiceFiles: VoiceFiles = {
  toDownload: () => kokoroToDownload(KOKORO_PLACES),
  download: (onProgress, signal) => downloadKokoro(KOKORO_PLACES, { onProgress, signal }),
};

export interface VoicesOptions {
  /** The engine; by default Kokoro in a worker, from where the app serves it. */
  readonly engine?: () => SpeechEngine & { dispose(): void };
  /** Where Rehearse's lines sound; by default the page's audio. */
  readonly out?: () => AudioOut;
  /** How long the code stays still before its lines are made. Default 400 ms. */
  readonly settle?: number;
  /**
   * The files to download first, with the learner's agreement: the browser version's. `null` in
   * the apps, which bundle them. Default `null`.
   */
  readonly files?: VoiceFiles | null;
  /** The browser version: Kokoro's files are downloaded first, with agreement. Default false. */
  readonly browser?: boolean;
  /** The accent for a film with no voices of its own: the device's Settings › Voices. */
  readonly accent?: () => Accent;
}

/** The studio's voices, for as long as the App lives. */
export class Voices {
  readonly #options: VoicesOptions;
  #engine: (SpeechEngine & { dispose(): void }) | null = null;
  #cache: LineCache | null = null;
  #player: LinePlayer | null = null;
  #out: AudioOut | null = null;
  #production: Production | null = null;
  #voices: ReadonlyMap<string, CastVoice> = new Map();
  #byNode = new Map<string, Line>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  /** Whether the engine may run: the apps, or the browser once the files are kept. */
  #allowed: boolean;
  #checking = false;
  #downloading: AbortController | null = null;
  #state: VoicesState = { status: 'idle', silent: 0 };
  readonly #listeners = new Set<() => void>();

  /** The files to download first, or 
ull where they're bundled. */
  get #files(): VoiceFiles | null {
    return this.#options.files !== undefined
      ? this.#options.files
      : this.#options.browser
        ? browserVoiceFiles
        : null;
  }

  constructor(options: VoicesOptions = {}) {
    this.#options = options;
    this.#allowed = !this.#files;
  }

  get state(): VoicesState {
    return this.#state;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  /** Each character's voice in the film as it is now. */
  get voices(): ReadonlyMap<string, CastVoice> {
    return this.#voices;
  }

  /** The film's accent: its own voices', or the device's. */
  accentOf(p: Production): Accent {
    return accentOf(p, this.#options.accent?.());
  }

  /** The film with `name` given `preset`, every voice kept in it (Settings › Voices). */
  withPreset(p: Production, name: string, preset: Preset): Production {
    return withPreset(p, name, preset, this.#options.accent?.());
  }

  /** The film with every voice in `accent`, the same presets. */
  withAccent(p: Production, accent: Accent): Production {
    return withAccent(p, accent, this.#options.accent?.());
  }

  /** The film as it is now: its lines are made once the code has been still a moment. */
  update(p: Production): void {
    if (p === this.#production) return;
    this.#production = p;
    this.#voices = productionVoices(p, this.#options.accent?.());
    this.#byNode = new Map();
    for (const at of speakLines(p)) {
      const line = lineOf(p, this.#voices, at);
      if (line) this.#byNode.set(at.node, line);
    }
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#prepare([]), this.#options.settle ?? 400);
  }

  /**
   * Rehearse: a block started. A speak line's sound starts, cutting the one before, `delay`
   * seconds from now: when the picture gets there (the driver runs ahead of it).
   */
  start(node: NodeId, delay = 0): void {
    const line = this.#byNode.get(node);
    if (line && this.#allowed) this.#playerFor()?.start(line, delay);
  }

  /** Rehearse stopped, paused or ended: silence. */
  stop(): void {
    this.#player?.stop();
    this.#out?.stop();
  }

  /** The learner agreed: the browser version downloads Kokoro's files, once, with progress. */
  async download(): Promise<void> {
    const files = this.#files;
    if (!files || this.#downloading) return;
    const stop = new AbortController();
    this.#downloading = stop;
    this.#set({ ...this.#state, status: 'downloading', download: { done: 0, total: 0 } });
    try {
      await files.download(
        (done, total) => this.#set({ ...this.#state, download: { done, total } }),
        stop.signal,
      );
      this.#allowed = true;
      this.#set({ status: 'making', silent: 0 });
      await this.#prepare([]);
    } catch (e) {
      if (stop.signal.aborted) return;
      const problem =
        e instanceof KokoroDownloadError ? e.message : 'The voices didn’t download. Try again.';
      const total = this.#state.download?.total ?? 0;
      this.#set({
        status: 'ask',
        silent: this.#byNode.size,
        download: { done: 0, total },
        problem,
      });
    } finally {
      if (this.#downloading === stop) this.#downloading = null;
    }
  }

  /** Plays `text` in `name`'s voice: Settings › Voices' sample. False if it can't be voiced. */
  async sample(name: string, text: string): Promise<boolean> {
    const voice = this.#voices.get(name);
    // The browser version without the voices yet: offer the download, as a speak line would.
    if (!this.#allowed) await this.#ask(this.#byNode.size);
    const engine = this.#allowed ? this.#engineFor() : null;
    if (!voice || !engine) return false;
    try {
      const samples = await makeLine(engine, { text, voice, seconds: lineSeconds(text) });
      this.#outFor()?.play(samples, engine.sampleRate);
      return true;
    } catch (e) {
      console.error('The sample could not be made.', e);
      return false;
    }
  }

  /** The export's voices (S2's `FilmVoices`): the same cache as Rehearse. */
  forFilm() {
    return {
      sampleRate: this.#engineFor()?.sampleRate ?? 24_000,
      prepare: async (lines: readonly VoicedLineLike[]) => {
        await this.#prepare(lines);
      },
      sound: (l: VoicedLineLike) => {
        const p = this.#production;
        const voice = p ? voiceOf(p, this.#voices, l.scene, l.object) : null;
        return voice ? this.#cache?.get({ text: l.text, voice, seconds: l.seconds }) : undefined;
      },
    };
  }

  /**
   * Lets the engine's worker go, giving its memory back (leaving the Production stage, or when
   * whisper needs it). Sounds made so far are kept; the engine loads again for the next line.
   */
  sleep(): void {
    this.stop();
    this.#engine?.dispose();
  }

  dispose(): void {
    if (this.#timer) clearTimeout(this.#timer);
    this.#downloading?.abort();
    this.sleep();
    this.#listeners.clear();
  }

  /** Makes every line's sound not made yet: the program's, and any more the export asks for. */
  async #prepare(extra: readonly VoicedLineLike[]): Promise<void> {
    const p = this.#production;
    if (!p) return;
    const lines = [...this.#byNode.values()];
    for (const l of extra) {
      const voice = voiceOf(p, this.#voices, l.scene, l.object);
      if (voice) lines.push({ text: l.text, voice, seconds: l.seconds });
    }
    if (lines.length === 0) {
      if (this.#state.status !== 'ask' && this.#state.status !== 'downloading')
        this.#set({ status: 'idle', silent: 0 });
      return;
    }
    if (!this.#allowed) return this.#ask(lines.length);
    const cache = this.#cacheFor();
    if (!cache) return this.#set({ status: 'unavailable', silent: lines.length });
    this.#set({ status: 'making', silent: this.#state.silent });
    try {
      // A line cut off by letting the engine go is made again next time: it isn't silent.
      const failures = (await cache.prepare(lines)).filter((f) => f.message !== CLOSED);
      if (cache !== this.#cache) return;
      this.#set({
        status: failures.length === lines.length ? 'unavailable' : 'ready',
        silent: failures.length,
      });
    } catch (e) {
      console.error('Speak lines could not be prepared.', e);
      this.#set({ status: 'unavailable', silent: lines.length });
    }
  }

  /** The browser version: asks to download, unless the files are already kept here. */
  async #ask(lines: number): Promise<void> {
    const files = this.#files;
    if (!files || this.#checking || this.#downloading) return;
    this.#checking = true;
    try {
      const bytes = await files.toDownload();
      if (bytes === 0) {
        this.#allowed = true;
        await this.#prepare([]);
        return;
      }
      if (this.#state.status !== 'downloading')
        this.#set({ status: 'ask', silent: lines, download: { done: 0, total: bytes } });
    } catch (e) {
      console.error('The voices’ files could not be checked.', e);
      this.#set({ status: 'unavailable', silent: lines });
    } finally {
      this.#checking = false;
    }
  }

  #engineFor() {
    if (!this.#engine) {
      try {
        this.#engine = this.#options.engine?.() ?? new KokoroEngine(KOKORO_PLACES);
      } catch (e) {
        console.error('The speak line engine could not start.', e);
        return null;
      }
    }
    return this.#engine;
  }

  #cacheFor(): LineCache | null {
    if (!this.#cache) {
      const engine = this.#engineFor();
      if (!engine) return null;
      this.#cache = new LineCache(engine);
    }
    return this.#cache;
  }

  #outFor(): AudioOut | null {
    if (!this.#out) {
      try {
        this.#out = this.#options.out?.() ?? webAudioOut();
      } catch (e) {
        console.error('Speak lines could not be played.', e);
        return null;
      }
    }
    return this.#out;
  }

  #playerFor(): LinePlayer | null {
    if (!this.#player) {
      const cache = this.#cacheFor();
      const out = this.#outFor();
      if (!cache || !out) return null;
      this.#player = new LinePlayer(cache, out);
    }
    return this.#player;
  }

  #set(next: VoicesState): void {
    const now = this.#state;
    if (
      next.status === now.status &&
      next.silent === now.silent &&
      next.problem === now.problem &&
      next.download?.done === now.download?.done &&
      next.download?.total === now.download?.total
    )
      return;
    this.#state = next;
    for (const l of [...this.#listeners]) l();
  }
}
