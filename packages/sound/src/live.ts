/**
 * Music and sounds played live (decision 0076, workplan 11.7): Rehearse's, on the film's clock as
 * the picture plays. Music plays `musicPlays` from each scene's start, so it sounds as the Sound
 * view draws it and as the export mixes it; a cue that carries on keeps playing over a cut. A
 * `playAudio` block's sound plays as its `sound` command says, from its clip's trim start. A sound
 * the film hasn't got, or can't read, plays as silence.
 *
 * At half or double speed, music and sounds keep pace with the picture, so their pitch changes
 * (the owner's choice, 27 Nov 2026). After a pause, the music plays on from where the picture is,
 * and a sound that was playing doesn't, as speak lines don't (spec 06 section 4.5).
 *
 * The music is lowered under voiced speak lines by `duckOf`, as the export lowers it, through a
 * gain of its own between the music and the Music track, so the film's volumes never fight it.
 * Live, a line is known only as the runtime gets to it, a moment ahead of the picture (its
 * lookahead, 0.1 s), too late to go down before it or to join it to the line before. So a scene's
 * lines from its last whole run of the code as it is now (`spoken`) are taken at its start, as its
 * fade out is: then the music goes down before each line and stays down between lines less than a
 * second apart, as in the export. Each line as it's known (`speech`) is added, so a scene with no
 * such run is still lowered, from as soon as each line is known.
 */
import type { Production, SceneId, SoundRef } from '@storystage/production';
import { duckOf, type SpeechSpan } from './duck.ts';
import { carriedInto, musicOf } from './music.ts';
import type { BufferLike, GainLike, SoundOut, SourceLike, Track } from './out.ts';
import { CLICK_FREE_SECONDS, musicPlays, type ScenePlace } from './plays.ts';

/** A stage command, as much as this needs of one: a `sound` command's times are microseconds. */
export interface CommandLike {
  readonly kind: string;
  readonly seq?: number;
  readonly start: number;
  readonly duration: number;
  readonly sound?: string;
  readonly missing?: true;
}

/** A voiced speak line, in microseconds from its scene's start, as `commands` gives its times. */
export interface SpokenLike {
  readonly start: number;
  readonly end: number;
}

export interface LiveSoundsOptions {
  readonly out: SoundOut;
  readonly production: Production;
  /** An earlier scene's length, for the cue carried in: its last whole run's, or its plan's. */
  readonly lengthOf: (scene: SceneId) => number;
  /** A scene's last whole run length, if it has one: live music fades out by it. */
  readonly runLength?: (scene: SceneId) => number | null;
  /**
   * A scene's voiced lines in that same run, in seconds from its start, or `null` without one:
   * the music goes down under them from the scene's start.
   */
  readonly spoken?: (scene: SceneId) => readonly SpeechSpan[] | null;
  /** A sound's file, or `null` when the film hasn't got it. */
  readonly bytes: (sound: SoundRef) => Promise<Uint8Array | null> | Uint8Array | null;
}

type Points = readonly (readonly [number, number])[];

/** Something to play, in film seconds and seconds into its file. */
interface Wanted {
  readonly sound: SoundRef;
  readonly track: Track;
  readonly start: number;
  readonly end: number;
  readonly offset: number;
  readonly from: number;
  readonly to: number;
  readonly loop: boolean;
  readonly gain: Points;
}

interface Voice {
  readonly sound: SoundRef;
  /** When it's heard from, in film seconds. */
  readonly start: number;
  readonly source: SourceLike;
  readonly gain: GainLike;
  end: number;
  points: Points;
}

const MICROS = 1_000_000;

/**
 * A level on straight ramps between `points`: the first holds before them and the last after.
 * At a time two points share, the later one's level. No points is full (1), as S2's `duckOf`
 * gives none when there's no speech (agreed with S2, 27 Nov).
 */
export function levelAt(points: Points, t: number): number {
  if (points.length === 0) return 1;
  if (t < points[0]![0]) return points[0]![1];
  let i = 0;
  while (i + 1 < points.length && points[i + 1]![0] <= t) i++;
  const [t0, v0] = points[i]!;
  const next = points[i + 1];
  if (!next) return v0;
  const [t1, v1] = next;
  return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
}

/** Where a play is in its file at film time `t`, from its place at `start`. */
const positionAt = (w: Wanted, t: number): number => {
  const played = Math.max(0, t - w.start);
  if (!w.loop) return w.offset + played;
  const part = w.to - w.from;
  return w.from + ((((w.offset - w.from + played) % part) + part) % part);
};

/** Every sound a `playAudio` block names in words, found without running the program. */
export function soundsNamed(p: Production): SoundRef[] {
  const found = new Set<SoundRef>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) for (const v of value) visit(v);
    else if (value && typeof value === 'object') {
      const node = value as Record<string, unknown>;
      const callee = node.callee as { name?: unknown } | undefined;
      const source = (node.args as Record<string, unknown> | undefined)?.audioSource as
        { kind?: unknown; value?: unknown } | undefined;
      if (
        node.kind === 'call' &&
        callee?.name === 'playAudio' &&
        source?.kind === 'text' &&
        typeof source.value === 'string'
      )
        found.add(source.value);
      for (const v of Object.values(node)) visit(v);
    }
  };
  visit(p.program);
  return [...found];
}

export class LiveSounds {
  readonly #options: LiveSoundsOptions;
  /** Each sound's audio once asked for: `null` when the film hasn't got it or it won't read. */
  readonly #buffers = new Map<SoundRef, Promise<BufferLike | null>>();
  readonly #ready = new Map<SoundRef, BufferLike | null>();
  #scenes: ScenePlace[] = [];
  /** The `playAudio` sounds heard since the last pause, by command. */
  #effects = new Map<string, Wanted>();
  #voices = new Map<string, Voice>();
  /** The voiced lines, in film seconds, by where they are: `heard` if from `speech`. */
  #spoken = new Map<string, SpeechSpan & { readonly heard: boolean }>();
  /** The music under speech: between the music's voices and the Music track. */
  readonly #duck: GainLike;
  /** What `#duck` was last told, in film seconds. */
  #ducked: Points = [];
  /** While playing: film time `film` is at the context's `at`, and the picture's speed. */
  #clock: { film: number; at: number; speed: number } | null = null;

  constructor(options: LiveSoundsOptions) {
    this.#options = options;
    this.#duck = options.out.context.createGain();
    this.#duck.connect(options.out.track('music'));
  }

  /** Reads the music of `scenes`, the cue carried into the first, and every sound named in words. */
  async prepare(scenes: readonly SceneId[]): Promise<void> {
    const p = this.#options.production;
    const sounds = new Set<SoundRef>(soundsNamed(p));
    for (const scene of scenes) for (const c of musicOf(p, scene)) sounds.add(c.sound);
    const into = scenes[0] === undefined ? null : carriedInto(p, scenes[0]);
    if (into) sounds.add(into.cue.sound);
    await Promise.all([...sounds].map((s) => this.#buffer(s)));
  }

  /** A scene started at film time `at` (seconds): the one before it ended there. */
  scene(scene: SceneId, at: number): void {
    const last = this.#scenes[this.#scenes.length - 1];
    if (last && !Number.isFinite(last.length))
      this.#scenes[this.#scenes.length - 1] = {
        scene: last.scene,
        start: last.start,
        length: Math.max(0, at - last.start),
      };
    const run = this.#options.runLength?.(scene) ?? null;
    this.#scenes.push({
      scene,
      start: at,
      length: Infinity,
      ...(run !== null && run > 0 ? { expected: run } : {}),
    });
    this.#plan();
    const lines = this.#options.spoken?.(scene) ?? [];
    for (const s of lines) this.#hear(at + s.start, at + s.end, false);
    if (lines.length > 0) this.#lower(this.#clock ? levelAt(this.#ducked, this.#now()) : undefined);
  }

  /**
   * Plays from film time `time` (seconds) at the picture's `speed`: at the start, after a pause,
   * and when the speed changes, when what's playing goes on at the new pace.
   */
  play(time: number, speed: number): void {
    this.#options.out.wake();
    // At a change of speed, the music under speech goes on from where it is.
    const was = this.#clock ? levelAt(this.#ducked, this.#now()) : undefined;
    this.#clock = { film: time, at: this.#options.out.context.currentTime, speed };
    this.#plan();
    this.#lower(was);
  }

  /**
   * Voiced speak lines in `scene`, as soon as they're known: the music goes down under them. Ones
   * heard while paused aren't spoken, so they don't lower it; a line known late lowers it from
   * where it is, over 10 ms.
   */
  speech(scene: SceneId, spans: readonly SpokenLike[]): void {
    if (!this.#clock) return;
    const place = [...this.#scenes].reverse().find((s) => s.scene === scene);
    if (!place) return;
    const before = this.#spoken.size;
    for (const s of spans)
      this.#hear(place.start + s.start / MICROS, place.start + s.end / MICROS, true);
    if (this.#spoken.size !== before) this.#lower(levelAt(this.#ducked, this.#now()));
  }

  #hear(start: number, end: number, heard: boolean): void {
    const key = `${start}:${end}`;
    if (end > start && !this.#spoken.has(key)) this.#spoken.set(key, { start, end, heard });
  }

  /**
   * The runtime's commands for `scene`: each `sound` command plays, from its block's start. Ones
   * heard while paused (Rehearse to here running ahead) don't, as speak lines don't.
   */
  commands(scene: SceneId, commands: readonly CommandLike[]): void {
    if (!this.#clock) return;
    const place = [...this.#scenes].reverse().find((s) => s.scene === scene);
    if (!place) return;
    const p = this.#options.production;
    for (const c of commands) {
      if (c.kind !== 'sound' || c.sound === undefined || c.missing || c.duration <= 0) continue;
      const start = place.start + c.start / MICROS;
      const end = start + c.duration / MICROS;
      const trim = p.manifest.sounds?.find((s) => s.id === c.sound)?.trim.start ?? 0;
      const gain: Points =
        end - start > CLICK_FREE_SECONDS
          ? [
              [start, 1],
              [end - CLICK_FREE_SECONDS, 1],
              [end, 0],
            ]
          : [[start, 1]];
      this.#effects.set(`fx:${c.seq ?? `${scene}:${c.start}:${c.sound}`}`, {
        sound: c.sound,
        track: 'effects',
        start,
        end,
        offset: trim,
        from: trim,
        to: trim + (end - start),
        loop: false,
        gain,
      });
    }
    this.#plan();
  }

  /** Pause: everything goes quiet over 10 ms. `play` goes on with the music, not the sounds. */
  pause(): void {
    const now = this.#now();
    for (const key of [...this.#voices.keys()]) this.#silence(key, now);
    this.#effects.clear();
    // Lines don't go on after a pause (spec 06 section 4.5), so they don't lower the music then:
    // only those from the last run still to come stay, as they'll be spoken when Play gets there.
    for (const [key, s] of this.#spoken) if (s.heard || s.start < now) this.#spoken.delete(key);
    this.#ducked = [];
    this.#clock = null;
  }

  /** The run is over (ended, stopped, or replaced): quiet, and forgets its scenes. */
  end(): void {
    this.pause();
    this.#scenes = [];
    this.#spoken.clear();
  }

  /** Lets the sounds' audio go. The output is the caller's. */
  dispose(): void {
    this.end();
    this.#duck.disconnect();
    this.#buffers.clear();
    this.#ready.clear();
  }

  /** Film time now, by the audio clock. */
  #now(): number {
    const c = this.#clock;
    if (!c) return 0;
    return c.film + (this.#options.out.context.currentTime - c.at) * c.speed;
  }

  /** When film time `t` is on the audio clock: never before now. */
  #at(t: number): number {
    const c = this.#clock!;
    const now = this.#options.out.context.currentTime;
    return Math.max(now, c.at + (t - c.film) / c.speed);
  }

  #buffer(sound: SoundRef): Promise<BufferLike | null> {
    let buffer = this.#buffers.get(sound);
    if (!buffer) {
      buffer = (async () => {
        const bytes = await this.#options.bytes(sound);
        return bytes ? this.#options.out.decode(bytes) : null;
      })()
        .catch(() => null)
        .then((b) => (this.#ready.set(sound, b), b));
      this.#buffers.set(sound, buffer);
    }
    return buffer;
  }

  /** The music under the lines known so far, from now: from `was` if it was already playing. */
  #lower(was: number | undefined): void {
    if (!this.#clock) return;
    this.#ducked = duckOf([...this.#spoken.values()]);
    this.#ramp(this.#duck, this.#ducked, this.#now(), was);
  }

  /** What should be playing from now, and the voices playing it. */
  #plan(): void {
    if (!this.#clock) return;
    const now = this.#now();
    const wanted = new Map<string, Wanted>(this.#effects);
    const { production, lengthOf } = this.#options;
    for (const m of musicPlays(production, this.#scenes, lengthOf))
      wanted.set(`music:${m.scene}:${m.index}`, { ...m, track: 'music' });
    for (const [key, voice] of this.#voices) {
      const w = wanted.get(key);
      if (!w || w.sound !== voice.sound || w.end <= now) this.#silence(key, now);
    }
    for (const [key, w] of wanted) {
      if (w.end <= now) {
        if (w.track === 'effects') this.#effects.delete(key);
        continue;
      }
      if (!this.#ready.has(w.sound)) {
        // Read late (a sound named by a variable): it starts part-way in, in time.
        const clock = this.#clock;
        void this.#buffer(w.sound).then(() => {
          if (this.#clock === clock) this.#plan();
        });
        continue;
      }
      const buffer = this.#ready.get(w.sound);
      if (!buffer) continue;
      const voice = this.#voices.get(key);
      // A voice ends only sooner as more is known; one that should play longer starts again, as
      // does one still waiting to start, whose start may have moved with the speed.
      if (voice && voice.start <= now && (voice.end === Infinity || w.end <= voice.end))
        this.#keep(voice, w, now);
      else {
        if (voice) this.#silence(key, now);
        this.#start(key, w, buffer, now);
      }
    }
  }

  #start(key: string, w: Wanted, buffer: BufferLike, now: number): void {
    const { out } = this.#options;
    const from = Math.max(now, w.start);
    const source = out.context.createBufferSource();
    const gain = out.context.createGain();
    source.buffer = buffer;
    source.loop = w.loop;
    if (w.loop) {
      source.loopStart = w.from;
      source.loopEnd = w.to;
    }
    source.playbackRate.value = this.#clock!.speed;
    source.connect(gain);
    gain.connect(w.track === 'music' ? this.#duck : out.track(w.track));
    const voice: Voice = {
      sound: w.sound,
      start: from,
      source,
      gain,
      end: w.end,
      points: w.gain,
    };
    source.onended = () => {
      gain.disconnect();
      if (this.#voices.get(key) === voice) this.#voices.delete(key);
    };
    this.#ramp(gain, w.gain, from);
    source.start(this.#at(from), positionAt(w, from));
    if (Number.isFinite(w.end)) source.stop(this.#at(w.end));
    this.#voices.set(key, voice);
  }

  /** A voice already playing goes on, at the picture's pace, to its new loudness and end. */
  #keep(voice: Voice, w: Wanted, now: number): void {
    const at = this.#at(now);
    voice.source.playbackRate.cancelScheduledValues(at);
    voice.source.playbackRate.setValueAtTime(this.#clock!.speed, at);
    const was = levelAt(voice.points, now);
    this.#ramp(voice.gain, w.gain, now, was);
    // Its stop again, on the clock as it is now: the last `stop` called is the one that counts.
    if (Number.isFinite(w.end)) voice.source.stop(this.#at(w.end));
    voice.end = w.end;
    voice.points = w.gain;
  }

  /** Schedules `points` from film time `from`, from the level `was` if it was playing. */
  #ramp(gain: GainLike, points: Points, from: number, was?: number): void {
    const param = gain.gain;
    param.cancelScheduledValues(this.#at(from));
    let after = from;
    if (was === undefined) param.setValueAtTime(levelAt(points, from), this.#at(from));
    else {
      // From where it was to where it's now meant to be, over 10 ms, so nothing clicks.
      after = from + CLICK_FREE_SECONDS;
      param.setValueAtTime(was, this.#at(from));
      param.linearRampToValueAtTime(levelAt(points, after), this.#at(after));
    }
    for (const [t, level] of points)
      if (t > after) param.linearRampToValueAtTime(level, this.#at(t));
  }

  /** Quiet over 10 ms, then stopped. */
  #silence(key: string, now: number): void {
    const voice = this.#voices.get(key);
    if (!voice) return;
    this.#voices.delete(key);
    if (!this.#clock) return;
    const param = voice.gain.gain;
    const at = this.#at(now);
    param.cancelScheduledValues(at);
    param.setValueAtTime(levelAt(voice.points, now), at);
    param.linearRampToValueAtTime(0, at + CLICK_FREE_SECONDS);
    voice.source.stop(at + CLICK_FREE_SECONDS);
  }
}
