import {
  exampleProduction,
  withSceneMusic,
  withSound,
  type Production,
} from '@storystage/production';
import { ThemeRoot } from '@storystage/ui';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { useStudio, type Studio } from '../studio.ts';
import { FilmSounds } from './filmSounds.ts';
import type { SoundPlayer } from './player.ts';
import type { SoundReading } from './readSound.ts';
import { SoundView } from './SoundView.tsx';
import { playedInScene2, RAIN } from './testing.ts';

// Sounds in this film, importing and removing (07-ux 7.7).

/** A file with a WAV's first bytes, which is all `importSound` reads its type from. */
const wavFile = (name: string) =>
  new File(
    [
      new Uint8Array(
        [...'RIFF', 0, 0, 0, 0, ...'WAVE'].map((c) =>
          typeof c === 'string' ? c.charCodeAt(0) : c,
        ),
      ),
    ],
    name,
    {
      type: 'audio/wav',
    },
  );

const READING: SoundReading = {
  lengthOf: async () => 4,
  decode: async () => ({ duration: 4, samples: new Float32Array([0.5, -0.5]) }),
};

interface Opened {
  studio: () => Studio;
  sounds: FilmSounds;
  player: SoundPlayer;
  onAnnounce: ReturnType<typeof vi.fn>;
  onGoToBlock: ReturnType<typeof vi.fn>;
}

function open(start: Production, options: { readOnly?: boolean; bytes?: boolean } = {}): Opened {
  const sounds = new FilmSounds();
  sounds.reset(
    options.bytes === false
      ? undefined
      : new Map(
          (start.manifest.sounds ?? []).map((c) => [`sounds/${c.file}`, new Uint8Array([7])]),
        ),
    start,
  );
  const player: SoundPlayer = { play: vi.fn(), stop: vi.fn() };
  const onAnnounce = vi.fn();
  const onGoToBlock = vi.fn();
  let studio: Studio | null = null;
  function Harness() {
    const s = useStudio(start);
    studio = s;
    return (
      <SoundView
        studio={s}
        readOnly={options.readOnly ?? false}
        sounds={sounds}
        player={player}
        reading={READING}
        onAnnounce={onAnnounce}
        onGoToBlock={onGoToBlock}
      />
    );
  }
  render(
    <ThemeRoot>
      <Harness />
    </ThemeRoot>,
  );
  return { studio: () => studio!, sounds, player, onAnnounce, onGoToBlock };
}

const list = () => screen.getByRole('list', { name: 'Sounds in this film' });
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!;

describe('SoundView: sounds in this film', () => {
  it("lists each sound with the length it plays, and the film's room", () => {
    open(withSound(exampleProduction(), RAIN));
    const row = within(list()).getByRole('listitem');
    expect(row.textContent).toContain('Rain');
    expect(row.textContent).toContain('3.5 seconds');
    expect(screen.getByText('1.5 MB of the film’s 150 MB used')).toBeTruthy();
  });

  it('says when there are none', () => {
    open(exampleProduction());
    expect(screen.getByText('No sounds in this film yet.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Import a sound…' })).toBeTruthy();
  });

  it('plays the part kept, and stops', async () => {
    const user = userEvent.setup();
    const { player } = open(withSound(exampleProduction(), RAIN));
    await user.click(screen.getByRole('button', { name: 'Play Rain' }));
    expect(player.play).toHaveBeenCalledWith(
      new Uint8Array([7]),
      'wav',
      2,
      5.5,
      expect.any(Function),
    );
    await user.click(screen.getByRole('button', { name: 'Stop Rain' }));
    expect(player.stop).toHaveBeenCalled();
  });

  it("reads Missing sound for one the film hasn't got", () => {
    open(withSound(exampleProduction(), RAIN), { bytes: false });
    expect(within(list()).getByText('Missing sound')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play Rain' })).toBeNull();
  });

  it('changes nothing in a film that can’t be changed', () => {
    open(withSound(exampleProduction(), RAIN), { readOnly: true });
    expect(screen.getByRole('button', { name: 'Play Rain' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Import a sound…' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove Rain…' })).toBeNull();
  });
});

describe('SoundView: importing', () => {
  it('trims a picked file, then adds it as one undo step with its bytes kept', async () => {
    const user = userEvent.setup();
    const { studio, sounds, onAnnounce } = open(exampleProduction());
    await user.upload(fileInput(), wavFile('rain.wav'));
    const dialog = await screen.findByRole('dialog', { name: 'Trim your sound' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveProperty('value', 'rain');
    within(dialog).getByRole('slider', { name: 'Start' }).focus();
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    await user.click(within(dialog).getByRole('button', { name: 'Add sound' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    const added = studio().production.manifest.sounds?.[0];
    expect(added).toMatchObject({
      id: 'sn1',
      file: 'sn1.wav',
      label: 'rain',
      length: 4,
      trim: { start: 1, end: 4 },
    });
    expect(sounds.bytes(added!)?.length).toBe(12);
    expect(studio().undoLabel).toBe('Add sound rain');
    expect(onAnnounce).toHaveBeenCalledWith('rain added to the film’s sounds.');
    expect(within(list()).getByRole('listitem').textContent).toContain('3 seconds');
  });

  it('gives a name the film has a number', async () => {
    const user = userEvent.setup();
    open(withSound(exampleProduction(), RAIN));
    await user.upload(fileInput(), wavFile('Rain.wav'));
    const dialog = await screen.findByRole('dialog', { name: 'Trim your sound' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveProperty('value', 'Rain 2');
  });

  it('names a file with no name by the id it is given, not one it was going to have', async () => {
    const user = userEvent.setup();
    const { sounds } = open(exampleProduction());
    // An earlier sn1, undone: its bytes are kept for Redo, so the next import is sn2.
    sounds.add(RAIN, new Uint8Array([7]));
    await user.upload(fileInput(), wavFile('.wav'));
    const dialog = await screen.findByRole('dialog', { name: 'Trim your sound' });
    expect(within(dialog).getByRole('textbox', { name: 'Name' })).toHaveProperty('value', 'sn2');
  });

  it('stops a sound playing in the list when the trim dialog opens', async () => {
    const user = userEvent.setup();
    const { player } = open(withSound(exampleProduction(), RAIN));
    await user.click(screen.getByRole('button', { name: 'Play Rain' }));
    await user.upload(fileInput(), wavFile('wind.wav'));
    await screen.findByRole('dialog', { name: 'Trim your sound' });
    expect(player.stop).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Play Rain' })).toBeTruthy();
  });

  it('adds nothing when the trim is cancelled', async () => {
    const user = userEvent.setup();
    const { studio } = open(exampleProduction());
    await user.upload(fileInput(), wavFile('rain.wav'));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(studio().production.manifest.sounds).toBeUndefined();
    expect(studio().undoLabel).toBeNull();
  });

  it('shows a refusal beside the button, and says it', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const { onAnnounce } = open(exampleProduction());
    await user.upload(fileInput(), new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const refusal = "That file isn't an MP3, WAV or M4A sound.";
    expect(await screen.findByText(refusal)).toBeTruthy();
    expect(onAnnounce).toHaveBeenCalledWith(refusal);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('refuses a file over 25 MB before reading it', async () => {
    const user = userEvent.setup();
    open(exampleProduction());
    const big = wavFile('storm.wav');
    const read = vi.spyOn(big, 'arrayBuffer');
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    await user.upload(fileInput(), big);
    expect(
      await screen.findByText('That sound file is over 25 MB. Choose a smaller one.'),
    ).toBeTruthy();
    expect(read).not.toHaveBeenCalled();
  });
});

describe('SoundView: removing', () => {
  it('removes one used nowhere at once, as one step', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = open(withSound(exampleProduction(), RAIN));
    await user.click(screen.getByRole('button', { name: 'Remove Rain…' }));
    expect(studio().production.manifest.sounds).toBeUndefined();
    expect(studio().undoLabel).toBe('Remove sound Rain');
    expect(onAnnounce).toHaveBeenCalledWith('Rain removed.');
    act(() => studio().undo());
    expect(studio().production.manifest.sounds).toHaveLength(1);
  });

  it('refuses one the code plays, and goes to the block', async () => {
    const user = userEvent.setup();
    const { studio, onGoToBlock, onAnnounce } = open(
      playedInScene2(withSound(exampleProduction(), RAIN), 'sn1'),
    );
    await user.click(screen.getByRole('button', { name: 'Remove Rain…' }));
    const why = 'Rain is played in scene 2’s code. Change that block first.';
    expect(screen.getByText(why)).toBeTruthy();
    expect(onAnnounce).toHaveBeenCalledWith(why);
    expect(studio().production.manifest.sounds).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Go to the block' }));
    expect(onGoToBlock).toHaveBeenCalledWith('s2', 'playt');
  });

  it('asks first for one in the music, with its scenes', async () => {
    const user = userEvent.setup();
    const cue = {
      sound: 'sn1',
      start: 0,
      from: 0,
      to: 3.5,
      fadeIn: 0,
      fadeOut: 0,
      loop: false,
      volume: 1,
      carriesOn: false,
    };
    let p = withSound(exampleProduction(), RAIN);
    p = withSceneMusic(withSceneMusic(p, p.scenes[0]!.id, [cue]), p.scenes[2]!.id, [cue]);
    const { studio } = open(p);
    await user.click(screen.getByRole('button', { name: 'Remove Rain…' }));
    const ask = screen.getByRole('dialog', { name: 'Remove Rain?' });
    expect(within(ask).getByText('It also comes out of the music in scenes 1 and 3.')).toBeTruthy();
    await user.click(within(ask).getByRole('button', { name: 'Cancel' }));
    expect(studio().production.manifest.sounds).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Remove Rain…' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }));
    expect(studio().production.manifest.sounds).toBeUndefined();
    expect(studio().production.scenes.every((s) => s.music === undefined)).toBe(true);
    expect(studio().undoLabel).toBe('Remove sound Rain');
  });
});
