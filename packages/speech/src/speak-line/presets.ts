/**
 * Speak line's voices for the cast (spec 06, section 4.3; spike 14.3; owner, 10 Nov 2026).
 *
 * A character keeps one voice for the whole production, stored with the cast. Its preset (woman,
 * man, girl, boy, or an animal's size) is one of Kokoro's voices, changed in pitch, formant and
 * speed. The accent, British by default or American, picks which of Kokoro's voices.
 */
import type { StoryClass } from '@storystage/story-api';

export type Accent = 'british' | 'american';
export const DEFAULT_ACCENT: Accent = 'british';

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

/** A cast member's speak-line voice, as the production stores it (`03-production-format.md`). */
export interface CastVoice {
  readonly preset: Preset;
  /** One of Kokoro's voices, for example `bf_emma`. */
  readonly base: string;
  readonly pitch: number;
  readonly formant: number;
  readonly speed: number;
  readonly accent: Accent;
}

/** The limits on a voice's change, 1 meaning unchanged (spec 06, 4.3). */
export const VOICE_LIMITS = {
  pitch: [0.7, 1.5],
  formant: [0.7, 1.5],
  speed: [0.8, 1.25],
} as const;

/** Kokoro's voices, by accent and by whether the preset starts from a woman's or a man's. */
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

/** Each preset: which kind of voice it starts from, and how it's changed (spike 14.3's values). */
const SHAPES: Record<Preset, { from: 'woman' | 'man'; pitch: number; speed: number }> = {
  woman: { from: 'woman', pitch: 1, speed: 1 },
  man: { from: 'man', pitch: 1, speed: 1 },
  girl: { from: 'woman', pitch: 1.22, speed: 1.05 },
  boy: { from: 'woman', pitch: 1.12, speed: 1.05 },
  'small-animal': { from: 'woman', pitch: 1.45, speed: 1.1 },
  animal: { from: 'man', pitch: 1.15, speed: 1 },
  'big-animal': { from: 'man', pitch: 0.8, speed: 0.9 },
};

/** Animals by their Backstage class; people (Biped) and everything else alternate woman and man. */
const ANIMAL_CLASSES: ReadonlySet<StoryClass> = new Set([
  'Quadruped',
  'Flyer',
  'Swimmer',
  'Slitherer',
]);

export interface CastMember {
  readonly id: string;
  readonly storyClass: StoryClass;
  /** The learner's choice, if they've made one; otherwise the class decides. */
  readonly preset?: Preset;
}

const clamp = (x: number, [lo, hi]: readonly [number, number]) =>
  Math.min(hi, Math.max(lo, Math.round(x * 100) / 100));

/** A voice for `preset`, using the `nth` voice of its kind in `accent`, varied when they run out. */
export function voiceFor(preset: Preset, accent: Accent, nth: number): CastVoice {
  const shape = SHAPES[preset];
  const bases = BASE_VOICES[accent][shape.from];
  const round = Math.floor(nth / bases.length);
  // Once every voice of that kind is in use, lift the next round's pitch a little, so characters
  // still sound different.
  const pitch = clamp(shape.pitch * (1 + 0.06 * round), VOICE_LIMITS.pitch);
  return {
    preset,
    base: bases[nth % bases.length]!,
    pitch,
    formant: pitch,
    speed: clamp(shape.speed, VOICE_LIMITS.speed),
    accent,
  };
}

/**
 * Voices for the whole cast, in cast order: each member's preset (their own, or from their class),
 * and no two characters with the same voice while Kokoro has voices of that kind to spare.
 */
export function castVoices(
  cast: readonly CastMember[],
  accent: Accent = DEFAULT_ACCENT,
): Map<string, CastVoice> {
  const voices = new Map<string, CastVoice>();
  const used: Record<'woman' | 'man', number> = { woman: 0, man: 0 };
  let people = 0;
  for (const member of cast) {
    const preset =
      member.preset ??
      (ANIMAL_CLASSES.has(member.storyClass) ? 'animal' : people++ % 2 === 0 ? 'woman' : 'man');
    const kind = SHAPES[preset].from;
    voices.set(member.id, voiceFor(preset, accent, used[kind]++));
  }
  return voices;
}

/**
 * The same cast in the other accent (4.3): each character keeps its preset and its place among
 * the voices of its kind; every line's sound must then be prepared again.
 */
export function switchAccent(voice: CastVoice, accent: Accent): CastVoice {
  if (voice.accent === accent) return voice;
  const kind = SHAPES[voice.preset].from;
  const from = BASE_VOICES[voice.accent][kind];
  const at = Math.max(0, from.indexOf(voice.base));
  const to = BASE_VOICES[accent][kind];
  return { ...voice, accent, base: to[at % to.length]! };
}

/** Is this a voice the production format may hold? */
export function isCastVoice(v: CastVoice): boolean {
  const within = (x: number, [lo, hi]: readonly [number, number]) => x >= lo && x <= hi;
  return (
    PRESETS.includes(v.preset) &&
    (v.accent === 'british' || v.accent === 'american') &&
    [...BASE_VOICES[v.accent].woman, ...BASE_VOICES[v.accent].man].includes(v.base) &&
    within(v.pitch, VOICE_LIMITS.pitch) &&
    within(v.formant, VOICE_LIMITS.formant) &&
    within(v.speed, VOICE_LIMITS.speed)
  );
}
