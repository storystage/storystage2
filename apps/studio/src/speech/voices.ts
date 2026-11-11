/**
 * Speak lines' voices in the studio (spec 06 sections 4.3, 4.5 and 4.6; WP14b): S1's Kokoro engine,
 * its `LineCache` and `LinePlayer`, for Rehearse and the export alike. Loaded only for a film with
 * speak lines. Each line's sound is made in the background as the code changes; Rehearse starts a
 * line's sound as its block starts, and a line not made yet stays silent with its caption.
 *
 * Until the production format has a voice for each character (`manifest.voices[name]`, S4's
 * #366), each takes its Backstage class's preset, keyed by its name, so it sounds the same in every
 * scene and two knights sound different (spec 06 section 4.3), in the default accent, British.
 */
import type { NodeId } from '@storystage/ast';
import type { Production, SceneId } from '@storystage/production';
import {
  DEFAULT_ACCENT,
  KokoroEngine,
  LineCache,
  LinePlayer,
  castVoices,
  lineSeconds,
  webAudioOut,
  type AudioOut,
  type CastMember,
  type CastVoice,
  type Line,
  type SpeechEngine,
} from '@storystage/speech';
import { speakLines, type SpeakLineAt } from './speakLines.ts';

/** Where the app serves Kokoro's files and ONNX Runtime's (S8 bundles them; spec 06, 4.6). */
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
  /** `idle` with nothing to make; `making` while sounds are made; `ready` once they are. */
  readonly status: 'idle' | 'making' | 'ready' | 'unavailable';
  /** Lines whose sound couldn't be made: silent, with their captions (rule 7). */
  readonly silent: number;
}

/**
 * Each character's voice: every set-up object by name, in running order, once, with the class it
 * has in the first scene it's in, given its class's preset by S1's `castVoices` (people
 * alternating woman and man, no two the same while there are voices to spare).
 */
export function productionVoices(p: Production): Map<string, CastVoice> {
  // The film's own voices first (format 1.4.0, `manifest.voices`), so it sounds the same on
  // every device; the class decides only for a character the film has no voice for yet.
  const stored = p.manifest.voices ?? {};
  const accent = Object.values(stored)[0]?.accent ?? DEFAULT_ACCENT;
  const cast: CastMember[] = [];
  const seen = new Set<string>(Object.keys(stored));
  for (const { scene } of p.manifest.runningOrder) {
    const setup = p.scenes.find((s) => s.id === scene)?.setup;
    for (const o of setup?.objects ?? []) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      cast.push({ id: o.id, storyClass: o.class });
    }
  }
  const voices = castVoices(cast, accent);
  for (const [name, voice] of Object.entries(stored)) voices.set(name, voice);
  return voices;
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

export interface VoicesOptions {
  /** The engine; by default Kokoro in a worker, from where the app serves it. */
  readonly engine?: () => SpeechEngine & { dispose(): void };
  /** Where Rehearse's lines sound; by default the page's audio. */
  readonly out?: () => AudioOut;
  /** How long the code stays still before its lines are made. Default 400 ms. */
  readonly settle?: number;
}

/** The studio's voices, for as long as the App lives. */
export class Voices {
  readonly #options: VoicesOptions;
  #engine: (SpeechEngine & { dispose(): void }) | null = null;
  #cache: LineCache | null = null;
  #player: LinePlayer | null = null;
  #production: Production | null = null;
  #voices: ReadonlyMap<string, CastVoice> = new Map();
  #byNode = new Map<string, Line>();
  #timer: ReturnType<typeof setTimeout> | null = null;
  #state: VoicesState = { status: 'idle', silent: 0 };
  readonly #listeners = new Set<() => void>();

  constructor(options: VoicesOptions = {}) {
    this.#options = options;
  }

  get state(): VoicesState {
    return this.#state;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  /** The film as it is now: its lines are made once the code has been still a moment. */
  update(p: Production): void {
    if (p === this.#production) return;
    this.#production = p;
    this.#voices = productionVoices(p);
    this.#byNode = new Map();
    for (const at of speakLines(p)) {
      const line = lineOf(p, this.#voices, at);
      if (line) this.#byNode.set(at.node, line);
    }
    if (this.#timer) clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#prepare([]), this.#options.settle ?? 400);
  }

  /** Rehearse: a block started. A speak line's sound starts, cutting the one before. */
  start(node: NodeId): void {
    const line = this.#byNode.get(node);
    if (line) this.#playerFor()?.start(line);
  }

  /** Rehearse stopped, paused or ended: silence. */
  stop(): void {
    this.#player?.stop();
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
    this.#player?.stop();
    this.#engine?.dispose();
  }

  dispose(): void {
    if (this.#timer) clearTimeout(this.#timer);
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
    if (lines.length === 0) return this.#set({ status: 'idle', silent: 0 });
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

  #playerFor(): LinePlayer | null {
    if (!this.#player) {
      const cache = this.#cacheFor();
      if (!cache) return null;
      try {
        this.#player = new LinePlayer(cache, this.#options.out?.() ?? webAudioOut());
      } catch (e) {
        console.error('Speak lines could not be played.', e);
        return null;
      }
    }
    return this.#player;
  }

  #set(next: VoicesState): void {
    if (next.status === this.#state.status && next.silent === this.#state.silent) return;
    this.#state = next;
    for (const l of [...this.#listeners]) l();
  }
}
