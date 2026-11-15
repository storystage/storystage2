import type { BackstageItem } from '@storystage/backstage';
import type { BackstageImport } from '@storystage/host';
import { exampleProduction, type Production } from '@storystage/production';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { useStudio, type Studio } from '../studio.ts';
import { withCastMember, standInName } from './cast.ts';
import type { Place } from './place.ts';
import { Storyboard } from './Storyboard.tsx';

// Backstage from the Storyboard (WP10.9; M4 gate section 4 step 1).

const item = (id: string, section: BackstageItem['section'], cls: string, name: string) =>
  ({
    id,
    section,
    class: cls,
    displayName: name,
    themes: [],
    description: '',
  }) as unknown as BackstageItem;
const CATALOGUE = [
  item('kaykit/Biped/knight', 'cast', 'Biped', 'Knight'),
  item('kaykit/Ground/forest', 'backdrops', 'Ground', 'Forest floor'),
];
const example = exampleProduction();
const scene = example.scenes[0]!.id;
const first = example.frames.find((f) => f.scene === scene)!;

function storyboard(importing: BackstageImport = 'off', production: Production = example) {
  let latest: Studio | null = null;
  function View() {
    const studio = useStudio(production);
    latest = studio;
    const [place, setPlace] = useState<Place>({ scene, frame: first.id });
    return (
      <ThemeRoot>
        <Storyboard
          studio={studio}
          place={place}
          onPlaceChange={setPlace}
          models={{ catalogue: CATALOGUE, thumbnail: () => null }}
          importing={importing}
        />
      </ThemeRoot>
    );
  }
  render(<View />);
  return () => latest!;
}

const castOf = (studio: Studio) => studio.production.storyboard.cards[0]!.cast;
const library = () => screen.getByRole('complementary', { name: 'Sketches' });

describe('a scene’s cast', () => {
  it('takes a member once, a stand-in by its name whatever its case', () => {
    const once = withCastMember(example, scene, { standIn: 'Dragon' })!;
    expect(once.storyboard.cards[0]!.cast.at(-1)).toEqual({ standIn: 'Dragon' });
    expect(withCastMember(once, scene, { standIn: 'dragon' })).toBeNull();
  });

  it('tidies a stand-in’s name, and refuses none or too long a one', () => {
    expect(standInName('  red   dragon ')).toBe('red dragon');
    expect(standInName('   ')).toBeNull();
    expect(standInName('x'.repeat(31))).toBeNull();
  });
});

describe('Backstage from the Storyboard (10.9)', () => {
  it('adds a model to the scene’s cast, its sketch joining the library, as one undo step', async () => {
    const user = userEvent.setup();
    const studio = storyboard();
    await user.click(screen.getByRole('button', { name: 'Cast' }));
    await user.click(screen.getByRole('button', { name: 'Add Knight to scene 1’s cast' }));
    expect(castOf(studio()).at(-1)).toBe('kaykit/Biped/knight');
    expect(studio().undoLabel).toBe('Add Knight to scene 1’s cast');
    expect(within(library()).getByRole('row', { name: /^Add knight to frame 1\.1/i })).toBeTruthy();
    expect(
      screen.getByText('Knight is in scene 1’s cast. Its sketch is in Sketches.'),
    ).toBeTruthy();
    // Twice is once.
    await user.click(screen.getByRole('button', { name: 'Add Knight to scene 1’s cast' }));
    expect(castOf(studio()).filter((c) => c === 'kaykit/Biped/knight')).toHaveLength(1);
  });

  it('stands one in from Can’t find it?, as one undo step', async () => {
    const user = userEvent.setup();
    const studio = storyboard();
    await user.click(screen.getByRole('button', { name: 'Cast' }));
    await user.type(screen.getByRole('textbox', { name: 'What is it?' }), 'dragon');
    await user.click(screen.getByRole('button', { name: 'Stand it in for scene 1' }));
    expect(castOf(studio()).at(-1)).toEqual({ standIn: 'dragon' });
    expect(studio().undoLabel).toBe('Add dragon to scene 1’s cast');
    expect(within(library()).getByRole('row', { name: /^Add dragon to frame 1\.1/ })).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'What is it?' }), 'Dragon{Enter}');
    expect(screen.getByRole('alert').textContent).toBe('Dragon is in scene 1’s cast already.');
  });

  it('puts a backdrop’s sketch on the current frame', async () => {
    const user = userEvent.setup();
    const studio = storyboard();
    await user.click(screen.getByRole('button', { name: 'Backdrops' }));
    await user.click(
      screen.getByRole('button', { name: 'Put Forest floor’s sketch on frame 1.1' }),
    );
    const sketches = studio().production.frames.find((f) => f.id === first.id)!.sketches;
    expect(sketches.at(-1)!.item).toBe('backdrop/trees');
  });

  it('says where importing is when the school allows it', async () => {
    const user = userEvent.setup();
    storyboard('learners');
    await user.click(screen.getByRole('button', { name: 'Cast' }));
    expect(screen.getByText(/^Or import a model of your own/)).toBeTruthy();
  });

  it('adds nothing to a film that can’t be changed', async () => {
    const user = userEvent.setup();
    const studio = storyboard();
    await act(async () => studio().open(example, 'It’s handed in.'));
    await user.click(screen.getByRole('button', { name: 'Cast' }));
    expect(screen.queryByRole('textbox', { name: 'What is it?' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add Knight to scene 1’s cast' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
