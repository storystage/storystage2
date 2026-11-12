import { exampleProduction } from '@storystage/production';
import type { AudioOut } from '@storystage/speech';
import { ThemeRoot } from '@storystage/ui';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useStudio, type Studio } from '../studio.ts';
import { accentSetting } from './accentSetting.ts';
import { VoicesCard } from './VoicesCard.tsx';
import { Voices, type VoiceFiles } from './voices.ts';

// Settings › Voices (spec 06 section 4.3), on a fake engine.

afterEach(() => window.localStorage.clear());

function card(files: VoiceFiles | null = null) {
  const said: string[] = [];
  const engine = {
    sampleRate: 24_000,
    speak: vi.fn(async (text: string) => {
      said.push(text);
      return new Float32Array(240);
    }),
    dispose: vi.fn(),
  };
  const out: AudioOut = { play: () => {}, stop: () => {} };
  const voices = new Voices({
    engine: () => engine,
    out: () => out,
    settle: 0,
    files,
    accent: accentSetting.get,
  });
  let latest: Studio | null = null;
  function View() {
    const studio = useStudio(exampleProduction());
    latest = studio;
    const [, redraw] = useState(0);
    useEffect(() => {
      voices.update(studio.production);
      redraw((n) => n + 1);
    }, [studio.production]);
    return (
      <ThemeRoot>
        <VoicesCard studio={studio} voices={voices} />
      </ThemeRoot>
    );
  }
  render(<View />);
  return { said, voices, studio: () => latest! };
}

describe('Settings › Voices', () => {
  it('lists each character’s voice, and a new preset is one undo step kept in the film', async () => {
    const user = userEvent.setup();
    const { studio } = card();
    const list = screen.getByRole('list', { name: 'Each character’s voice' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.querySelector('.vo-name')?.textContent),
    ).toEqual(['penguin', 'fox']);
    await user.click(screen.getByRole('button', { name: /Voice for penguin/ }));
    await user.click(screen.getByRole('option', { name: 'Girl' }));
    expect(studio().undoLabel).toBe('Give penguin the Girl voice');
    expect(studio().production.manifest.voices?.penguin?.preset).toBe('girl');
    expect(studio().production.manifest.voices?.fox).toBeTruthy();
  });

  it('plays a sample in the character’s voice', async () => {
    const user = userEvent.setup();
    const { said } = card();
    await user.click(screen.getByRole('button', { name: 'Hear it: fox' }));
    await waitFor(() => expect(said).toEqual(['Hello, I’m fox.']));
  });

  it('sets the accent on this device, and can change the open film’s too', async () => {
    const user = userEvent.setup();
    const { studio } = card();
    await user.click(screen.getByRole('radio', { name: 'American English' }));
    expect(accentSetting.get()).toBe('american');
    // A film with no voices of its own takes the device's accent at once.
    expect(screen.queryByRole('button', { name: /Change this film’s voices/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Voice for penguin/ }));
    await user.click(screen.getByRole('option', { name: 'Woman' }));
    expect(studio().production.manifest.voices?.penguin?.accent).toBe('american');
    // Back to British on the device: the film keeps its American voices until asked.
    await user.click(screen.getByRole('radio', { name: 'British English' }));
    await user.click(
      screen.getByRole('button', { name: 'Change this film’s voices to British English' }),
    );
    expect(studio().undoLabel).toBe('Change the voices to British English');
    const kept = Object.values(studio().production.manifest.voices ?? {});
    expect(kept.every((v) => v.accent === 'british')).toBe(true);
  });

  it('offers the browser version’s download, with its size', async () => {
    const user = userEvent.setup();
    const download = vi.fn(async () => {});
    card({ toDownload: async () => 121_000_000, download });
    // This film has no speak line yet, so nothing has asked; Hear it needs the voices, so it does.
    expect(screen.queryByRole('button', { name: 'Download the voices' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Hear it: fox' }));
    expect(await screen.findByText(/a 121 MB download, once/)).toBeTruthy();
    expect(download).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Download the voices' }));
    expect(download).toHaveBeenCalledOnce();
  });
});
