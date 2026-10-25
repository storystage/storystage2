/**
 * Design tokens (WP12.2): Direction A's values for the dark theme, and the light theme approved by the
 * owner (decisions 0032, 0038). Tokens are named by role, never by colour, so a theme only
 * swaps values. Where a colour plays more than one role (amber as a fill, as text, as an outline),
 * each role has its own token, because the light theme needs a different value for each.
 */

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const COLOR_TOKENS = [
  // Surfaces
  'stage-0', // page and stage
  'stage-0b', // Screening room
  'panel-1', // side rails, code area
  'panel-2', // panels and sidebars
  'panel-3', // cards on panels
  'panel-4', // raised chips, thumbnails
  'band', // panel title bands
  'field', // text fields
  'dialog',
  // Lines
  'line-1', // dividers (decorative)
  'line-2', // control outlines, 3:1 or more
  'dialog-line',
  // Text
  'text', // primary text (Direction A's chalk)
  'text-2', // body text on panels (chalk-2)
  'muted', // secondary text
  'placeholder',
  // The strong fill: selected segments, strong buttons, number discs
  'strong',
  'on-strong',
  // Amber, the spotlight
  'amber', // fill: active mode, primary buttons, the frame
  'on-amber',
  'amber-text',
  'amber-line', // selection outlines
  'amber-tint', // selected card
  'focus', // focus ring
  'focus-on-amber', // focus ring on amber surfaces
  // The Prompter, reserved for it alone
  'prompter', // fill: the AI badge
  'on-prompter',
  'prompter-text',
  'prompter-line',
  'prompter-bg', // icon disc
  // Status and feedback
  'ok',
  'flag',
  'flag-line',
  'flag-bg',
  'stop',
  'status-planned',
  'status-staged',
  'status-coded',
  'unavailable-bg',
  'unavailable-text',
  // Sketches: black lines on white in both themes
  'sketch-paper',
  'sketch-ink',
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

export const colors: Readonly<Record<Theme, Readonly<Record<ColorToken, string>>>> = {
  dark: {
    'stage-0': '#13100E',
    'stage-0b': '#0E0C0B',
    'panel-1': '#1E1915',
    'panel-2': '#241E1A',
    'panel-3': '#2F2822',
    'panel-4': '#3A3129',
    band: '#342B24',
    field: '#13100E',
    dialog: '#1B1714',
    'line-1': '#5A4B3D',
    'line-2': '#8A7B6A',
    'dialog-line': '#4A4036',
    text: '#F5EFE6',
    'text-2': '#E3D9CC',
    muted: '#C2B6A7',
    placeholder: '#AFA394',
    strong: '#F5EFE6',
    'on-strong': '#161412',
    amber: '#F4B740',
    'on-amber': '#1B1407',
    'amber-text': '#F4B740',
    'amber-line': '#F4B740',
    'amber-tint': '#2E2519',
    focus: '#F4B740',
    'focus-on-amber': '#F5EFE6',
    prompter: '#6FD3C7',
    'on-prompter': '#0E2B28',
    'prompter-text': '#6FD3C7',
    'prompter-line': '#6FD3C7',
    'prompter-bg': '#173A36',
    ok: '#7BD88F',
    flag: '#FFB59A',
    'flag-line': '#FFB59A',
    'flag-bg': '#2A1E19',
    stop: '#E58A6A',
    'status-planned': '#D8CDBF',
    'status-staged': '#8FBBFF',
    'status-coded': '#BBA6FF',
    'unavailable-bg': '#2B2520',
    'unavailable-text': '#8F8476',
    'sketch-paper': '#FFFFFF',
    'sketch-ink': '#161412',
  },
  light: {
    'stage-0': '#F6F1E9',
    'stage-0b': '#F1EBE1',
    'panel-1': '#F0EAE1',
    'panel-2': '#FBF8F3',
    'panel-3': '#FFFFFF',
    'panel-4': '#E9E1D5',
    band: '#EFE6D9',
    field: '#F6F1E9',
    dialog: '#FFFFFF',
    'line-1': '#D5C8B8',
    'line-2': '#7D6E5D',
    'dialog-line': '#CDBFAE',
    text: '#1F1A17',
    'text-2': '#3A322B',
    muted: '#665A4E',
    placeholder: '#74685B',
    strong: '#2A2420',
    'on-strong': '#FBF8F3',
    amber: '#F4B740',
    'on-amber': '#1B1407',
    'amber-text': '#8F5600',
    'amber-line': '#B87300',
    'amber-tint': '#FCEFD0',
    focus: '#A35F00',
    'focus-on-amber': '#1F1A17',
    prompter: '#6FD3C7',
    'on-prompter': '#0E2B28',
    'prompter-text': '#0B6E64',
    'prompter-line': '#0E7C70',
    'prompter-bg': '#D3F2EE',
    ok: '#1C7431',
    flag: '#B13D14',
    'flag-line': '#C2522B',
    'flag-bg': '#FDECE5',
    stop: '#B0412A',
    'status-planned': '#5A4F44',
    'status-staged': '#2357B5',
    'status-coded': '#6443C0',
    'unavailable-bg': '#ECE6DD',
    'unavailable-text': '#8A7D70',
    'sketch-paper': '#FFFFFF',
    'sketch-ink': '#161412',
  },
};

/** Type: Bricolage Grotesque for display, Atkinson Hyperlegible for everything else (decision 0031). */
export const fonts = {
  display: "'Bricolage Grotesque', system-ui, sans-serif",
  body: "'Atkinson Hyperlegible', system-ui, sans-serif",
  mono: 'ui-monospace, monospace',
  icons: "'Material Symbols Rounded'",
} as const;

/** Sizes in px. Body text is never under 16; 14–15 is for labels only. */
export const fontSizes = {
  meta: 14,
  label: 15,
  body: 16,
  dialogue: 18,
  panelTitle: 19,
  modeTab: 16,
  title: 26,
  display: 30,
} as const;

/** Text size setting (decision 0035): scales the type, not the layout. */
export const TEXT_SIZES = [1, 1.25, 1.5] as const;

/** Spacing on a 4 px base. */
export const space = { 1: 4, 1.5: 6, 2: 8, 2.5: 10, 3: 12, 3.5: 14, 4: 16, 5.5: 22 } as const;

export const radius = { tile: 6, chip: 8, button: 12, panel: 14, dialog: 20, pill: 999 } as const;

/** Hit targets are 44 × 44 px or more; key actions 46–52. */
export const sizes = { target: 44, keyAction: 52, field: 48, header: 64, frameBorder: 3 } as const;
