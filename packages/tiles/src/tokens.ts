/**
 * The Tiles editor's colours: Direction A's "Tiles editor colours", Alice 3's grammar with our
 * own artwork, and Alice's blue and green darkened so text passes 4.5:1 (spec 14, section 3b).
 * Tiles look the same in both themes, so these aren't theme tokens: the editor's root sets them
 * as `--tl-*` custom properties, and `tiles.css` uses nothing else.
 */
export const TILE_COLOURS = {
  surround: '#F6F6F6',
  panel: '#E7E6F7',
  'panel-line': '#A9A7C9',
  program: '#FFFFFF',
  'program-line': '#9A9AAE',
  ink: '#14143A',
  'ink-2': '#55555F',
  // Action tiles (statements)
  action: '#5A5AD6',
  'action-line': '#2E2E9E',
  'action-grip': '#4646C2',
  'action-dots': '#C9C9FF',
  'action-text': '#FFFFFF',
  // Question tiles (functions)
  question: '#8FD694',
  'question-line': '#3C8F45',
  'question-text': '#0F3B12',
  // Values
  pill: '#FFD43B',
  'pill-line': '#B38F00',
  'pill-text': '#1A1400',
  'pill-caret': '#6B5600',
  empty: '#E4E4EC',
  // Control boxes
  control: '#FFFFFF',
  'control-line': '#A6A6B4',
  'control-dots': '#9A9AAA',
  'control-divider': '#D6D6DE',
  comment: '#DCEFD8',
  'comment-line': '#6E9C66',
  'comment-text': '#17501F',
  'add-detail': '#C4C4F7',
  'add-detail-text': '#14143A',
  slot: '#8A8A96',
  // Focus and highlights
  focus: '#C77700',
  rehearse: '#1E7A34',
  error: '#B0412A',
  prompter: '#6B4FD6',
} as const;

export type TileColour = keyof typeof TILE_COLOURS;

/** Text on its background, each needing 4.5:1 (WCAG 2.2 AA, 1.4.3). */
export const TEXT_PAIRS: readonly (readonly [TileColour, TileColour])[] = [
  ['ink', 'program'],
  ['ink', 'panel'],
  ['ink-2', 'program'],
  ['ink', 'control'],
  ['action-text', 'action'],
  ['question-text', 'question'],
  ['pill-text', 'pill'],
  ['comment-text', 'comment'],
  ['add-detail-text', 'add-detail'],
  ['ink', 'empty'],
  ['program', 'rehearse'],
  ['error', 'program'],
  ['ink', 'panel'],
];

/** Outlines and focus rings, each needing 3:1 against what's next to them (1.4.11). */
export const OUTLINE_PAIRS: readonly (readonly [TileColour, TileColour])[] = [
  ['focus', 'program'],
  ['slot', 'program'],
  ['rehearse', 'program'],
  ['error', 'program'],
  ['prompter', 'program'],
];

/** The colours as the custom properties `tiles.css` reads. */
export const tileVariables = (): Record<string, string> =>
  Object.fromEntries(Object.entries(TILE_COLOURS).map(([name, value]) => [`--tl-${name}`, value]));
