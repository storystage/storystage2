import { describe, expect, it } from 'vitest';
import {
  galleryList,
  isSims2Model,
  parseConverterList,
  homeSection,
  parseGalleryNames,
  parseResource,
  renderGalleryTable,
  storyClassOf,
} from './gallery.ts';

const NAMES = `
org.lgna.story.resources.Aircraft = Aircraft
org.lgna.story.resources.aircraft.HangGlider = HangGlider
org.lgna.story.resources.MarineMammal = MarineMammal
org.lgna.story.resources.marinemammal.Dolphin = Dolphin
org.lgna.story.resources.Prop = Prop
org.lgna.story.resources.prop.Bamboo = Bamboo
# a comment
org.lgna.story.resources.prop.Bamboo.SHOOT1 = shoot 1
`;

const BAMBOO = `
package org.lgna.story.resources.prop;
public enum BambooResource implements PropResource {
  SHOOT1, CLUSTER1, THICKET_DARK_GREEN(ImplementationAndVisualType.SIMS2);

  private final ImplementationAndVisualType resourceType;
`;

describe('parseGalleryNames', () => {
  it('reads the models and their class folders, and skips everything else', () => {
    expect(parseGalleryNames(NAMES)).toEqual([
      { folder: 'Aircraft', name: 'HangGlider', aliceName: 'HangGlider', pkg: 'aircraft' },
      { folder: 'MarineMammal', name: 'Dolphin', aliceName: 'Dolphin', pkg: 'marinemammal' },
      { folder: 'Prop', name: 'Bamboo', aliceName: 'Bamboo', pkg: 'prop' },
    ]);
  });
});

describe('parseResource', () => {
  it("reads the variants and marks those drawn from The Sims 2's art", () => {
    expect(parseResource(BAMBOO)).toEqual([
      { name: 'SHOOT1', sims2: false },
      { name: 'CLUSTER1', sims2: false },
      { name: 'THICKET_DARK_GREEN', sims2: true },
    ]);
  });

  it('returns null for a file without a resource enum', () => {
    expect(parseResource('class Nothing {}')).toBeNull();
  });
});

describe('classes and sections', () => {
  it("map Alice's packages to Story API classes and home sections", () => {
    expect(storyClassOf('biped')).toBe('Biped');
    expect(storyClassOf('fish')).toBe('Swimmer');
    expect(storyClassOf('marinemammal')).toBe('Swimmer');
    expect(storyClassOf('automobile')).toBe('Transport');
    expect(storyClassOf('prop')).toBe('Prop');
    expect(homeSection('quadruped')).toBe('cast');
    expect(homeSection('watercraft')).toBe('props');
    expect(homeSection('prop')).toBe('props or set');
  });
});

describe('galleryList and renderGalleryTable', () => {
  const list = galleryList(parseGalleryNames(NAMES), new Map([['prop/Bamboo', BAMBOO]]));

  it('joins each model to its resource, where StoryStage 1 has the source', () => {
    expect(list.map((m) => m.key)).toEqual([
      'Aircraft/HangGlider',
      'MarineMammal/Dolphin',
      'Prop/Bamboo',
    ]);
    expect(list[0]!.variants).toBeNull();
    expect(list[2]!.variants).toHaveLength(3);
    expect(list[2]!.verdict).toMatch(/Sims 2.*THICKET_DARK_GREEN/);
    expect(list[0]!.verdict).toMatch(/CMU/);
  });

  it('renders one numbered row per model', () => {
    const table = renderGalleryTable(list).split('\n');
    expect(table[0]).toMatch(/^\| # \| Key \|/);
    expect(table).toHaveLength(2 + 3);
    expect(table[4]).toMatch(
      /^\| 3 \| `Prop\/Bamboo` \| Bamboo \| Prop \| props or set \| 3 \(1 Sims 2\) \|/,
    );
    expect(table[2]).toMatch(/\| not in source \|/);
  });
});

describe('parseConverterList', () => {
  const report = JSON.stringify({
    models: [
      {
        key: 'Automobile/Bus',
        variant: 'TEAM',
        error: "skipped: drawn from The Sims 2's art (WP17.7)",
      },
      {
        key: 'Automobile/Bus',
        variant: 'SCHOOL',
        error: "skipped: drawn from The Sims 2's art (WP17.7)",
      },
      { key: 'Prop/Bamboo', variant: 'SHOOT1', error: null },
      {
        key: 'Prop/Bamboo',
        variant: 'THICKET',
        error: "skipped: drawn from The Sims 2's art (WP17.7)",
      },
      { key: 'Prop/Broken', variant: null, error: 'no resource class' },
    ],
  });

  it("reads each model's variants from Alice's jars, marking Sims 2 art", () => {
    const jars = parseConverterList(report);
    expect(jars.get('Automobile/Bus')).toEqual([
      { name: 'TEAM', sims2: true },
      { name: 'SCHOOL', sims2: true },
    ]);
    expect(jars.has('Prop/Broken')).toBe(false);
  });

  it('marks a model drawn wholly from Sims 2 art "never ship", and prefers the jars to the source', () => {
    const names = [
      { folder: 'Automobile', pkg: 'automobile', name: 'Bus', aliceName: 'Bus' },
      { folder: 'Prop', pkg: 'prop', name: 'Bamboo', aliceName: 'Bamboo' },
    ];
    const list = galleryList(names, new Map(), parseConverterList(report));
    expect(list[0]!.verdict).toMatch(/^Never ship: drawn from The Sims 2/);
    expect(isSims2Model(list[0]!)).toBe(true);
    expect(list[1]!.verdict).toMatch(/Never ship the Sims 2 variants \(THICKET/);
    expect(isSims2Model(list[1]!)).toBe(false);
    expect(renderGalleryTable(list)).toContain('| 2 (2 Sims 2) |');
  });
});
