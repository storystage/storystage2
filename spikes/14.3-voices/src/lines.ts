/** Spike 14.3: the test lines, the British pronunciations, and the voice presets. */
import type { VoiceChange } from './voice-fx.ts';

/** Ten lines of the kind learners write, with British words the American dictionary gets wrong. */
export const LINES = [
  'Here is the key.',
  'Make the cat walk to the tree, and then wave hello.',
  'The owl flew over the castle at midnight.',
  'Can you help me find my little brother?',
  'I put the tomato in the garage.',
  'We had a lovely picnic by the river.',
  'Look out! The dragon is coming!',
  'Thank you, Mr Fox. You found it.',
  'Our schedule is full on Wednesday afternoon.',
  'One, two, three, four, five.',
] as const;

/**
 * British pronunciations the rules can't make, in the dictionary's own format (word, a tab,
 * Kokoro's British phonemes), added after the RP list. BATH and PALM words have /ɑː/ in RP, which
 * nothing in the American spelling or pronunciation predicts. The list grows as words are found.
 */
export const BRITISH = [
  'ASK\tˈɑːsk',
  'AFTER\tˈɑːftə',
  'BATH\tbˈɑːθ',
  "CAN'T\tkˈɑːnt",
  'CLASS\tklˈɑːs',
  'DANCE\tdˈɑːns',
  'FAST\tfˈɑːst',
  'GLASS\tɡlˈɑːs',
  'GRASS\tɡɹˈɑːs',
  'HALF\thˈɑːf',
  'LAST\tlˈɑːst',
  'LAUGH\tlˈɑːf',
  'PASS\tpˈɑːs',
  'PATH\tpˈɑːθ',
  'PLANT\tplˈɑːnt',
  'FATHER\tfˈɑːðə',
  'CALM\tkˈɑːm',
  'ONE\twˈʌn',
  'TOMATO\ttəmˈɑːtQ',
  'GARAGE\tɡˈaɹɑːʒ',
  'SCHEDULE\tʃˈɛdjuːl',
  'AFTERNOON\tˌɑːftənˈuːn',
  'CASTLE\tkˈɑːsəl',
] as const;

export interface Preset {
  readonly id: string;
  readonly label: string;
  /** A Kokoro voice. */
  readonly voice: string;
  readonly change: VoiceChange;
}

/** Settings › Cast's presets (spec 06, section 4.3), made from Kokoro's adult British voices. */
export const PRESETS: readonly Preset[] = [
  { id: 'woman', label: 'Woman', voice: 'bf_emma', change: { shift: 1, speed: 1 } },
  { id: 'man', label: 'Man', voice: 'bm_george', change: { shift: 1, speed: 1 } },
  { id: 'girl', label: 'Girl', voice: 'bf_lily', change: { shift: 1.22, speed: 1.05 } },
  { id: 'boy', label: 'Boy', voice: 'bf_isabella', change: { shift: 1.12, speed: 1.05 } },
  {
    id: 'small-animal',
    label: 'Small animal',
    voice: 'af_sky',
    change: { shift: 1.45, speed: 1.1 },
  },
  { id: 'big-animal', label: 'Big animal', voice: 'bm_daniel', change: { shift: 0.8, speed: 0.9 } },
];

/** Every voice the spike fetches, for the plain-voice runs. */
export const VOICES = [
  'bf_emma',
  'bf_isabella',
  'bf_lily',
  'bf_alice',
  'bm_george',
  'bm_lewis',
  'bm_daniel',
  'bm_fable',
] as const;
