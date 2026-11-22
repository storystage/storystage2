/**
 * Speak line's voices for the cast (spec 06, section 4.3; spike 14.3; owner, 10 Nov 2026).
 *
 * A character keeps one voice for the whole production, stored with the cast. Its preset (woman,
 * man, girl, boy, or an animal's size) is one of Kokoro's voices, changed in pitch, formant and
 * speed. The accent, British by default or American, picks which of Kokoro's voices.
 */
import {
  BASE_VOICES,
  DEFAULT_ACCENT,
  checkCastVoice,
  type Accent,
  type CastVoice,
  type Preset,
  VOICE_LIMITS,
} from '@storystage/production/voices';
import type { StoryClass } from '@storystage/story-api';

// The production format's half (format 1.4.0) lives in @storystage/production, which stores the
// voices; it's re-exported here so speech's callers don't change.
export {
  BASE_VOICES,
  DEFAULT_ACCENT,
  PRESETS,
  VOICE_LIMITS,
  type Accent,
  type CastVoice,
  type Preset,
} from '@storystage/production/voices';

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
export function isCastVoice(v: unknown): v is CastVoice {
  return checkCastVoice(v).length === 0;
}
