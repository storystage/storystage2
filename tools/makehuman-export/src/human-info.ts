/**
 * WP3.5: from `people.json` to what the pipeline needs.
 *
 * - `humanInfo`: one person as MPFB2's character dict (`HumanService.deserialize_from_dict`).
 *   The Blender script (`blender/make_people.py`) stays thin, and the decisions are here, tested.
 * - `sourceList`: the people as a Backstage source list (`sources/makehuman.json`), so they get
 *   the same manifest items, joint mapping, provenance and sketches as every other model.
 */
import { ageToMacro, CLOTHES_COLOURS, skinFor, type Person } from './people.ts';

/** The skeleton in MPFB2 that matches the joint map's `unreal` convention (spec 17, 2a). */
const RIG = 'game_engine';
/**
 * Plain materials: a base colour texture, which glTF can carry. MPFB2's richer skin materials
 * are shader graphs that an export would lose.
 */
const MATERIAL = 'GAMEENGINE';

export interface HumanInfo {
  readonly name: string;
  readonly phenotype: {
    readonly gender: number;
    readonly age: number;
    readonly muscle: number;
    readonly weight: number;
    readonly proportions: number;
    readonly height: number;
    readonly cupsize: number;
    readonly firmness: number;
    readonly race: { readonly african: number; readonly asian: number; readonly caucasian: number };
  };
  readonly rig: string;
  readonly eyes: string;
  readonly eyebrows: string;
  readonly eyelashes: string;
  readonly tongue: string;
  readonly teeth: string;
  readonly hair: string;
  readonly proxy: string;
  readonly targets: readonly unknown[];
  readonly clothes: readonly string[];
  readonly expressions: readonly unknown[];
  readonly skin_mhmat: string;
  readonly skin_material_type: string;
  readonly eyes_material_type: string;
  readonly clothes_material_type: string;
  readonly skin_material_settings: Readonly<Record<string, unknown>>;
  readonly eyes_material_settings: Readonly<Record<string, unknown>>;
  /** Not MPFB2's: read by `make_people.py`, for what its dict can't say. */
  readonly storystage: {
    readonly displayName: string;
    readonly eyes: string;
    readonly hairTint: 'grey' | 'white' | null;
    /** The outfit to recolour, and its colour: red, green and blue from 0 to 1. */
    readonly outfit: string;
    readonly clothesColour: readonly [number, number, number] | null;
  };
}

export function humanInfo(p: Person): HumanInfo {
  return {
    name: p.id,
    phenotype: {
      gender: p.gender,
      age: ageToMacro(p.ageYears),
      muscle: p.build.muscle,
      weight: p.build.weight,
      proportions: p.build.proportions,
      height: p.build.height,
      cupsize: 0.5,
      firmness: 0.5,
      race: { ...p.ancestry },
    },
    rig: RIG,
    eyes: 'low-poly.mhclo',
    eyebrows: `${p.eyebrows}.mhclo`,
    eyelashes: 'eyelashes01.mhclo',
    tongue: 'tongue01.mhclo',
    teeth: 'teeth_base.mhclo',
    hair: p.hair === null ? '' : `${p.hair}.mhclo`,
    proxy: '',
    targets: [],
    clothes: [
      ...p.clothes,
      p.shoes,
      ...(p.hat ? [p.hat] : []),
      ...(p.glasses ? [p.glasses] : []),
    ].map((c) => `${c}.mhclo`),
    expressions: [],
    skin_mhmat: `${skinFor(p)}.mhmat`,
    skin_material_type: MATERIAL,
    eyes_material_type: MATERIAL,
    clothes_material_type: MATERIAL,
    skin_material_settings: {},
    eyes_material_settings: {},
    storystage: {
      displayName: p.name,
      eyes: p.eyes,
      hairTint: p.hairTint ?? null,
      outfit: p.clothes[0]!,
      clothesColour: p.clothesColour ? CLOTHES_COLOURS[p.clothesColour] : null,
    },
  };
}

const MAKEHUMAN_LICENCE_PAGE =
  'https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html';

const ageGroup = (years: number) =>
  years <= 12 ? 'children' : years <= 17 ? 'teenagers' : years <= 64 ? 'adults' : 'older people';

/** The people as a Backstage source list. The models are made in CI, not fetched. */
export function sourceList(people: readonly Person[]) {
  return {
    source: 'makehuman',
    items: people.map((p) => ({
      id: `makehuman/Biped/${p.id}`,
      displayName: p.name,
      class: 'Biped',
      section: 'cast',
      themes: ['everyday', ageGroup(p.ageYears)],
      description: p.description,
      licence: 'CC0-1.0',
      credit: `${p.name}, made with MakeHuman (CC0)`,
      page: MAKEHUMAN_LICENCE_PAGE,
      fetch: { generated: `makehuman/${p.id}.glb` },
    })),
  };
}
