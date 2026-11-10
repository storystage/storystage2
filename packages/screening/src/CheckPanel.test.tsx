import { basisFor } from '@storystage/check';
import { exampleProduction, type CheckItem, type Production } from '@storystage/production';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { CheckPanel, filmFlags } from './CheckPanel.tsx';

const flag = (id: string, words: string): CheckItem => ({
  id,
  kind: 'onScreen',
  outcome: 'flag',
  words,
});
const passed: CheckItem = { id: 'length', kind: 'length', outcome: 'passed', words: 'fine' };

/** The example with each frame's result saved: the first frame flagged, the rest passed. */
function checked(kept: string[] = []): Production {
  const p = exampleProduction();
  return {
    ...p,
    frames: p.frames.map((f, i) => ({
      ...f,
      check: {
        basis: basisFor(p, f),
        items:
          i === 0
            ? [flag('onScreen:k1', "Pip isn't on screen at the end of this frame"), passed]
            : [passed],
        kept: i === 0 ? kept : [],
      },
    })),
  };
}

describe('filmFlags', () => {
  it("lists each current flag with its frame's number, and counts the frames not checked", () => {
    const { flags, unchecked } = filmFlags(checked());
    expect(flags).toEqual([
      {
        frame: 'f1',
        frameNumber: '1.1',
        id: 'onScreen:k1',
        words: "Pip isn't on screen at the end of this frame",
        kept: false,
      },
    ]);
    expect(unchecked).toBe(0);
  });

  it('counts a frame with no result, or a stale one, as not checked', () => {
    const p = checked();
    const stale: Production = {
      ...p,
      frames: p.frames.map((f, i) => (i === 1 ? { ...f, lengthSeconds: f.lengthSeconds + 1 } : f)),
    };
    expect(filmFlags(stale).unchecked).toBe(1);
    expect(filmFlags(exampleProduction()).unchecked).toBe(exampleProduction().frames.length);
  });
});

describe('CheckPanel', () => {
  it('checks the whole film on request', async () => {
    const onCheck = vi.fn();
    render(
      <CheckPanel
        production={exampleProduction()}
        running={null}
        onCheck={onCheck}
        onKeep={vi.fn()}
      />,
    );
    expect(screen.getByText(/frames haven’t been checked/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Check the whole film' }));
    expect(onCheck).toHaveBeenCalledOnce();
  });

  it('says how far it has got while it runs, and waits for it', () => {
    render(
      <CheckPanel
        production={exampleProduction()}
        running={{ done: 2, total: 5 }}
        onCheck={vi.fn()}
        onKeep={vi.fn()}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Checking frame 2 of 5…');
    expect(screen.getByRole('button', { name: 'Check the whole film' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('lists the flags, and keeps one as the learner asks', async () => {
    const onKeep = vi.fn();
    render(<CheckPanel production={checked()} running={null} onCheck={vi.fn()} onKeep={onKeep} />);
    expect(
      screen.getByText("Frame 1.1: Pip isn't on screen at the end of this frame"),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Keep this flag on frame 1.1' }));
    expect(onKeep).toHaveBeenCalledWith('f1', 'onScreen:k1', true);
  });

  it('shows a kept flag as kept, and lets it go', async () => {
    const onKeep = vi.fn();
    render(
      <CheckPanel
        production={checked(['onScreen:k1'])}
        running={null}
        onCheck={vi.fn()}
        onKeep={onKeep}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Kept on frame 1.1. Let it go' }));
    expect(onKeep).toHaveBeenCalledWith('f1', 'onScreen:k1', false);
  });

  it('says so when every frame matches', () => {
    const p = checked();
    const allGood: Production = {
      ...p,
      frames: p.frames.map((f) => ({ ...f, check: { ...f.check!, items: [passed] } })),
    };
    render(<CheckPanel production={allGood} running={null} onCheck={vi.fn()} onKeep={vi.fn()} />);
    expect(screen.getByText('Every frame matches its storyboard.')).toBeTruthy();
  });

  it("can't keep flags on a read-only film", () => {
    render(
      <CheckPanel
        production={checked()}
        running={null}
        onCheck={vi.fn()}
        onKeep={vi.fn()}
        readOnly
      />,
    );
    expect(screen.queryByRole('button', { name: /Keep this flag/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Check the whole film' })).toHaveProperty(
      'disabled',
      true,
    );
  });
});
