import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Dialog } from './Dialog.tsx';
import { ThemeRoot } from './ThemeRoot.tsx';

describe('ThemeRoot', () => {
  it('is dark by default (decision 0037)', () => {
    const { container } = render(<ThemeRoot>Stage</ThemeRoot>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.style.getPropertyValue('--ss-stage-0')).toBe('#13100E');
  });

  it('swaps every token value for the light theme', () => {
    const { container } = render(<ThemeRoot theme="light">Stage</ThemeRoot>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--ss-stage-0')).toBe('#F6F1E9');
    expect(root.style.getPropertyValue('--ss-amber')).toBe('#F4B740');
    expect(root.style.getPropertyValue('--ss-amber-text')).toBe('#8F5600');
  });

  it('sets the text size without changing anything else (decision 0035)', () => {
    const { container } = render(<ThemeRoot textSize={1.5}>Stage</ThemeRoot>);
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.getPropertyValue('--ss-text-size')).toBe('1.5');
  });
});

describe('a dialog inside ThemeRoot', () => {
  it('carries the theme across its portal', () => {
    render(
      <ThemeRoot theme="light">
        <Dialog isOpen onOpenChange={() => {}} title="Export film">
          <p>Settings are locked while exporting.</p>
        </Dialog>
      </ThemeRoot>,
    );
    const overlay = document.querySelector('.ss-scrim') as HTMLElement;
    expect(overlay.style.getPropertyValue('--ss-dialog')).toBe('#FFFFFF');
    expect(overlay.style.getPropertyValue('--ss-text')).toBe('#1F1A17');
  });
});
