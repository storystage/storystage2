/**
 * WP5.2: Backstage's Backdrops section, built in: ground types, skies and lighting, and the
 * starting templates that combine them. The templates' numbers are Alice's. Her ground textures
 * aren't ours to copy, so each surface is a flat colour until WP3's textures arrive.
 */
import { StageError, backstageId, type BackstageId, type SceneSetup } from '@storystage/story-api';

export interface Colour {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Ground {
  readonly colour: Colour;
  /** Below 1 you can see into it: water, ice and swamp. */
  readonly opacity: number;
  /** Set for a room: its walls and ceiling. The ground is then its floor. */
  readonly room?: { readonly walls: Colour; readonly ceiling: Colour };
}

export interface Sky {
  /** The sky's colour, which fog fades to. Alice calls it the atmosphere colour. */
  readonly atmosphere: Colour;
}

export interface Lighting {
  readonly above: Colour;
  readonly below: Colour;
}

export interface BackdropTemplate {
  readonly id: string;
  readonly name: string;
  readonly backdrop: SceneSetup['backdrop'];
}

const rgb = (r: number, g: number, b: number): Colour => ({ r, g, b });
const hex = (rrggbb: string): Colour => {
  const n = parseInt(rrggbb, 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);
/** The sky of a scene that doesn't set one, as in Alice. */
const DEFAULT_SKY = rgb(0.5, 0.5, 1);
const DEFAULT_LIGHTING: Lighting = { above: WHITE, below: BLACK };

const surface = (rrggbb: string, opacity = 1): Ground => ({ colour: hex(rrggbb), opacity });

/** Alice's surface appearances, as flat colours. */
const GROUND_LIST: Readonly<Record<string, Ground>> = {
  grass: surface('5f9e3a'),
  darkGrass: surface('2f5a2c'),
  dryGrass: surface('a8a05a'),
  dirt: surface('7a5a3c'),
  sand: surface('d9c48f'),
  mars: surface('a8552e'),
  desert: surface('e0c98f'),
  sandyDesert: surface('c9a86a'),
  snow: surface('f2f6fa'),
  ice: surface('a9d6e8', 0.7),
  swamp: surface('47573a', 0.7),
  swampWater: surface('3c5a4a'),
  poisonSwamp: surface('5a8c32'),
  jungle: surface('2c6e36'),
  ocean: surface('1f6f9e', 0.7),
  islandOcean: surface('1f6f9e', 0.5),
  oceanNight: surface('0f2c44', 0.5),
  water: surface('3c8fb8'),
  oceanFloor: surface('c2b280'),
  moon: surface('8c8c8c'),
  brownSavannaGrass: surface('a58a54'),
  greenSavannaGrass: surface('8a9a4a'),
  forestFloor: surface('5c4630'),
  redForestFloor: surface('7a3c28'),
  darkForestFloor: surface('33291f'),
  goldCoins: surface('d4af37'),
  rockySand: surface('b5a282'),
  rockyBrown: surface('6e5442'),
  rockyRed: surface('8a4632'),
  wood: surface('8c5a32'),
  brick: surface('9c4a36'),
  room: { ...surface('6e3a24'), room: { walls: rgb(1, 1, 0), ceiling: WHITE } },
};

type Row = readonly [
  id: string,
  name: string,
  ground: string,
  sky?: Colour,
  fog?: number,
  above?: Colour,
  below?: Colour,
];

/** Alice's starting templates, in her order. */
const TEMPLATE_ROWS: readonly Row[] = [
  ['grass', 'Grass', 'grass', rgb(150 / 255, 226 / 255, 252 / 255)],
  ['seaFloor', 'Sea floor', 'oceanFloor', rgb(0, 0.431, 0.859), 0.3, WHITE, rgb(0, 0.549, 0.565)],
  ['moon', 'Moon', 'moon', rgb(0.11, 0.133, 0.178), 0, WHITE, rgb(0, 0.118, 0.396)],
  ['mars', 'Mars', 'mars', rgb(0.847, 0.69, 0.588), 0.25, WHITE, rgb(0.541, 0.2, 0)],
  ['snow', 'Snow', 'snow', rgb(0.82, 0.941, 1), 0.22, WHITE, WHITE],
  ['room', 'Room', 'room'],
  [
    'wonderland',
    'Wonderland',
    'darkGrass',
    rgb(0, 0.0941, 0.294),
    0.1,
    WHITE,
    rgb(0.541, 0, 0.125),
  ],
  [
    'seaSurface',
    'Sea surface',
    'ocean',
    rgb(0.659, 0.902, 0.922),
    0.16,
    WHITE,
    rgb(0, 0.424, 0.761),
  ],
  ['lagoonFloor', 'Lagoon floor', 'desert', rgb(0.294, 0.863, 1), 0.16, WHITE, rgb(1, 0.851, 0)],
  ['swamp', 'Swamp', 'swamp', rgb(0.0667, 0.118, 0.122), 0.27, WHITE, rgb(0, 1, 0.741)],
  ['desert', 'Desert', 'sandyDesert', rgb(0.886, 0.831, 0.51), 0.2, WHITE, rgb(0.322, 0.0745, 0)],
  ['dirt', 'Dirt', 'rockyBrown', rgb(0.514, 0.376, 0.278), 0, WHITE, rgb(0.384, 0, 0.22)],
  [
    'seaSurfaceNight',
    'Sea surface at night',
    'oceanNight',
    rgb(0, 0.11, 0.149),
    0.2,
    WHITE,
    rgb(0.529, 1, 0),
  ],
  ['ice', 'Ice', 'ice', rgb(0, 0.278, 0.392), 0.15, WHITE, rgb(0, 0.859, 1)],
  [
    'amazon',
    'Amazon',
    'jungle',
    rgb(0.918, 1, 0.471),
    0.25,
    rgb(0.341, 0.576, 1),
    rgb(0, 0.00784, 0.38),
  ],
  [
    'northwestIsland',
    'Northwest island',
    'islandOcean',
    rgb(0.663, 0.718, 0.843),
    0.15,
    WHITE,
    rgb(0, 0.235, 0.153),
  ],
  ['northwestForest', 'Northwest forest', 'forestFloor', rgb(0.427, 0.533, 0.51), 0.2],
  ['magic', 'Magic', 'swamp', rgb(0.0667, 0.118, 0.125), 0.27, WHITE, rgb(0.169, 0.231, 0.29)],
  ['grassyDesert', 'Grassy desert', 'dryGrass', rgb(0.835, 0.769, 0.518), 0.13],
  ['marsNight', 'Mars at night', 'mars', rgb(0.11, 0.0824, 0.255), 0.25, WHITE, rgb(0.541, 0.2, 0)],
];

const groundId = (name: string) => backstageId(`storystage/Ground/${name}`);
const skyId = (name: string) => backstageId(`storystage/Sky/${name}`);
const lightingId = (name: string) => backstageId(`storystage/Lighting/${name}`);

const GROUNDS = new Map<BackstageId, Ground>(
  Object.entries(GROUND_LIST).map(([name, ground]) => [groundId(name), ground]),
);
const SKIES = new Map<BackstageId, Sky>();
const LIGHTING = new Map<BackstageId, Lighting>();

export const BACKDROP_TEMPLATES: readonly BackdropTemplate[] = TEMPLATE_ROWS.map(
  ([id, name, ground, sky, fog = 0, above, below]) => {
    SKIES.set(skyId(id), { atmosphere: sky ?? DEFAULT_SKY });
    LIGHTING.set(lightingId(id), {
      above: above ?? DEFAULT_LIGHTING.above,
      below: below ?? DEFAULT_LIGHTING.below,
    });
    return {
      id,
      name,
      backdrop: { ground: groundId(ground), sky: skyId(id), lighting: lightingId(id), fog },
    };
  },
);

/** Every built-in ground type, for Backstage's Backdrops section. */
export const GROUND_TYPES: readonly BackstageId[] = [...GROUNDS.keys()];

/** A built-in ground's colour, for painting something with a surface. */
export const groundColour = (id: BackstageId): Colour | null => GROUNDS.get(id)?.colour ?? null;

export interface Backdrop {
  /** Null if the scene has no ground. */
  readonly ground: Ground | null;
  readonly sky: Sky;
  readonly lighting: Lighting;
  readonly fogDensity: number;
}

/**
 * A scene's fog runs from 0 to 1, as Alice's does. She cubes it to get the density of her
 * exponential fog, so that small values stay subtle.
 */
export const fogDensity = (fog: number) => fog * fog * fog;

/** What a scene's backdrop looks like. Rejects an id that isn't built in with `unknown_model`. */
export function resolveBackdrop(backdrop: SceneSetup['backdrop']): Backdrop {
  const find = <T>(table: ReadonlyMap<BackstageId, T>, id: BackstageId): T => {
    const found = table.get(id);
    if (!found) throw new StageError('unknown_model', `There is no backdrop called ${id}.`);
    return found;
  };
  return {
    ground: backdrop.ground ? find(GROUNDS, backdrop.ground) : null,
    sky: backdrop.sky ? find(SKIES, backdrop.sky) : { atmosphere: DEFAULT_SKY },
    lighting: backdrop.lighting ? find(LIGHTING, backdrop.lighting) : DEFAULT_LIGHTING,
    fogDensity: fogDensity(backdrop.fog ?? 0),
  };
}
