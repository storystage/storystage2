/**
 * Hand-made sketches that don't come from a model (WP10.5): storyboard marks, and backdrop
 * sketches for Backstage's Backdrops section (skies and grounds have no shape to draw).
 * Same style as rendered sketches: black lines, 3 units wide, on white.
 */

export interface HandSketch {
  /** The library id: `mark/speech`, `backdrop/trees`. */
  readonly id: string;
  /** What a learner sees as its label. */
  readonly label: string;
  readonly svg: string;
}

const LINE =
  'fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"';
const FILL = 'fill="#fff" stroke="#000" stroke-width="3" stroke-linejoin="round"';

const svg = (id: string, label: string, w: number, h: number, body: string): HandSketch => ({
  id,
  label,
  svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" data-sketch-id="${id}"><title>${label}</title>${body}</svg>`,
});

export const MARKS: readonly HandSketch[] = [
  svg(
    'mark/speech',
    'Speech bubble',
    120,
    90,
    `<path d="M20 8h80a12 12 0 0 1 12 12v32a12 12 0 0 1-12 12H52L30 82l6-18H20A12 12 0 0 1 8 52V20A12 12 0 0 1 20 8z" ${FILL}/>`,
  ),
  svg(
    'mark/thought',
    'Thought bubble',
    120,
    100,
    `<path d="M30 60c-14 0-22-10-18-20 2-8 10-10 14-8 2-12 16-18 26-12 6-8 22-8 28 2 12-2 22 8 18 18 8 6 4 20-8 20-4 8-18 10-26 4-8 6-22 4-26-4z" ${FILL}/><circle cx="26" cy="76" r="6" ${FILL}/><circle cx="14" cy="90" r="4" ${FILL}/>`,
  ),
  svg(
    'mark/move',
    'Movement arrow',
    140,
    60,
    `<path d="M10 40C40 12 80 12 112 30" ${LINE}/><path d="M98 16l16 14-20 8" ${LINE}/>`,
  ),
  svg(
    'mark/camera',
    'Camera move',
    150,
    80,
    `<rect x="8" y="22" width="52" height="36" rx="6" ${FILL}/><path d="M60 34l18-10v32l-18-10z" ${FILL}/><path d="M88 40h50" ${LINE}/><path d="M124 28l14 12-14 12" ${LINE}/>`,
  ),
  svg(
    'mark/text',
    'Text',
    120,
    70,
    `<rect x="6" y="6" width="108" height="58" rx="6" ${FILL}/><path d="M30 22h60M60 22v32" ${LINE}/>`,
  ),
];

const W = 400;
const H = 120;
const ground = `<path d="M4 104H396" ${LINE}/>`;

export const BACKDROP_SKETCHES: readonly HandSketch[] = [
  svg('backdrop/ground', 'Open ground', W, H, ground),
  svg(
    'backdrop/hills',
    'Hills',
    W,
    H,
    `<path d="M4 104C60 60 110 60 170 92S290 50 396 86" ${LINE}/>${ground}`,
  ),
  svg(
    'backdrop/trees',
    'Trees',
    W,
    H,
    `${ground}${[40, 120, 230, 330]
      .map(
        (x) =>
          `<path d="M${x} 104V72" ${LINE}/><path d="M${x - 22} 74c-8-22 10-40 22-36 12-4 30 14 22 36z" ${FILL}/>`,
      )
      .join('')}`,
  ),
  svg(
    'backdrop/buildings',
    'Buildings',
    W,
    H,
    `<path d="M20 104V50h50v54M70 104V30h44v74M130 104V60h60v44M200 104V40h40v64M260 104V56h70v48M340 104V36h40v68" ${LINE}/>${ground}`,
  ),
  svg(
    'backdrop/sea',
    'Sea',
    W,
    H,
    `<path d="M4 70H396" ${LINE}/><path d="M30 88c10-6 20-6 30 0s20 6 30 0M170 96c10-6 20-6 30 0s20 6 30 0M300 86c10-6 20-6 30 0s20 6 30 0" ${LINE}/>`,
  ),
  svg(
    'backdrop/room',
    'Room',
    W,
    H,
    `<path d="M4 104L120 70H280L396 104M120 70V4M280 70V4" ${LINE}/>`,
  ),
  svg(
    'backdrop/night',
    'Night sky',
    W,
    H,
    `<path d="M330 14a20 20 0 1 0 20 30 16 16 0 1 1-20-30z" ${FILL}/><path d="M60 30l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM170 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM250 40l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" ${FILL}/>${ground}`,
  ),
  svg(
    'backdrop/day',
    'Day sky',
    W,
    H,
    `<circle cx="340" cy="30" r="16" ${FILL}/><path d="M60 46c-10 0-14-12-4-16 2-10 18-12 22-2 10-4 20 4 16 12 6 4 2 10-6 10z" ${FILL}/>${ground}`,
  ),
];

/** Words in a backdrop's name or themes that choose its sketch; the first match wins. */
const BACKDROP_WORDS: readonly (readonly [RegExp, string])[] = [
  [/night|moon|star/i, 'backdrop/night'],
  [/room|indoor|inside|house|kitchen|class|hall/i, 'backdrop/room'],
  [/forest|wood|tree|jungle|park/i, 'backdrop/trees'],
  [/city|town|street|village|building/i, 'backdrop/buildings'],
  [/sea|ocean|beach|lake|river|water/i, 'backdrop/sea'],
  [/hill|field|meadow|grass|mountain/i, 'backdrop/hills'],
  [/sky|day|sun|cloud/i, 'backdrop/day'],
];

/** The backdrop sketch for a Backdrops item, chosen from its name and themes. */
export function backdropSketchFor(item: {
  readonly displayName: string;
  readonly themes: readonly string[];
}): HandSketch {
  const words = [item.displayName, ...item.themes].join(' ');
  const id = BACKDROP_WORDS.find(([re]) => re.test(words))?.[1] ?? 'backdrop/ground';
  return BACKDROP_SKETCHES.find((s) => s.id === id)!;
}
