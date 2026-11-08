import type { EditorHost, ViewState } from '@storystage/editor-contract';
import { exampleProduction, type Production } from '@storystage/production';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';

// Blockly can't draw in a test DOM: a stand-in Blocks editor records what it is given. The real
// one is checked in a browser (e2e/production.e2e.ts).
const mounted: { method: string | null; host: EditorHost }[] = [];
vi.mock('@storystage/blocks', () => ({
  createBlocksEditor: () => ({
    id: 'blocks',
    displayName: 'Blocks',
    mount: (element: HTMLElement, host: EditorHost, view?: ViewState) => {
      element.textContent = 'blocks';
      mounted.push({ method: view?.method ?? null, host });
    },
    unmount: () => ({ method: null, selection: [], focus: null }),
    openMethod: () => {},
    highlight: () => {},
    focus: () => {},
    selection: () => [],
    command: () => false,
  }),
}));

beforeEach(() => {
  mounted.length = 0;
});

const openStage = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('tab', { name: /Production stage/ }));

/** The example with scene 1's heading taken away and its frames gone. */
function unplanned(): Production {
  const p = exampleProduction();
  const s1 = p.scenes[0]!.id;
  return {
    ...p,
    storyboard: {
      ...p.storyboard,
      cards: p.storyboard.cards.map((c) => (c.id === s1 ? { ...c, heading: '' } : c)),
    },
    frames: p.frames.filter((f) => f.scene !== s1),
    script: p.script.map((l) => (l.scene === s1 ? { ...l, pinnedFrame: null } : l)),
  };
}

describe('the Production stage’s Code editor (7.2, 07-ux 7.3)', () => {
  it('opens the current scene’s methods, one tab each, in the Blocks editor', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    const tabs = within(screen.getByRole('tablist', { name: 'Methods in scene 1' })).getAllByRole(
      'tab',
    );
    expect(tabs[0]!.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByText('blocks')).toBeTruthy();
    const p = exampleProduction();
    expect(mounted.at(-1)!.method).toBe(p.scenes[0]!.method);
  });

  it('follows the scene chosen in the Storyboard', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    const scenes = within(screen.getByRole('grid', { name: 'Scenes' })).getAllByRole('row');
    await user.click(scenes[1]!);
    await openStage(user);
    expect(screen.getByRole('tablist', { name: 'Methods in scene 2' })).toBeTruthy();
    await screen.findByText('blocks');
    expect(mounted.at(-1)!.method).toBe(exampleProduction().scenes[1]!.method);
  });

  it('stays closed until the scene is storyboarded, and says what is left', async () => {
    const user = userEvent.setup();
    render(<App start={unplanned()} />);
    await openStage(user);
    expect(screen.getByRole('heading', { name: 'Storyboard scene 1 first' })).toBeTruthy();
    const items = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([
      'Logline and synopsisDone',
      'A heading for scene 1To do',
      'At least one frameTo do',
    ]);
    expect(screen.queryByRole('tablist', { name: /^Methods/ })).toBeNull();
    expect(mounted).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Go to the Storyboard' }));
    expect(screen.getByRole('tab', { name: /Storyboard/, selected: true })).toBeTruthy();
  });

  it('asks for a scene when there is none', async () => {
    const user = userEvent.setup();
    render(<App />);
    await openStage(user);
    expect(screen.getByText('Add a scene in the Storyboard to start coding it.')).toBeTruthy();
  });

  it('gives the editor a host on the same history as the Storyboard', async () => {
    const user = userEvent.setup();
    render(<App start={exampleProduction()} />);
    await openStage(user);
    await screen.findByText('blocks');
    const { host } = mounted.at(-1)!;
    const node = host.program().types[0]!.methods[0]!.body[0]!.id;
    host.apply(
      [{ kind: 'setEnabled', node, enabled: false, label: 'Switch it off' }],
      'Switch it off',
      'blocks',
    );
    await user.click(screen.getByRole('tab', { name: /Storyboard/ }));
    expect(screen.getByRole('button', { name: /^Undo/ }).textContent).toBe('Undo: Switch it off');
  });
});
