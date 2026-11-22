import { exampleProduction, type Production } from '@storystage/production';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from '../App.tsx';
import { newProduction, setLogline, setSynopsis } from './edits.ts';

const ready = (): Production =>
  setSynopsis(setLogline(newProduction(), 'A shy owl finds a key.'), 'The owl searches.');

const addButton = () => screen.getByRole('button', { name: 'Add a scene' });
const cards = () =>
  within(screen.getByRole('grid', { name: 'Scenes' }))
    .getAllByRole('row')
    .map((r) => r.querySelector('.sb-scene-title')!.textContent);
const sceneRows = () => within(screen.getByRole('grid', { name: 'Scenes' })).getAllByRole('row');
const undo = () => screen.getByRole('button', { name: /^Undo/ });

describe('Add a scene (10.1, 10.3)', () => {
  it('waits for the logline and synopsis, and says why', async () => {
    const user = userEvent.setup();
    render(<App start={newProduction()} />);
    expect(addButton().hasAttribute('data-disabled')).toBe(true);
    expect(screen.getByText('Write a logline and a synopsis first.')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: 'Logline' }), 'A logline.');
    await user.type(screen.getByRole('textbox', { name: 'Synopsis' }), 'A synopsis.');
    expect(addButton().hasAttribute('data-disabled')).toBe(false);
    expect(screen.queryByText('Write a logline and a synopsis first.')).toBeNull();
  });

  it('adds a scene, chooses it, and is one undo step', async () => {
    const user = userEvent.setup();
    render(<App start={ready()} />);
    await user.click(addButton());
    expect(cards()).toEqual(['1 · No heading yet']);
    expect(screen.getByRole('heading', { name: 'Scene 1' })).toBeTruthy();
    expect(screen.getByText('1 scene · 0 s')).toBeTruthy();
    expect(undo().textContent).toBe('Undo: Add scene 1');
    await user.click(undo());
    expect(screen.queryByRole('grid', { name: 'Scenes' })).toBeNull();
  });
});

describe('a scene’s card (10.3)', () => {
  it('shows each scene in running order with its heading, part and frames', () => {
    render(<App start={exampleProduction()} />);
    expect(cards()).toEqual([
      '1 · Ice shelf, morning',
      '2 · Forest, night',
      '3 · Ice shelf, evening',
    ]);
    const first = sceneRows()[0]!;
    expect(first.textContent).toContain('Beginning');
    expect(first.textContent).toContain('1.1');
  });

  it('sets the heading, as one step for the typing', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const heading = screen.getByRole('textbox', { name: 'Heading' });
    await user.clear(heading);
    await user.type(heading, 'Glacier, dawn');
    await user.tab();
    expect(cards()[0]).toBe('1 · Glacier, dawn');
    expect(undo().textContent).toBe('Undo: Write scene 1’s heading');
    await user.click(undo());
    expect(cards()[0]).toBe('1 · Ice shelf, morning');
  });

  it('puts a scene in a part of the arc, or none', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('radio', { name: 'Middle' }));
    expect(sceneRows()[0]!.textContent).toContain('Middle');
    expect(undo().textContent).toBe('Undo: Put scene 1 in Middle');
    await user.click(screen.getByRole('radio', { name: 'None' }));
    expect(undo().textContent).toBe('Undo: Take scene 1 out of the arc');
  });

  it('sets how a scene ends, and says the last scene just ends', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('radio', { name: 'Crossfade' }));
    expect(undo().textContent).toBe('Undo: End scene 1 with crossfade');
    expect(screen.queryByText('The last scene just ends.')).toBeNull();
    await user.click(sceneRows()[2]!);
    expect(screen.getByText('The last scene just ends.')).toBeTruthy();
  });

  it('shows the cast, and the hint about frames', () => {
    render(<App start={exampleProduction()} />);
    // On the scene's card, as well as in the sketch library.
    const library = screen.getByRole('complementary', { name: 'Sketches' });
    expect(screen.getAllByText('penguin').some((el) => !library.contains(el))).toBe(true);
    expect(screen.getByText('Most scenes need 3 to 9 frames.')).toBeTruthy();
  });

  it('chooses a scene by its card', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(sceneRows()[1]!);
    expect(screen.getByRole('heading', { name: 'Scene 2' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'Heading' }) as HTMLInputElement).value).toBe(
      'Forest, night',
    );
  });

  it('gives each card a move handle named for its scene', () => {
    render(<App start={exampleProduction()} />);
    expect(screen.getByRole('button', { name: 'Move scene 2' })).toBeTruthy();
  });
});

describe('Delete scene (10.3)', () => {
  it('asks first, then deletes the scene as one undo step', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(sceneRows()[1]!);
    await user.click(screen.getByRole('button', { name: 'Delete scene' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete scene 2?' });
    expect(dialog.textContent).toContain('You can undo this.');
    await user.click(within(dialog).getByRole('button', { name: 'Delete scene' }));
    expect(cards()).toEqual(['1 · Ice shelf, morning', '2 · Ice shelf, evening']);
    expect(screen.getByRole('heading', { name: 'Scene 1' })).toBeTruthy();
    await user.click(undo());
    expect(cards()).toHaveLength(3);
  });

  it('keeps the scene when the learner keeps it', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await user.click(screen.getByRole('button', { name: 'Delete scene' }));
    await user.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(cards()).toHaveLength(3);
  });

  it('says why, in plain words, when other code still uses the scene', async () => {
    const user = userEvent.setup();
    const p = exampleProduction();
    const types = p.program.types.map((t) =>
      t.name === 'Scene1'
        ? {
            ...t,
            fields: [
              ...t.fields,
              {
                id: 'scene1z' as never,
                kind: 'field' as const,
                name: 'next',
                type: { kind: 'user' as const, type: 'scene2t' as never },
                initial: null,
              },
            ],
          }
        : t,
    );
    render(<App start={{ ...p, program: { ...p.program, types } }} />);
    await user.click(sceneRows()[1]!);
    await user.click(screen.getByRole('button', { name: 'Delete scene' }));
    await user.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete scene' }),
    );
    expect(within(screen.getByRole('dialog')).getByRole('note').textContent).toContain(
      'is still used in your code',
    );
    expect(cards()).toHaveLength(3);
  });
});
