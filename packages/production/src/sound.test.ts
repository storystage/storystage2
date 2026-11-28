import { describe, expect, it } from 'vitest';
import { readArchive, writeArchive } from './archive.ts';
import { exampleProduction } from './example.ts';
import { openProduction, saveProduction } from './file.ts';
import { ProductionSession } from './session.ts';
import {
  importSound,
  licensedSound,
  mixOf,
  SOUND_LICENCE_PROBLEMS,
  SOUND_LIMITS,
  SOUND_MIX_DEFAULT,
  SOUND_REFUSALS,
  soundTypeOf,
  withMix,
  withoutSound,
  withSceneMusic,
  withSound,
  withSoundLicence,
} from './sound.ts';
import { checkReferences, type MusicCue, type Production, type SoundClip } from './types.ts';

// Format 1.9.0: sound in a film (decision 0076, the owner's choices of 21 Nov 2026).

const p = exampleProduction();
const scene = p.scenes[0]!.id;
const bytesOf = (...parts: (string | number[])[]) =>
  new Uint8Array(
    parts.flatMap((part) =>
      typeof part === 'string' ? [...part].map((c) => c.charCodeAt(0)) : part,
    ),
  );
const wav = bytesOf('RIFF', [0, 0, 0, 0], 'WAVE', 'fmt ', [16, 0, 0, 0]);
const mp3Id3 = bytesOf('ID3', [4, 0, 0, 0, 0, 0, 0]);
const mp3Frame = bytesOf([0xff, 0xfb, 0x90, 0x44, 0, 0]);
const m4a = bytesOf([0, 0, 0, 0x20], 'ftyp', 'M4A ', [0, 0, 0, 0]);

const clip: SoundClip = {
  id: 'sn1',
  file: 'sn1.wav',
  label: 'Birdsong',
  length: 12,
  bytes: wav.length,
  trim: { start: 2, end: 10 },
  licence: 'not-sure' as const,
  credit: 'A sound, source not checked',
};
const cue = (over: Partial<MusicCue> = {}): MusicCue => ({
  sound: 'sn1',
  start: 0,
  from: 0,
  to: 8,
  fadeIn: 1,
  fadeOut: 1,
  loop: false,
  volume: 0.8,
  carriesOn: false,
  ...over,
});
const withMusic = (over: Partial<MusicCue> = {}) =>
  withSceneMusic(withSound(p, clip), scene, [cue(over)]);

describe('a sound file’s type, from its first bytes', () => {
  it('knows WAV, MP3 (with a tag or from its first frame) and M4A', () => {
    expect(soundTypeOf(wav)).toBe('wav');
    expect(soundTypeOf(mp3Id3)).toBe('mp3');
    expect(soundTypeOf(mp3Frame)).toBe('mp3');
    expect(soundTypeOf(m4a)).toBe('m4a');
  });

  it('refuses anything else, whatever its name would say', () => {
    const adts = bytesOf([0xff, 0xf1, 0x50, 0x80, 0, 0]);
    const video = bytesOf([0, 0, 0, 0x20], 'ftyp', 'qt  ', [0, 0, 0, 0]);
    for (const bytes of [
      new Uint8Array(),
      bytesOf('OggS', [0, 2, 0, 0]),
      bytesOf('fLaC'),
      adts,
      video,
    ])
      expect(soundTypeOf(bytes)).toBeNull();
  });
});

describe('importSound', () => {
  const picked = (bytes: Uint8Array, name = 'Birdsong.wav', size = bytes.length) => ({
    name,
    size,
    read: async () => bytes,
  });
  const seconds = (n: number) => async () => n;

  it('reads the size before the file, then the type, then the length as this device decodes it', async () => {
    let read = false;
    const big = {
      name: 'big.wav',
      size: SOUND_LIMITS.fileBytes + 1,
      read: async () => ((read = true), wav),
    };
    expect(await importSound(p, big, seconds(1))).toEqual({
      ok: false,
      message: SOUND_REFUSALS.tooBig,
    });
    expect(read).toBe(false);
    expect(await importSound(p, picked(bytesOf('OggS')), seconds(1))).toEqual({
      ok: false,
      message: SOUND_REFUSALS.notSound,
    });
    const broken = async () => {
      throw new Error('EncodingError');
    };
    expect(await importSound(p, picked(wav), broken)).toEqual({
      ok: false,
      message: SOUND_REFUSALS.wontPlay,
    });
    expect(await importSound(p, picked(wav), seconds(0))).toEqual({
      ok: false,
      message: SOUND_REFUSALS.wontPlay,
    });
    expect(await importSound(p, picked(wav), seconds(SOUND_LIMITS.seconds + 1))).toEqual({
      ok: false,
      message: SOUND_REFUSALS.tooLong,
    });
  });

  it('gives a clip with the next free id, named by its type, the whole file as its trim', async () => {
    const first = await importSound(p, picked(mp3Id3, '  Rain on the roof.MP3 '), seconds(30));
    expect(first).toEqual({
      ok: true,
      clip: {
        id: 'sn1',
        file: 'sn1.mp3',
        label: 'Rain on the roof',
        length: 30,
        bytes: mp3Id3.length,
        trim: { start: 0, end: 30 },
        licence: 'not-sure' as const,
        credit: 'Rain on the roof, source not checked',
      },
      bytes: mp3Id3,
    });
    const second = await importSound(withSound(p, clip), picked(m4a, 'voice memo.wav'), seconds(5));
    expect(second.ok && second.clip).toMatchObject({
      id: 'sn2',
      file: 'sn2.m4a',
      label: 'voice memo',
    });
  });

  it('refuses a sound the film has no room left for', async () => {
    const full: Production = {
      ...p,
      manifest: { ...p.manifest, sounds: [{ ...clip, bytes: SOUND_LIMITS.totalBytes - 2 }] },
    };
    expect(await importSound(full, picked(wav), seconds(1))).toEqual({
      ok: false,
      message: SOUND_REFUSALS.filmFull,
    });
  });
});

describe('sound in a film (format 1.9.0)', () => {
  const files = { audio: new Map(), models: new Map(), sounds: new Map([['sounds/sn1.wav', wav]]) };

  it('keeps imported sounds, the mix and a scene’s music through a save and an open', () => {
    const film = withMix(withMusic({ loop: true, carriesOn: true }), {
      speech: 1,
      music: 0.5,
      effects: 0.8,
    });
    const opened = openProduction(saveProduction(film, files));
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') return;
    expect(opened.production).toEqual(film);
    expect(opened.files.sounds).toEqual(files.sounds);
    expect(mixOf(opened.production)).toEqual({ speech: 1, music: 0.5, effects: 0.8 });
    expect(mixOf(p)).toEqual(SOUND_MIX_DEFAULT);
  });

  it('refuses to save a sound it isn’t given', () => {
    expect(() => saveProduction(withSound(p, clip))).toThrow(
      /sounds\/sn1\.wav is named in the manifest/,
    );
  });

  it('writes only the sounds its manifest names, whatever else it’s given', () => {
    // The studio gives every sound the open film has had, so an undone one comes back with
    // its bytes on Redo (07-ux 7.7): sn2 is one of those, named by no clip now.
    const given = {
      ...files,
      sounds: new Map([...files.sounds, ['sounds/sn2.mp3', mp3Id3]]),
    };
    const soundsIn = (film: Production) => {
      const read = readArchive(saveProduction(film, given), { wanted: () => true });
      if (!read.ok) throw new Error(read.problem.code);
      return read.names.filter((name) => name.startsWith('sounds/'));
    };
    expect(soundsIn(withSound(p, clip))).toEqual(['sounds/sn1.wav']);
    expect(soundsIn(p)).toEqual([]);
  });

  it('refuses to open a sound that isn’t what its manifest says', () => {
    const saved = saveProduction(withSound(p, clip), files);
    const read = readArchive(saved, { wanted: () => true });
    if (!read.ok) throw new Error(read.problem.code);
    const swapped = (bytes: Uint8Array) =>
      writeArchive(
        read.names.map((name) => ({
          name,
          bytes: name === 'sounds/sn1.wav' ? bytes : read.entries.get(name)!,
        })),
      );
    // An MP3 in a file the manifest calls WAV, of the same size.
    const mp3 = bytesOf('ID3', [...wav.subarray(3)]);
    expect(openProduction(swapped(mp3))).toMatchObject({
      status: 'broken',
      problems: ["sounds/sn1.wav isn't the sound the manifest says."],
    });
    expect(openProduction(swapped(wav.subarray(1)))).toMatchObject({ status: 'broken' });
  });

  it('checks clips: safe ids, one of each, named by id and type, a trim within the file, the limits', () => {
    const problems = (sounds: SoundClip[]) =>
      checkReferences({ ...p, manifest: { ...p.manifest, sounds } });
    expect(problems([clip])).toEqual([]);
    for (const bad of [
      [{ ...clip, id: 'Sn 1', file: 'Sn 1.wav' }],
      [clip, clip],
      [{ ...clip, file: 'sn1.ogg' }],
      [{ ...clip, file: 'other.wav' }],
      [{ ...clip, length: SOUND_LIMITS.seconds + 1, trim: { start: 0, end: 1 } }],
      [{ ...clip, trim: { start: 5, end: 5 } }],
      [{ ...clip, trim: { start: 0, end: 13 } }],
      [{ ...clip, bytes: SOUND_LIMITS.fileBytes + 1 }],
      [
        { ...clip, bytes: SOUND_LIMITS.fileBytes },
        ...Array.from({ length: 6 }, (_, i) => ({
          ...clip,
          id: `sn${i + 2}`,
          file: `sn${i + 2}.wav`,
          bytes: SOUND_LIMITS.fileBytes,
        })),
      ],
    ])
      expect(problems(bad), JSON.stringify(bad[0])).not.toEqual([]);
  });

  it('checks each cue plays an imported sound or a shelf id, within the clip’s trim', () => {
    expect(checkReferences(withMusic())).toEqual([]);
    expect(checkReferences(withMusic({ sound: 'kenney/Sound/door-creak', to: 60 }))).toEqual([]);
    for (const bad of [
      { sound: 'sn9' },
      { sound: 'door creak' },
      { from: 8, to: 8 },
      { to: 8.5 },
      { from: -1 },
    ])
      expect(checkReferences(withMusic(bad)), JSON.stringify(bad)).not.toEqual([]);
    // In the trimmed clip's own time: the trim runs 2 to 10, so a cue may play up to 8.
    expect(checkReferences(withMusic({ from: 6, to: 8 }))).toEqual([]);
  });

  it('keeps a cue that starts past the scene’s end: only a Rehearse run knows the scene’s length', () => {
    const late = withMusic({ start: 3600 });
    expect(checkReferences(late)).toEqual([]);
    const opened = openProduction(saveProduction(late, files));
    expect(opened.status).toBe('ok');
  });

  it('removes a sound with the cues that play it, and orders a scene’s cues by start', () => {
    const film = withSceneMusic(withSound(p, clip), scene, [cue({ start: 5 }), cue({ start: 1 })]);
    expect(film.scenes[0]!.music!.map((c) => c.start)).toEqual([1, 5]);
    const without = withoutSound(film, 'sn1');
    expect(without.manifest.sounds).toBeUndefined();
    expect(without.scenes[0]).toEqual(p.scenes[0]);
    expect('music' in withSceneMusic(film, scene, []).scenes[0]!).toBe(false);
  });

  it('opens a 1.8.0 file, migrated, with no sound', () => {
    const read = readArchive(saveProduction(p), { wanted: () => true });
    if (!read.ok) throw new Error(read.problem.code);
    const old = writeArchive(
      read.names.map((name) => {
        const bytes = read.entries.get(name)!;
        if (name !== 'manifest.json') return { name, bytes };
        const m = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
        return {
          name,
          bytes: new TextEncoder().encode(JSON.stringify({ ...m, formatVersion: '1.8.0' })),
        };
      }),
    );
    expect(openProduction(old)).toMatchObject({ status: 'migrated', original: old });
  });
});

describe('where an imported sound came from (format 1.11.0; the owner, 28 Nov 2026)', () => {
  const files = { audio: new Map(), models: new Map(), sounds: new Map([['sounds/sn1.wav', wav]]) };
  const whole = { ...clip, trim: { start: 0, end: clip.length } };

  it('imports a sound as "not sure", credited by its name, until the licence step says', async () => {
    const picked = await importSound(
      p,
      { name: 'Birdsong.wav', size: wav.length, read: async () => wav },
      async () => 12,
    );
    expect(picked).toMatchObject({
      ok: true,
      clip: { licence: 'not-sure', credit: 'Birdsong, source not checked' },
    });
  });

  it('credits a CC BY clip as changed only when its trim is shorter than its file', () => {
    const answers = {
      choice: 'CC BY',
      sourceUrl: 'https://example.org/birds',
      maker: 'A. Maker',
    } as const;
    expect(licensedSound(clip, answers)).toEqual({
      ok: true,
      clip: {
        ...clip,
        licence: 'CC-BY-4.0',
        credit: 'Birdsong by A. Maker, CC BY 4.0, changed for StoryStage',
        source: { url: 'https://example.org/birds' },
      },
    });
    expect(licensedSound(whole, answers)).toMatchObject({
      clip: { credit: 'Birdsong by A. Maker, CC BY 4.0' },
    });
  });

  it('needs a page for the CC licences, and none for "not sure" or "I made it"', () => {
    expect(licensedSound(clip, { choice: 'CC0' })).toEqual({
      ok: false,
      problems: ['needsSource'],
    });
    expect(licensedSound(clip, { choice: 'not-sure' })).toMatchObject({
      ok: true,
      clip: { licence: 'not-sure', credit: 'Birdsong, source not checked' },
    });
    const own = licensedSound(
      { ...clip, source: { url: 'https://example.org/old' } },
      { choice: 'own-work', maker: 'Sam' },
    );
    // A learner's name is never put in a credit, and the old page goes with the old licence.
    expect(own).toEqual({
      ok: true,
      clip: { ...clip, licence: 'own-work', credit: 'Birdsong, made by our class' },
    });
    for (const problem of ['needsSource', 'badSource', 'needsMaker', 'needsName'] as const)
      expect(SOUND_LICENCE_PROBLEMS[problem]).toBeTruthy();
  });

  it('changes a clip’s licence in one pure step, or gives the problems', () => {
    const film = withSound(p, clip);
    const changed = withSoundLicence(film, 'sn1', {
      choice: 'CC0',
      sourceUrl: 'https://example.org/birds',
    });
    expect(changed).toMatchObject({ ok: true });
    if (!changed.ok) return;
    expect(changed.production.manifest.sounds).toEqual([
      {
        ...clip,
        licence: 'CC0-1.0',
        credit: 'Birdsong (CC0)',
        source: { url: 'https://example.org/birds' },
      },
    ]);
    expect(film.manifest.sounds).toEqual([clip]);
    expect(withSoundLicence(film, 'sn1', { choice: 'CC BY' })).toEqual({
      ok: false,
      problems: ['needsMaker', 'needsSource'],
    });
    expect(withSoundLicence(film, 'sn9', { choice: 'not-sure' })).toEqual({
      ok: true,
      production: film,
    });
  });

  it('checks the licence is an import’s, the credit is there, and the page', () => {
    for (const [bad, problem] of [
      [{ ...clip, licence: 'permission' }, /licence should be one an import may have/],
      [{ ...clip, credit: ' ' }, /credit line/],
      [{ ...clip, licence: 'CC0-1.0' }, /needs the page it came from/],
      [{ ...clip, source: { url: 'file:///C:/birds.wav' } }, /page should be a web address/],
    ] as const)
      expect(checkReferences(withSound(p, bad as SoundClip)).join('\n')).toMatch(problem);
    expect(checkReferences(withSound(p, clip))).toEqual([]);
  });

  it('keeps where it came from through a save and an open', () => {
    const made = licensedSound(clip, {
      choice: 'CC BY-NC',
      sourceUrl: 'https://example.org/b',
      maker: 'Jo',
    });
    if (!made.ok) throw new Error('not licensed');
    const film = withSound(p, made.clip);
    const opened = openProduction(saveProduction(film, files));
    expect(opened.status).toBe('ok');
    if (opened.status === 'broken') return;
    expect(opened.production.manifest.sounds).toEqual([made.clip]);
  });

  const asVersion = (
    film: Production,
    version: string,
    edit: (c: Record<string, unknown>) => unknown,
  ) => {
    const read = readArchive(saveProduction(film, files), { wanted: () => true });
    if (!read.ok) throw new Error(read.problem.code);
    return writeArchive(
      read.names.map((name) => {
        const bytes = read.entries.get(name)!;
        if (name !== 'manifest.json') return { name, bytes };
        const m = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
        const sounds = (m.sounds as Record<string, unknown>[]).map(edit);
        return {
          name,
          bytes: new TextEncoder().encode(JSON.stringify({ ...m, formatVersion: version, sounds })),
        };
      }),
    );
  };
  const without = ({ licence: _l, credit: _c, source: _s, ...rest }: Record<string, unknown>) =>
    rest;

  it('opens a 1.10.0 file with each clip "not sure", credited by its name', () => {
    const old = asVersion(withSound(p, clip), '1.10.0', without);
    const opened = openProduction(old);
    expect(opened).toMatchObject({ status: 'migrated', original: old });
    if (opened.status === 'broken') return;
    expect(opened.production.manifest.sounds).toEqual([
      { ...clip, licence: 'not-sure', credit: 'Birdsong, source not checked' },
    ]);
  });

  it('calls a 1.11.0 file damaged when a clip doesn’t say where it came from', () => {
    const opened = openProduction(asVersion(withSound(p, clip), '1.11.0', without));
    expect(opened.status).toBe('broken');
  });
});

describe('sound changes in the production’s history (agreed with S5)', () => {
  it('makes each change one undo step through ProductionSession.change, a drag between begin and commit', () => {
    const s = new ProductionSession<'learner'>(p);
    s.change('Add sound Birdsong', 'learner', (now) => withSound(now, clip));
    s.begin('Move Birdsong to 4 s', 'learner');
    for (const start of [1, 2, 4])
      s.change('Move Birdsong', 'learner', (now) => withSceneMusic(now, scene, [cue({ start })]));
    s.commit();
    expect(s.production().scenes[0]!.music).toEqual([cue({ start: 4 })]);
    expect(s.undoLabel()).toBe('Move Birdsong to 4 s');
    s.undo();
    expect(s.production().scenes[0]!.music).toBeUndefined();
    expect(s.undoLabel()).toBe('Add sound Birdsong');
    s.undo();
    expect(s.production().manifest.sounds).toBeUndefined();
  });
});
