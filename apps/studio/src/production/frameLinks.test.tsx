import { indexProgram, nodeId, type NodeId } from '@storystage/ast';
import type { EditorHost, HighlightKind, HighlightMark } from '@storystage/editor-contract';
import { exampleProduction, type Production } from '@storystage/production';
import { ThemeRoot } from '@storystage/ui';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useStudio, type Studio } from '../studio.ts';
import { ProductionStage } from './ProductionStage.tsx';

// A frame's links over the Code editor (WP10.8; M4 gate section 3): the heading, the marks on the
// blocks, and Link or Unlink for the block chosen in the code, each one undo step.

const editor = vi.hoisted(() => ({
  selected: [] as string[],
  marks: new Map<string, readonly { node: string }[]>(),
}));

vi.mock('@storystage/blocks', () => ({
  createBlocksEditor: () => ({
    id: 'blocks',
    displayName: 'Blocks',
    mount: (element: HTMLElement) => void (element.textContent = 'blocks'),
    unmount: () => ({ method: null, selection: [], focus: null }),
    openMethod: () => {},
    setPalette: () => {},
    highlight: (marks: readonly HighlightMark[], kind: HighlightKind) =>
      void editor.marks.set(kind, marks),
    focus: () => {},
    selection: () => editor.selected,
    command: () => false,
  }),
}));

const host = { program: () => exampleProduction().program } as unknown as EditorHost;

function stage(production: Production) {
  const onAnnounce = vi.fn<(text: string) => void>();
  let latest: Studio | null = null;
  function View() {
    const studio = useStudio(production);
    latest = studio;
    const p = studio.production;
    return (
      <ThemeRoot>
        <ProductionStage
          production={p}
          scene={p.scenes[0]!.id}
          frame={p.frames.find((f) => f.scene === p.scenes[0]!.id)!.id}
          host={host}
          onGoToStoryboard={() => {}}
          announcement=""
          onPlaceChange={() => {}}
          studio={studio}
          onAnnounce={onAnnounce}
        />
      </ThemeRoot>
    );
  }
  render(<View />);
  return { onAnnounce, studio: () => latest! };
}

const example = exampleProduction();
const first = example.frames.find((f) => f.scene === example.scenes[0]!.id)!;
const block = first.links[0]!;
const withLinks = (links: NodeId[]): Production => ({
  ...example,
  frames: example.frames.map((f) => (f.id === first.id ? { ...f, links } : f)),
});
const links = () => screen.getByRole('region', { name: 'When frame 1.1 starts' });
const linkMarks = () => editor.marks.get('link')?.map((m) => m.node) ?? [];
const linksOf = (studio: Studio) => studio.production.frames.find((f) => f.id === first.id)!.links;
/** Chooses a block in the code: the editor's selection, then the click that set it. */
async function choose(node: string | null) {
  editor.selected = node ? [node] : [];
  fireEvent.pointerUp(document.querySelector('.pr-workspace')!);
  await act(() => new Promise((r) => setTimeout(r, 0)));
}

beforeEach(() => {
  editor.selected = [];
  editor.marks.clear();
});

describe('frames linked to blocks (WP10.8)', () => {
  it('heads the code with the frame and marks the blocks that play it', async () => {
    stage(example);
    expect(
      within(links()).getByText('One block plays this frame. It’s marked in the code.'),
    ).toBeTruthy();
    await waitFor(() => expect(linkMarks()).toEqual([block]), { timeout: 5_000 });
  });

  it('unlinks the chosen block and links it again, each one undo step', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = stage(example);
    await choose(block);
    await user.click(within(links()).getByRole('button', { name: 'Unlink from frame 1.1' }));
    expect(linksOf(studio())).toEqual([]);
    expect(studio().undoLabel).toBe('Unlink a block from frame 1.1');
    expect(onAnnounce).toHaveBeenLastCalledWith('Unlinked from frame 1.1.');
    expect(within(links()).getByText(/^No blocks are linked to this frame yet/)).toBeTruthy();
    await waitFor(() => expect(linkMarks()).toEqual([]));
    // The strip no longer counts it as Coded.
    expect(screen.queryByRole('option', { name: /^Frame 1\.1 Coded/ })).toBeNull();

    await user.click(within(links()).getByRole('button', { name: 'Link to frame 1.1' }));
    expect(linksOf(studio())).toEqual([block]);
    expect(studio().undoLabel).toBe('Link a block to frame 1.1');
    act(() => studio().undo());
    expect(linksOf(studio())).toEqual([]);
  });

  it('links the block a chosen value sits in', async () => {
    const user = userEvent.setup();
    const { studio } = stage(withLinks([]));
    const inside = [...indexProgram(example.program)].find(([, at]) => at.parent === block)![0];
    await choose(inside);
    await user.click(within(links()).getByRole('button', { name: 'Link to frame 1.1' }));
    expect(linksOf(studio())).toEqual([block]);
  });

  it('keeps the chosen block as focus leaves the code, and lets go on a click in its space', async () => {
    stage(example);
    await choose(block);
    const button = () => within(links()).getByRole('button', { name: /frame 1\.1$/ });
    expect(button().textContent).toContain('Unlink from frame 1.1');
    // Shift+Tab out through the palette: the editor lets go of its selection, the choice stays.
    editor.selected = [];
    fireEvent.keyUp(document.querySelector('.pr-workspace')!, { key: 'Tab' });
    await act(() => new Promise((r) => setTimeout(r, 0)));
    expect(button().textContent).toContain('Unlink from frame 1.1');
    // A click on the code's empty space chooses nothing.
    await choose(null);
    expect(button().textContent).toContain('Link to frame 1.1');
  });

  it('says to choose a block first when none is chosen', async () => {
    const user = userEvent.setup();
    const { studio } = stage(withLinks([]));
    await user.click(within(links()).getByRole('button', { name: 'Link to frame 1.1' }));
    expect(within(links()).getByText('Choose a block in the code first, then Link.')).toBeTruthy();
    expect(linksOf(studio())).toEqual([]);
  });

  it('shows a frame whose blocks have gone as not linked, with no error', () => {
    stage(withLinks([nodeId('gone')]));
    expect(within(links()).getByText(/^This frame isn’t linked: the blocks/)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('offers no Link on a film that can’t be changed', async () => {
    const { studio } = stage(example);
    await act(async () => studio().open(example, 'It’s handed in.'));
    expect(within(links()).queryByRole('button')).toBeNull();
  });
});
