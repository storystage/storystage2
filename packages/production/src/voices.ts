/**
 * Format 1.4.0: each speaking character's speak-line voice (spec 06 section 4.3; spec 03 section
 * 1.6; agreed with S1, 11 Nov 2026). The production stores a voice for each character, by the
 * name of its set-up objects, so a film sounds the same on every device. `@storystage/speech` makes the voices
 * (`castVoices`, `voiceFor`, `switchAccent`) and imports these types from here: speech depends on
 * the host, which depends on the Prompter, which depends on this package, so they can't live
 * there.
 */
import type { Production } from './types.ts';

/** British English by default, or American (owner, 10 Nov 2026). Stored with each voice. */
export type Accent = 'british' | 'american';
export const DEFAULT_ACCENT: Accent = 'british';

/** Settings › Cast's presets: people, and animals by size (spec 06 section 4.3). */
export const PRESETS = [
  'woman',
  'man',
  'girl',
  'boy',
  'small-animal',
  'animal',
  'big-animal',
] as const;
export type Preset = (typeof PRESETS)[number];

/** A cast member's speak-line voice, as the production stores it. */
export interface CastVoice {
  readonly preset: Preset;
  /** One of Kokoro's voices that StoryStage ships (`BASE_VOICES`), for example `bf_emma`. */
  readonly base: string;
  readonly pitch: number;
  readonly formant: number;
  readonly speed: number;
  readonly accent: Accent;
}

/** The limits on a voice's change, 1 meaning unchanged (spec 06 section 4.3). */
export const VOICE_LIMITS = {
  pitch: [0.7, 1.5],
  formant: [0.7, 1.5],
  speed: [0.8, 1.25],
} as const;

/** How many voices a production holds at most. */
export const VOICES_MAX = 200;

/**
 * Kokoro's voices that StoryStage ships, by accent and by whether a preset starts from a woman's
 * or a man's. A file naming another is dropped when it opens, so it never reaches the engine; a
 * change here is a format note in `CHANGELOG.md`.
 */
export const BASE_VOICES: Record<Accent, { readonly woman: string[]; readonly man: string[] }> = {
  british: {
    woman: ['bf_emma', 'bf_isabella', 'bf_lily', 'bf_alice'],
    man: ['bm_george', 'bm_lewis', 'bm_daniel', 'bm_fable'],
  },
  american: {
    woman: ['af_heart', 'af_bella', 'af_nicole', 'af_sarah', 'af_sky', 'af_nova', 'af_river'],
    man: ['am_adam', 'am_michael', 'am_eric', 'am_liam', 'am_onyx', 'am_echo', 'am_puck'],
  },
};

const isObject = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** What's wrong with `v` as a stored voice, or nothing. It may come from a file, so it's unknown. */
export function checkCastVoice(v: unknown): string[] {
  if (!isObject(v)) return ['should be an object'];
  const problems: string[] = [];
  const keys = ['preset', 'base', 'pitch', 'formant', 'speed', 'accent'];
  for (const k of Object.keys(v)) if (!keys.includes(k)) problems.push(`has an unknown field ${k}`);
  if (!PRESETS.includes(v.preset as Preset))
    problems.push(`preset should be one of ${PRESETS.join(', ')}`);
  if (v.accent !== 'british' && v.accent !== 'american')
    problems.push('accent should be british or american');
  else {
    const bases = [...BASE_VOICES[v.accent].woman, ...BASE_VOICES[v.accent].man];
    if (typeof v.base !== 'string' || !bases.includes(v.base))
      problems.push(`base should be one of the ${v.accent} voices StoryStage ships`);
  }
  for (const k of ['pitch', 'formant', 'speed'] as const) {
    const [lo, hi] = VOICE_LIMITS[k];
    const x = v[k];
    if (typeof x !== 'number' || !Number.isFinite(x) || x < lo || x > hi)
      problems.push(`${k} should be a number from ${lo} to ${hi}`);
  }
  return problems;
}

/**
 * Every name a voice may have: each set-up object's id in any scene, its field's name as written.
 * Voices are by character, so every object of that name, in any scene, speaks with one voice.
 */
export function voiceNames(p: Pick<Production, 'scenes'>): Set<string> {
  return new Set(p.scenes.flatMap((scene) => scene.setup.objects.map((o) => o.id as string)));
}

/**
 * The voices a file may keep (spec 03 section 1.6): each one that fits `checkCastVoice` and whose
 * name a set-up object has. More than `VOICES_MAX` is a malformed field, so none are kept.
 * Undefined when none are left, so the manifest has no empty `voices`.
 */
export function keptVoices(
  voices: unknown,
  names: ReadonlySet<string>,
): Readonly<Record<string, CastVoice>> | undefined {
  if (!isObject(voices) || Object.keys(voices).length > VOICES_MAX) return undefined;
  // Built with `Object.fromEntries`, which defines each name as its own key, so a character
  // named `__proto__` keeps its voice rather than setting the object's prototype.
  const kept = Object.entries(voices).filter(
    ([name, voice]) => names.has(name) && checkCastVoice(voice).length === 0,
  );
  return kept.length ? (Object.fromEntries(kept) as Record<string, CastVoice>) : undefined;
}

/**
 * The voices after set-up objects were renamed (`renamed`, old name to new, in order): each voice
 * goes with its name, as one step with the rename. If an object of the old name is still in some
 * scene (`names`, after the renames), it keeps its voice too. If the new name already has a voice,
 * that voice stays.
 */
export function renameVoices(
  voices: Readonly<Record<string, CastVoice>> | undefined,
  renamed: readonly (readonly [string, string])[],
  names: ReadonlySet<string>,
): Readonly<Record<string, CastVoice>> | undefined {
  if (!voices || renamed.length === 0) return voices;
  // A Map, not an object, so names such as `constructor` or `__proto__`, which a field may have,
  // are names like any other and never Object.prototype's members.
  const next = new Map(Object.entries(voices));
  for (const [was, now] of renamed) {
    const voice = next.get(was);
    if (!voice) continue;
    if (!next.has(now)) next.set(now, voice);
    if (!names.has(was)) next.delete(was);
  }
  return Object.fromEntries(next);
}
