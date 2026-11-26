import {
  exampleProduction,
  SOUND_LIMITS,
  withSceneMusic,
  withSound,
  type MusicCue,
  type Production,
  type SceneId,
} from '@storystage/production';
import { ThemeRoot } from '@storystage/ui';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { sceneSeconds } from '../storyboard/edits.ts';
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
  onGoToScene: ReturnType<typeof vi.fn>;
}

function open(
  start: Production,
  options: { readOnly?: boolean; bytes?: boolean; scene?: SceneId } = {},
): Opened {
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
  const onGoToScene = vi.fn();
  const scene = options.scene ?? start.manifest.runningOrder[0]!.scene;
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
        scene={scene}
        onGoToScene={onGoToScene}
      />
    );
  }
  render(
    <ThemeRoot>
      <Harness />
    </ThemeRoot>,
  );
  return { studio: () => studio!, sounds, player, onAnnounce, onGoToBlock, onGoToScene };
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

const timeline = () => screen.getByRole('region', { name: 'Scene 1’s music' });
const musicTrack = () => within(timeline()).getByRole('list', { name: 'Music' });
const sceneMusic = () => screen.getByRole('list', { name: 'Music in this scene' });
const rainAt = (start: number, more: Partial<MusicCue> = {}): MusicCue => ({
  sound: 'sn1',
  start,
  from: 0,
  to: 3.5,
  fadeIn: 0,
  fadeOut: 0,
  loop: false,
  volume: 1,
  carriesOn: false,
  ...more,
});
const withRain = (cues: MusicCue[], scene = 0) => {
  const p = withSound(exampleProduction(), RAIN);
  return withSceneMusic(p, p.manifest.runningOrder[scene]!.scene, cues);
};
const firstMusic = (s: Studio) =>
  s.production.scenes.find((x) => x.id === s.production.manifest.runningOrder[0]!.scene)!.music;

describe('SoundView: the timeline', () => {
  it('has a ruler from the storyboard’s plan over the three tracks', () => {
    const p = exampleProduction();
    open(p);
    const planned = sceneSeconds(p, p.manifest.runningOrder[0]!.scene);
    expect(
      within(timeline()).getByText(`About ${planned} seconds, from your storyboard.`),
    ).toBeTruthy();
    expect(musicTrack()).toBeTruthy();
    expect(within(timeline()).getAllByText('Rehearse can’t time these yet.')).toHaveLength(2);
    expect(within(timeline()).getByText('Speech')).toBeTruthy();
    expect(within(timeline()).getByText('Sound FX')).toBeTruthy();
    expect(screen.getByText('No music in this scene yet.')).toBeTruthy();
  });

  it('names each cue’s bar for when it’s heard and what it does', () => {
    open(withRain([rainAt(1, { loop: true, to: 2, fadeIn: 0.5 }), rainAt(6)]));
    const bars = within(musicTrack()).getAllByRole('button');
    expect(bars.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Rain, 1 to 6 seconds, loops, fades in, crossfades into the next',
      'Rain, 6 to 9.5 seconds',
    ]);
  });

  it('reads Missing sound for a cue whose sound the film hasn’t got', () => {
    const p = withRain([rainAt(0)]);
    open({ ...p, manifest: { ...p.manifest, sounds: [] } } as Production);
    expect(within(musicTrack()).getByRole('button').getAttribute('aria-label')).toBe(
      'Missing sound, 0 to 3.5 seconds',
    );
  });

  it('says Missing sound on a cue whose sound’s file the film hasn’t got', () => {
    open(withRain([rainAt(0)]), { bytes: false });
    expect(within(musicTrack()).getByRole('button').getAttribute('aria-label')).toBe(
      'Rain, 0 to 3.5 seconds, Missing sound',
    );
  });

  it('draws music carried on from an earlier scene, and goes there', async () => {
    const user = userEvent.setup();
    const p = withRain([rainAt(0, { carriesOn: true })]);
    const { onGoToScene } = open(p, { scene: p.manifest.runningOrder[1]!.scene });
    expect(screen.getAllByText('Rain, carried on from scene 1').length).toBeGreaterThanOrEqual(1);
    await user.click(screen.getByRole('button', { name: 'Go to scene 1' }));
    expect(onGoToScene).toHaveBeenCalledWith(p.manifest.runningOrder[0]!.scene);
  });
});

describe('SoundView: adding music', () => {
  it('adds a film sound at the playhead, as one step, and says so', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = open(withSound(exampleProduction(), RAIN));
    const time = screen.getByRole('textbox', { name: 'Time' });
    await user.tripleClick(time);
    await user.keyboard('4{Enter}');
    await user.click(screen.getByRole('button', { name: 'Add music…' }));
    const dialog = screen.getByRole('dialog', { name: 'Add music' });
    expect(within(dialog).getByText('It starts at 4 seconds, where the playhead is.')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Add Rain' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(firstMusic(studio())).toEqual([rainAt(4)]);
    expect(studio().undoLabel).toBe('Add music Rain');
    expect(onAnnounce).toHaveBeenCalledWith('Add music Rain');
    expect(within(sceneMusic()).getByRole('button').textContent).toBe('Rain, from 4 seconds');
  });

  it('refuses a second cue at the same time', async () => {
    const user = userEvent.setup();
    const { studio } = open(withRain([rainAt(0)]));
    await user.click(screen.getByRole('button', { name: 'Add music…' }));
    await user.click(screen.getByRole('button', { name: 'Add Rain' }));
    const dialog = screen.getByRole('dialog', { name: 'Add music' });
    expect(
      within(dialog).getByText('Music already starts at 0 seconds. Choose another time.'),
    ).toBeTruthy();
    expect(firstMusic(studio())).toHaveLength(1);
  });

  it('says so at the scene’s limit', async () => {
    const user = userEvent.setup();
    open(withRain(Array.from({ length: SOUND_LIMITS.cues }, (_, i) => rainAt(i))));
    await user.click(screen.getByRole('button', { name: 'Add music…' }));
    const dialog = screen.getByRole('dialog', { name: 'Add music' });
    expect(
      within(dialog).getByText('This scene has all the music it can hold. Remove a piece first.'),
    ).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Add Rain' })).toHaveProperty(
      'disabled',
      true,
    );
  });

  it('places a sound imported from Add music… in the step that adds it', async () => {
    const user = userEvent.setup();
    const { studio } = open(exampleProduction());
    await user.click(screen.getByRole('button', { name: 'Add music…' }));
    const dialog = screen.getByRole('dialog', { name: 'Add music' });
    expect(
      within(dialog).getByText('No sounds in this film yet. Import one to use it as music.'),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Import a sound…' }));
    await user.upload(fileInput(), wavFile('rain.wav'));
    await user.click(await screen.findByRole('button', { name: 'Add sound' }));
    expect(studio().production.manifest.sounds).toHaveLength(1);
    expect(firstMusic(studio())).toEqual([rainAt(0, { to: 4 })]);
    expect(studio().undoLabel).toBe('Add music rain');
    act(() => studio().undo());
    expect(studio().production.manifest.sounds).toBeUndefined();
    expect(firstMusic(studio())).toBeUndefined();
  });
});

describe('SoundView: a cue’s controls', () => {
  it('chooses a cue from Music in this scene and moves it by a number typed', async () => {
    const user = userEvent.setup();
    const { studio } = open(withRain([rainAt(1)]));
    await user.click(within(sceneMusic()).getByRole('button', { name: 'Rain, from 1 second' }));
    const controls = screen.getByRole('region', { name: 'Rain' });
    await user.tripleClick(within(controls).getByRole('textbox', { name: 'Starts at' }));
    await user.keyboard('6{Enter}');
    expect(firstMusic(studio())![0]!.start).toBe(6);
    expect(studio().undoLabel).toBe('Move Rain to 6 seconds');
  });

  it('trims, fades, loops and carries on, each one step', async () => {
    const user = userEvent.setup();
    const { studio } = open(withRain([rainAt(0)]));
    await user.click(within(musicTrack()).getByRole('button'));
    const controls = screen.getByRole('region', { name: 'Rain' });
    await user.tripleClick(within(controls).getByRole('textbox', { name: 'Play to' }));
    await user.keyboard('3{Enter}');
    expect(studio().undoLabel).toBe('Trim Rain in scene 1');
    await user.tripleClick(within(controls).getByRole('textbox', { name: 'Fade out' }));
    await user.keyboard('1{Enter}');
    expect(studio().undoLabel).toBe('Fade Rain out over 1 second');
    await user.click(within(controls).getByRole('switch', { name: 'Loop' }));
    expect(studio().undoLabel).toBe('Loop Rain');
    await user.click(
      within(controls).getByRole('switch', {
        name: 'Carry on into the next scene until other music starts',
      }),
    );
    expect(studio().undoLabel).toBe('Carry Rain on into the next scene');
    expect(firstMusic(studio())).toEqual([
      rainAt(0, { to: 3, fadeOut: 1, loop: true, carriesOn: true }),
    ]);
  });

  it('moves a cue by keys on its bar as one step, and Delete removes it', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = open(withRain([rainAt(1)]));
    within(musicTrack()).getByRole('button').focus();
    await user.keyboard('{ArrowRight}{ArrowRight}{Shift>}{ArrowRight}{/Shift}');
    expect(firstMusic(studio())![0]!.start).toBe(2.2);
    expect(studio().undoLabel).toBe('Move Rain to 2.2 seconds');
    expect(onAnnounce).toHaveBeenLastCalledWith('Move Rain to 2.2 seconds');
    await user.keyboard('{Home}');
    expect(firstMusic(studio())![0]!.start).toBe(0);
    act(() => studio().undo());
    expect(firstMusic(studio())![0]!.start).toBe(1);
    within(musicTrack()).getByRole('button').focus();
    await user.keyboard('{Delete}');
    expect(firstMusic(studio())).toBeUndefined();
    expect(studio().undoLabel).toBe('Remove music Rain');
  });

  it('moves a bar by keys past another cue’s start, focus following it, as one step', async () => {
    const user = userEvent.setup();
    const { studio } = open(withRain([rainAt(1), rainAt(1.2)]));
    within(musicTrack()).getAllByRole('button')[0]!.focus();
    await user.keyboard('{ArrowRight}{ArrowRight}');
    expect(firstMusic(studio())!.map((c) => c.start)).toEqual([1.2, 1.3]);
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/^Rain, 1\.3 to/);
    await user.keyboard('{ArrowRight}');
    expect(firstMusic(studio())!.map((c) => c.start)).toEqual([1.2, 1.4]);
    expect(studio().undoLabel).toBe('Move Rain to 1.4 seconds');
    act(() => studio().undo());
    expect(firstMusic(studio())!.map((c) => c.start)).toEqual([1, 1.2]);
  });

  it('refuses a move onto another cue’s start', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = open(withRain([rainAt(1), rainAt(5)]));
    await user.click(within(sceneMusic()).getByRole('button', { name: 'Rain, from 1 second' }));
    await user.tripleClick(screen.getByRole('textbox', { name: 'Starts at' }));
    await user.keyboard('5{Enter}');
    const why = 'Music already starts at 5 seconds. Choose another time.';
    expect(screen.getByText(why)).toBeTruthy();
    expect(onAnnounce).toHaveBeenCalledWith(why);
    expect(firstMusic(studio())!.map((c) => c.start)).toEqual([1, 5]);
  });

  it('shows a film that can’t be changed, with nothing to change it', async () => {
    const user = userEvent.setup();
    open(withRain([rainAt(1)]), { readOnly: true });
    expect(screen.queryByRole('button', { name: 'Add music…' })).toBeNull();
    await user.click(within(sceneMusic()).getByRole('button'));
    expect(screen.getByRole('textbox', { name: 'Starts at' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: 'Remove Rain from the music' })).toBeNull();
  });
});

/** A drag of `dx` px on `el`, let go or not; at 20 px a second, as Fit is with no width. */
function dragBy(el: Element, dx: number, letGo = true) {
  fireEvent.pointerDown(el, { clientX: 100, button: 0, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: 100 + dx / 2, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: 100 + dx, pointerId: 1 });
  if (letGo) fireEvent.pointerUp(el, { clientX: 100 + dx, pointerId: 1 });
}

describe('SoundView: dragging on the timeline', () => {
  it('moves a cue by dragging its bar, drawn as it goes and one step when let go', () => {
    const { studio, onAnnounce } = open(withRain([rainAt(1)]));
    const bar = within(musicTrack()).getByRole('button');
    dragBy(bar, 40, false);
    // Drawn where it's dragged; nothing written yet.
    expect(bar.getAttribute('aria-label')).toMatch(/^Rain, 3 to/);
    expect(firstMusic(studio())![0]!.start).toBe(1);
    fireEvent.pointerUp(bar, { clientX: 140, pointerId: 1 });
    expect(firstMusic(studio())![0]!.start).toBe(3);
    expect(studio().undoLabel).toBe('Move Rain to 3 seconds');
    expect(onAnnounce).toHaveBeenLastCalledWith('Move Rain to 3 seconds');
    // The bar dragged is the one chosen.
    expect(bar.getAttribute('aria-pressed')).toBe('true');
    act(() => studio().undo());
    expect(firstMusic(studio())![0]!.start).toBe(1);
  });

  it('puts a drag back with Esc', () => {
    const { studio } = open(withRain([rainAt(1)]));
    const bar = within(musicTrack()).getByRole('button');
    dragBy(bar, 40, false);
    fireEvent.keyDown(bar, { key: 'Escape' });
    expect(bar.getAttribute('aria-label')).toMatch(/^Rain, 1 to/);
    fireEvent.pointerUp(bar, { clientX: 140, pointerId: 1 });
    expect(firstMusic(studio())![0]!.start).toBe(1);
    expect(studio().undoLabel).toBeNull();
  });

  it('stops a bar dragged onto another cue’s start where it last could be', () => {
    const { studio } = open(withRain([rainAt(1), rainAt(3)]));
    const bar = within(musicTrack()).getAllByRole('button')[0]!;
    fireEvent.pointerDown(bar, { clientX: 100, button: 0, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 138, pointerId: 1 });
    fireEvent.pointerMove(bar, { clientX: 140, pointerId: 1 });
    fireEvent.pointerUp(bar, { clientX: 140, pointerId: 1 });
    expect(firstMusic(studio())!.map((c) => c.start)).toEqual([2.9, 3]);
  });

  it('a press on a bar without a drag only chooses it', async () => {
    const user = userEvent.setup();
    const { studio } = open(withRain([rainAt(1)]));
    await user.click(within(musicTrack()).getByRole('button'));
    expect(within(musicTrack()).getByRole('button').getAttribute('aria-pressed')).toBe('true');
    expect(studio().undoLabel).toBeNull();
  });

  it('trims by the chosen bar’s handles, the left one moving the start with it', async () => {
    const user = userEvent.setup();
    const { studio } = open(withRain([rainAt(1)]));
    expect(within(musicTrack()).queryByRole('slider')).toBeNull();
    await user.click(within(musicTrack()).getByRole('button'));
    dragBy(within(musicTrack()).getByRole('slider', { name: 'Play from' }), 10);
    expect(firstMusic(studio())![0]).toMatchObject({ start: 1.5, from: 0.5, to: 3.5 });
    expect(studio().undoLabel).toBe('Trim Rain in scene 1');
    dragBy(within(musicTrack()).getByRole('slider', { name: 'Play to' }), -20);
    expect(firstMusic(studio())![0]).toMatchObject({ start: 1.5, from: 0.5, to: 2.5 });
  });

  it('fades by the chosen bar’s corners', async () => {
    const user = userEvent.setup();
    const { studio } = open(withRain([rainAt(1)]));
    await user.click(within(musicTrack()).getByRole('button'));
    dragBy(within(musicTrack()).getByRole('slider', { name: 'Fade in' }), 20);
    expect(studio().undoLabel).toBe('Fade Rain in over 1 second');
    dragBy(within(musicTrack()).getByRole('slider', { name: 'Fade out' }), -30);
    expect(studio().undoLabel).toBe('Fade Rain out over 1.5 seconds');
    expect(firstMusic(studio())![0]).toMatchObject({ fadeIn: 1, fadeOut: 1.5 });
  });

  it('moves a handle by keys, saying its time, as one step', async () => {
    const user = userEvent.setup();
    const { studio, onAnnounce } = open(withRain([rainAt(1)]));
    await user.click(within(musicTrack()).getByRole('button'));
    const to = within(musicTrack()).getByRole('slider', { name: 'Play to' });
    expect(to.getAttribute('aria-valuetext')).toBe('3.5 seconds');
    to.focus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}{Shift>}{ArrowLeft}{/Shift}');
    expect(firstMusic(studio())![0]!.to).toBe(2.3);
    expect(
      within(musicTrack()).getByRole('slider', { name: 'Play to' }).getAttribute('aria-valuetext'),
    ).toBe('2.3 seconds');
    expect(onAnnounce).toHaveBeenLastCalledWith('Trim Rain in scene 1');
    act(() => studio().undo());
    expect(firstMusic(studio())![0]!.to).toBe(3.5);
  });

  it('has no handles in a film that can’t be changed, and drags nothing', async () => {
    const user = userEvent.setup();
    const { studio } = open(withRain([rainAt(1)]), { readOnly: true });
    const bar = within(musicTrack()).getByRole('button');
    await user.click(bar);
    expect(within(musicTrack()).queryByRole('slider')).toBeNull();
    dragBy(bar, 40);
    expect(firstMusic(studio())![0]!.start).toBe(1);
  });
});
