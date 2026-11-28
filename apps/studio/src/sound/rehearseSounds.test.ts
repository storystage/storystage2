import { exampleProduction, SOUND_MIX_DEFAULT, type Production } from '@storystage/production';
import { FakeAudioContext } from '@storystage/sound/fake-audio';
import { describe, expect, it } from 'vitest';
import { nodeId, type NodeId } from '@storystage/ast';
import { NO_TIMINGS, withTiming } from '../production/runTiming.ts';
import { sceneSeconds } from '../storyboard/edits.ts';
import { FilmSounds } from './filmSounds.ts';
import { lengthsOf, rehearseSounds, spokenOf, StudioSoundOut } from './rehearseSounds.ts';

// Rehearse's music and sounds in the studio (decision 0076, workplan 7.17; S3's LiveSounds).

describe('StudioSoundOut', () => {
  it('makes its output the first time it’s asked for, at the film’s volumes', () => {
    const contexts: FakeAudioContext[] = [];
    const out = new StudioSoundOut(SOUND_MIX_DEFAULT, () => {
      const c = new FakeAudioContext();
      contexts.push(c);
      return c;
    });
    expect(contexts).toHaveLength(0);
    out.setMix({ speech: 1, music: 0.5, effects: 0.25 });
    const made = out.get()!;
    expect(out.get()).toBe(made);
    expect(contexts).toHaveLength(1);
    expect(made.track('music').gain.value).toBe(0.5);
    expect(made.track('effects').gain.value).toBe(0.25);
  });

  it('follows the film’s volumes once made, and makes a new one after closing', () => {
    const contexts: FakeAudioContext[] = [];
    const out = new StudioSoundOut(SOUND_MIX_DEFAULT, () => {
      const c = new FakeAudioContext();
      contexts.push(c);
      return c;
    });
    const made = out.get()!;
    out.setMix({ speech: 1, music: 0.2, effects: 0.9 });
    contexts[0]!.currentTime = 1;
    expect(made.track('music').gain.value).not.toBe(0.2);
    out.close();
    expect(contexts[0]!.closed).toBe(true);
    expect(out.get()!.track('music').gain.value).toBe(0.2);
    expect(contexts).toHaveLength(2);
  });

  it('is nothing where there’s no Web Audio', () => {
    expect(new StudioSoundOut(SOUND_MIX_DEFAULT, () => null).get()).toBeNull();
  });
});

describe('lengthsOf', () => {
  const p = exampleProduction();
  const [first, second] = p.manifest.runningOrder.map((s) => s.scene);
  const whole = { whole: true, length: 2.5, sounds: [] };

  it('gives each scene its last whole run, or the storyboard’s plan', () => {
    const lengths = lengthsOf(p, withTiming(NO_TIMINGS, p, first!, whole));
    expect(lengths.lengthOf(first!)).toBe(2.5);
    expect(lengths.lengthOf(second!)).toBe(sceneSeconds(p, second!));
    expect(lengths.runLength(first!)).toBe(2.5);
    expect(lengths.runLength(second!)).toBeNull();
  });

  it('doesn’t expect a scene to end by a run of code that has changed since', () => {
    const kept = withTiming(NO_TIMINGS, p, first!, whole);
    const changed: Production = { ...p, program: { ...p.program } };
    expect(lengthsOf(changed, kept).runLength(first!)).toBeNull();
    // The timeline still draws by it, so the cue carried from it is heard as drawn.
    expect(lengthsOf(changed, kept).lengthOf(first!)).toBe(2.5);
  });
});

describe('spokenOf', () => {
  const p = exampleProduction();
  const [first, second] = p.manifest.runningOrder.map((s) => s.scene);
  const [heard, unheard, sound] = [nodeId('heard'), nodeId('unheard'), nodeId('sound')];
  const whole = {
    whole: true,
    length: 6,
    sounds: [
      { node: heard, kind: 'speech' as const, start: 0.5, length: 1.25, text: 'Hello' },
      { node: unheard, kind: 'speech' as const, start: 2, length: 1, text: 'Not voiced' },
      { node: sound, kind: 'sound' as const, start: 3, length: 1, ref: 'sn1' },
    ],
  };
  const voiced = (node: NodeId) => node === heard;

  it('gives the voiced speak lines of a scene’s last whole run, in seconds', () => {
    const spoken = spokenOf(p, withTiming(NO_TIMINGS, p, first!, whole), voiced);
    expect(spoken(first!)).toEqual([{ start: 0.5, end: 1.75 }]);
    expect(spoken(second!)).toBeNull();
  });

  it('gives none from a run of code that has changed since', () => {
    const kept = withTiming(NO_TIMINGS, p, first!, whole);
    const changed: Production = { ...p, program: { ...p.program } };
    expect(spokenOf(changed, kept, voiced)(first!)).toBeNull();
  });
});

describe('rehearseSounds', () => {
  it('is nothing without an output', () => {
    const p = exampleProduction();
    const film = new FilmSounds();
    expect(rehearseSounds(p, () => ({ out: () => null, film, timings: NO_TIMINGS }))).toBeNull();
  });

  it('reads the film’s own sounds by their clip', async () => {
    const p = exampleProduction();
    const clip = {
      id: 'sn1',
      label: 'Rain',
      file: 'sn1.wav',
      length: 2,
      bytes: 2,
      trim: { start: 0, end: 2 },
      licence: 'not-sure' as const,
      credit: 'A sound, source not checked',
    };
    const withClip: Production = { ...p, manifest: { ...p.manifest, sounds: [clip] } };
    const film = new FilmSounds();
    film.add(clip, new Uint8Array([1, 2]));
    const context = new FakeAudioContext();
    const out = new StudioSoundOut(SOUND_MIX_DEFAULT, () => context);
    const asked: string[] = [];
    const sounds = rehearseSounds(withClip, () => ({
      out: () => out.get(),
      film: {
        bytes: (c) => {
          asked.push(c.id);
          return film.bytes(c);
        },
      },
      timings: NO_TIMINGS,
    }))!;
    const scene = withClip.manifest.runningOrder[0]!.scene;
    const withCue: Production = {
      ...withClip,
      scenes: withClip.scenes.map((s) =>
        s.id === scene
          ? {
              ...s,
              music: [
                {
                  sound: 'sn1',
                  start: 0,
                  from: 0,
                  to: 2,
                  fadeIn: 0,
                  fadeOut: 0,
                  loop: false,
                  volume: 1,
                  carriesOn: false,
                },
              ],
            }
          : s,
      ),
    };
    const played = rehearseSounds(withCue, () => ({
      out: () => out.get(),
      film: {
        bytes: (c) => {
          asked.push(c.id);
          return film.bytes(c);
        },
      },
      timings: NO_TIMINGS,
    }))!;
    await sounds.prepare([scene]);
    expect(asked).toEqual([]);
    await played.prepare([scene]);
    expect(asked).toEqual(['sn1']);
    played.scene(scene, 0);
    played.play(0, 1);
    // The cue plays on the music track, from its file.
    expect(context.sources.some((s) => s.started !== null)).toBe(true);
    played.dispose();
  });
});
