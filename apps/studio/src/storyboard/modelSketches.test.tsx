import type { BackstageItem, Facing } from '@storystage/backstage';
import { exampleProduction, type Production } from '@storystage/production';
import type { BackstageId } from '@storystage/story-api';
import { ThemeRoot } from '@storystage/ui';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useStudio, type Studio } from '../studio.ts';
import { withCastMember } from './cast.ts';
import type { Place } from './place.ts';
import { lookOf, SketchSourceProvider, type SketchSource } from './sketchSource.tsx';
import { Storyboard } from './Storyboard.tsx';

// A model's own sketches in the Storyboard (WP10.9; 07-ux section 6.5).

const KNIGHT = 'kaykit/Biped/knight' as BackstageId;
const CHEST = 'kaykit/Prop/chest' as BackstageId;
const FACINGS: Facing[] = ['front', 'threeQuarter', 'side', 'back'];
const sketchesOf = (id: string, poses: string[]) =>
  [null, ...poses].flatMap((pose) =>
    FACINGS.map((facing) => ({
      facing,
      ...(pose ? { pose } : {}),
      file: `sketches/${id}/${facing}${pose ? `-${pose}` : ''}.svg`,
    })),
  );
const item = (id: string, name: string, poses: string[] | null) =>
  ({
    id,
    section: 'cast',
    class: 'Biped',
    displayName: name,
    themes: [],
    sketches: poses ? sketchesOf(id, poses) : [],
  }) as unknown as BackstageItem;
const svgAt = (file: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="150" height="320" data-file="${file}"/>`)}`;
const ITEMS = [item(KNIGHT, 'Knight', ['walk', 'sit']), item(CHEST, 'Chest', null)];
const source: SketchSource = {
  item: (id) => ITEMS.find((i) => i.id === id),
  sketch: (id, facing, pose) => {
    const found = ITEMS.find((i) => i.id === id)?.sketches.find(
      (s) => s.facing === facing && (s.pose ?? null) === pose,
    );
    // A drawing in the address itself, so nothing is fetched: tall, as a sketch is.
    return found ? svgAt(found.file) : null;
  },
};

const example = exampleProduction();
const scene = example.scenes[0]!.id;
const first = example.frames.find((f) => f.scene === scene)!;

function storyboard(production: Production, given: SketchSource | null = source) {
  let latest: Studio | null = null;
  function View() {
    const studio = useStudio(production);
    latest = studio;
    const [place, setPlace] = useState<Place>({ scene, frame: first.id });
    return (
      <ThemeRoot>
        <SketchSourceProvider source={given}>
          <Storyboard studio={studio} place={place} onPlaceChange={setPlace} />
        </SketchSourceProvider>
      </ThemeRoot>
    );
  }
  render(<View />);
  return () => latest!;
}

const withKnight = withCastMember(example, scene, KNIGHT)!;
const library = () => screen.getByRole('complementary', { name: 'Sketches' });
const knightRow = () => within(library()).getByRole('row', { name: 'Add Knight to frame 1.1' });
/** Which sketch file an image draws. */
const imageIn = (el: Element) => {
  const src = el.querySelector('img')?.getAttribute('src');
  return src ? /data-file="([^"]+)"/.exec(decodeURIComponent(src))?.[1] : undefined;
};

describe('a model’s own sketches (10.9)', () => {
  it('draws a model in the library from its sketch, by its Backstage name', () => {
    storyboard(withKnight);
    expect(imageIn(knightRow())).toBe('sketches/kaykit/Biped/knight/front.svg');
  });

  it('goes on the frame in the facing and pose chosen in the library, and is drawn so', async () => {
    const user = userEvent.setup();
    const studio = storyboard(withKnight);
    await user.click(within(library()).getByRole('radio', { name: 'Side' }));
    await user.click(within(library()).getByRole('radio', { name: 'Walking' }));
    expect(imageIn(knightRow())).toBe('sketches/kaykit/Biped/knight/side-walk.svg');
    knightRow().focus();
    await user.keyboard('{Enter}');
    const placed = studio()
      .production.frames.find((f) => f.id === first.id)!
      .sketches.at(-1)!;
    expect([placed.item, placed.facing, placed.pose]).toEqual([KNIGHT, 'side', 'walk']);
    expect(studio().undoLabel).toBe('Add Knight');
    const onFrame = screen.getByRole('option', { name: /^Knight, / });
    expect(imageIn(onFrame)).toBe('sketches/kaykit/Biped/knight/side-walk.svg');
  });

  it('offers only the poses the cast has, and Facing only for models with sketches', () => {
    storyboard(withKnight);
    const poses = within(library()).getByRole('radiogroup', { name: 'Pose' });
    expect(
      within(poses)
        .getAllByRole('radio')
        .map((r) => r.closest('label')?.textContent),
    ).toEqual(['Standing', 'Walking', 'Sitting']);
  });

  it('keeps a model with no sketches, or with no source, an outline by its name', () => {
    storyboard(withCastMember(example, scene, CHEST)!);
    expect(within(library()).queryByRole('radiogroup', { name: 'Facing' })).toBeNull();
    const row = within(library()).getByRole('row', { name: 'Add Chest to frame 1.1' });
    expect(imageIn(row)).toBeUndefined();
    expect(row.textContent).toContain('Chest');
  });
});

describe('a model’s nearest look', () => {
  const knight = ITEMS[0]!;
  it('is the one asked for, or standing that way, or its first sketch', () => {
    expect(lookOf(knight, { facing: 'side', pose: 'sit' })).toEqual({
      facing: 'side',
      pose: 'sit',
    });
    expect(lookOf(knight, { facing: 'back', pose: 'point' })).toEqual({
      facing: 'back',
      pose: null,
    });
    expect(lookOf(ITEMS[1], { facing: 'front', pose: null })).toBeNull();
  });
});
