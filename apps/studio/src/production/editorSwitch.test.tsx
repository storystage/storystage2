import type { NodeId } from '@storystage/ast';
import type { EditorHost, ViewState } from '@storystage/editor-contract';
import { BROWSER_POLICY, browserHost, type HostInterface } from '@storystage/host';
import { exampleProduction } from '@storystage/production';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App.tsx';
import { editorSetting } from './editorSetting.ts';

// `14-editors.md` section 4 (WP7.11): the Blocks | Tiles switch. Blockly can't draw in a test
// DOM, so a stand-in Blocks editor records what it is given and hands back where the learner
// was; Tiles is the real one. Both are checked in a browser in e2e/switch.e2e.ts.
const blocks: { mounted: ViewState[]; leaving: ViewState | null; focused: (NodeId | undefined)[] } =
  { mounted: [], leaving: null, focused: [] };
vi.mock('@storystage/blocks', () => ({
  createBlocksEditor: () => {
    let view: ViewState = { method: null, selection: [], focus: null };
    return {
      id: 'blocks',
      displayName: 'Blocks',
      mount: (element: HTMLElement, _host: EditorHost, given?: ViewState) => {
        element.textContent = 'blocks';
        view = given ?? view;
        blocks.mounted.push(view);
      },
      unmount: () => blocks.leaving ?? view,
      openMethod: () => {},
      setPalette: () => {},
      highlight: () => {},
      focus: (node?: NodeId) => blocks.focused.push(node),
      selection: () => view.selection,
      command: () => false,
    };
  },
}));

beforeEach(() => {
  blocks.mounted.length = 0;
  blocks.focused.length = 0;
  blocks.leaving = null;
  window.localStorage.clear();
  editorSetting.reset();
});

const LOADED = { timeout: 5000 };

function hostWith(editor: { default: 'blocks' | 'tiles'; locked: boolean }): HostInterface {
  return { ...browserHost, policy: { ...BROWSER_POLICY, editor } };
}

async function openCode(host?: HostInterface) {
  const user = userEvent.setup();
  render(<App start={exampleProduction()} {...(host ? { host } : {})} />);
  await user.click(screen.getByRole('tab', { name: /Production stage/ }));
  return user;
}

const switchGroup = () => screen.getByRole('radiogroup', { name: 'Code editor' });
const option = (name: 'Blocks' | 'Tiles') => within(switchGroup()).getByRole('radio', { name });
const tilesTree = () => screen.findByRole('tree', {}, LOADED);
const code = () => screen.getByRole('region', { name: /^Code for scene 1/ });

describe('the Blocks | Tiles switch (14-editors section 4)', () => {
  it('opens Blocks with no policy and no choice, says both edit the same code', async () => {
    await openCode();
    expect(await screen.findByText('blocks', {}, LOADED)).toBeTruthy();
    expect((option('Blocks') as HTMLInputElement).checked).toBe(true);
    expect(code().getAttribute('aria-label')).toBe('Code for scene 1, in Blocks');
    expect(screen.getByText('Blocks and Tiles edit the same code.')).toBeTruthy();
  });

  it('explains the first switch, and Stay changes nothing', async () => {
    const user = await openCode();
    await screen.findByText('blocks', {}, LOADED);
    await user.click(option('Tiles'));
    const dialog = await screen.findByRole('dialog', { name: '⇄ Switching to Tiles' });
    expect(within(dialog).getByText(/Your program is kept\./)).toBeTruthy();
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Show me Tiles' })).toBe(
        document.activeElement,
      ),
    );
    // The same first steps, in each editor's look.
    const sides = within(dialog).getAllByRole('region');
    expect(sides.map((s) => s.getAttribute('aria-label'))).toEqual(['Blocks', 'Tiles']);
    const steps = (side: HTMLElement) =>
      within(side)
        .queryAllByRole('listitem')
        .map((li) => li.textContent);
    expect(steps(sides[0]!)).toEqual(steps(sides[1]!));
    await user.click(within(dialog).getByRole('button', { name: 'Stay with Blocks' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect((option('Blocks') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('tree')).toBeNull();
  });

  it('shows Tiles over the same program, says so, and hands over where the learner was', async () => {
    const user = await openCode();
    await screen.findByText('blocks', {}, LOADED);
    const method = blocks.mounted[0]!.method!;
    const first = exampleProduction()
      .program.types.flatMap((t) => t.methods)
      .find((m) => m.id === method)!.body[0]!.id;
    blocks.leaving = { method, selection: [first], focus: first };
    await user.click(option('Tiles'));
    await user.click(await screen.findByRole('button', { name: 'Show me Tiles' }));
    await tilesTree();
    expect(code().getAttribute('aria-label')).toBe('Code for scene 1, in Tiles');
    expect(screen.getByText('Now showing Tiles. Your program is the same.')).toBeTruthy();
    await waitFor(() =>
      expect((document.activeElement as HTMLElement | null)?.dataset['key']).toBe(first),
    );
    // Tiles under the studio's bar: no tabs or picker of its own.
    expect(within(code()).getAllByRole('tablist')).toHaveLength(1);
  });

  it('asks once with “Don’t explain this again”, and keeps the choice on this device', async () => {
    const user = await openCode();
    await screen.findByText('blocks', {}, LOADED);
    await user.click(option('Tiles'));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('checkbox', { name: 'Don’t explain this again' }));
    await user.click(within(dialog).getByRole('button', { name: 'Show me Tiles' }));
    await tilesTree();
    await user.click(option('Blocks'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('blocks', {}, LOADED)).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem('storystage.codeEditor')!)).toEqual({
      chosen: 'blocks',
      explained: true,
    });
  });

  it('undoes in Blocks a step made in Tiles: one history (4.2)', async () => {
    const user = await openCode();
    await screen.findByText('blocks', {}, LOADED);
    await user.click(option('Tiles'));
    await user.click(await screen.findByRole('button', { name: 'Show me Tiles' }));
    const tree = await tilesTree();
    const rows = () => within(tree).getAllByRole('treeitem').length;
    const before = rows();
    within(tree).getAllByRole('treeitem')[0]!.focus();
    await user.keyboard('{Control>}d{/Control}');
    expect(rows()).toBe(before + 1);
    await user.click(option('Blocks'));
    await user.click(await screen.findByRole('button', { name: 'Show me Blocks' }));
    await screen.findByText('blocks', {}, LOADED);
    await user.click(screen.getByRole('button', { name: /^Undo/ }));
    await user.click(option('Tiles'));
    await user.click(await screen.findByRole('button', { name: 'Show me Tiles' }));
    expect(within(await tilesTree()).getAllByRole('treeitem')).toHaveLength(before);
  });

  it('opens the class default before any choice', async () => {
    await openCode(hostWith({ default: 'tiles', locked: false }));
    await tilesTree();
    expect((option('Tiles') as HTMLInputElement).checked).toBe(true);
  });

  it('keeps the default when the teacher locks it, and says so in neutral words', async () => {
    editorSetting.set({ chosen: 'blocks', explained: true });
    await openCode(hostWith({ default: 'tiles', locked: true }));
    await tilesTree();
    expect((option('Blocks') as HTMLInputElement).disabled).toBe(true);
    expect(within(code()).getByRole('note').textContent).toBe('Set to Tiles by your school');
    expect(screen.queryByText('Blocks and Tiles edit the same code.')).toBeNull();
    await act(async () => {});
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
