import { exampleProduction, type Production } from '@storystage/production';
import {
  inMemoryPorts,
  serve,
  type FromRuntime,
  type Port,
  type Timers,
  type ToRuntime,
} from '@storystage/runtime';
import { FakeStage } from '@storystage/stage/testing';
import { STORY_LIBRARY, micros, type BackstageId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import type { EncoderBackend, Frame, SessionConfig } from '../encoder/backend.ts';
import { ExportError } from '../encoder/export-mp4.ts';
import {
  EXPORT_VIEWER_WAIT,
  FilmRefused,
  exportFilm,
  type ExportFilmOptions,
  type ExportProgress,
  type FilmModel,
} from './export-film.ts';
import type { FramePart } from './overlay.ts';

const settle = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

/** A backend that keeps nothing but counts: what the "device" encodes. */
function backend() {
  const log = { config: null as SessionConfig | null, frames: 0, opened: 0, cancelled: false };
  const b: EncoderBackend = {
    canEncodeVideo: async () => true,
    canEncodeAudio: async () => true,
    open: async (config) => {
      log.config = config;
      log.opened++;
      return {
        addFrame: async () => {
          log.frames++;
        },
        addAudio: async () => undefined,
        finish: async () => new ArrayBuffer(8),
        cancel: async () => {
          log.cancelled = true;
        },
      };
    },
  };
  return { backend: b, log };
}

const PENGUIN: FilmModel = {
  id: 'example/Flyer/penguin' as BackstageId,
  section: 'cast',
  licence: 'CC0-1.0',
  credit: 'Penguin by Kenney (CC0)',
  origin: 'shipped',
  displayName: 'Penguin',
};

function setup(over: Partial<ExportFilmOptions> = {}, model: FilmModel = PENGUIN) {
  let started = 0;
  let ended = 0;
  const parts: FramePart[] = [];
  const encoder = backend();
  const options: ExportFilmOptions = {
    production: exampleProduction(),
    find: (id) => (id === model.id ? model : undefined),
    stage: new FakeStage(),
    startWorker: () => {
      started++;
      const { main, worker } = inMemoryPorts();
      const timers: Timers = { now: () => 0, every: () => () => undefined };
      serve(worker, STORY_LIBRARY, timers);
      const port: Port<ToRuntime, FromRuntime> = main;
      return { port, terminate: () => ended++ };
    },
    seed: 1,
    compositor: (size) => {
      // One frame-sized buffer, reused: the encoder checks every frame is the film's size.
      const frame: Frame = {
        kind: 'rgba',
        width: size.width,
        height: size.height,
        data: new Uint8ClampedArray(size.width * size.height * 4),
      };
      return {
        frame: (part) => {
          parts.push(part);
          return frame;
        },
      };
    },
    backend: encoder.backend,
    ...over,
  };
  return { options, parts, encoder, workers: () => ({ started, ended }) };
}

describe('exportFilm', () => {
  it('draws the title card, the film and the credits, frame by frame at 30 a second', async () => {
    await settle();
    const { options, parts, encoder, workers } = setup();
    const film = await exportFilm(options);
    expect(encoder.log.frames).toBe(parts.length);
    expect(parts.length).toBe(Math.round(film.seconds * 30));
    const kinds = parts.map((p) => p.kind);
    expect(kinds.slice(0, 120).every((k) => k === 'title')).toBe(true);
    expect(kinds[120]).toBe('film');
    expect(kinds.at(-1)).toBe('credits');
    // In order: title, then film, then credits, never back.
    const order = kinds.filter((k, i) => k !== kinds[i - 1]);
    expect(order).toEqual(['title', 'film', 'credits']);
    expect(workers().ended).toBe(workers().started);
  });

  it('starts with the film when the title card is off', async () => {
    await settle();
    const { options, parts } = setup({ titleCard: false });
    await exportFilm(options);
    expect(parts[0]!.kind).toBe('film');
  });

  it('puts the captions on the picture and in the files, timed from the film start', async () => {
    await settle();
    const { options, parts } = setup();
    const film = await exportFilm(options);
    const withWords = parts.filter((p) => p.kind === 'film' && p.captions.length > 0);
    expect(withWords.length).toBeGreaterThan(0);
    expect(withWords[0]).toMatchObject({ captions: ['PIP: Oh no, the ice is moving!'] });
    expect(film.vtt).toContain('00:00:04.000 --> ');
    expect(film.vtt).toContain('PIP: Oh no, the ice is moving!');
    expect(film.srt).toContain('00:00:04,000 --> ');
  });

  it('leaves the captions off the picture when asked, and still writes the files', async () => {
    await settle();
    const { options, parts } = setup({ captionsOnPicture: false });
    const film = await exportFilm(options);
    expect(parts.some((p) => p.kind === 'film' && p.captions.length > 0)).toBe(false);
    expect(film.vtt).toContain('PIP: Oh no, the ice is moving!');
  });

  it('makes 720p by default, and 1080p when asked', async () => {
    await settle();
    const small = setup();
    await exportFilm(small.options);
    expect(small.encoder.log.config).toMatchObject({ width: 1280, height: 720, fps: 30 });
    const big = setup({ resolution: '1080p' });
    await exportFilm(big.options);
    expect(big.encoder.log.config).toMatchObject({ width: 1920, height: 1080 });
  });

  it('names the files after the title', async () => {
    await settle();
    const p = exampleProduction();
    const { options } = setup({
      production: { ...p, manifest: { ...p.manifest, title: 'Pip: the "Lost" Penguin?' } },
    });
    expect((await exportFilm(options)).name).toBe('Pip the Lost Penguin');
  });

  it('refuses before it starts when a model may not leave the school, naming it', async () => {
    await settle();
    const { options, encoder, workers } = setup({}, { ...PENGUIN, licence: 'CC-BY-NC-4.0' });
    const refused = await exportFilm(options).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(FilmRefused);
    expect((refused as FilmRefused).reasons[0]).toMatch(
      /Penguin may only be used for non-commercial work/,
    );
    expect(encoder.log.opened).toBe(0);
    expect(workers().started).toBe(0);
  });

  it('refuses a film that stops with an error, in plain words', async () => {
    await settle();
    const p = exampleProduction();
    const [first, ...rest] = p.program.types;
    const method = first!.methods[0]!;
    const bad = {
      ...method,
      body: [
        {
          id: 'badbad',
          kind: 'call',
          target: {
            id: 'badtgt',
            kind: 'fieldRef',
            target: { id: 'badslf', kind: 'this' },
            field: 'scene1p',
          },
          callee: { kind: 'story', name: 'say' },
          args: { text: { id: 'badnum', kind: 'number', value: 3 } },
          details: {},
        },
      ],
    } as unknown as typeof method;
    const broken: Production = {
      ...p,
      program: { ...p.program, types: [{ ...first!, methods: [bad] }, ...rest] },
    };
    const { options, encoder } = setup({ production: broken });
    const refused = await exportFilm(options).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(FilmRefused);
    expect((refused as FilmRefused).reasons[0]).toMatch(/can't use/);
    expect(encoder.log.opened).toBe(0);
  });

  it('stops at once when cancelled, keeps nothing, and ends its workers', async () => {
    await settle();
    const controller = new AbortController();
    const { options, workers } = setup({
      signal: controller.signal,
      onProgress: (p) => {
        if (p.step === 'frames' && p.fraction > 0.2) controller.abort();
      },
    });
    const stopped = await exportFilm(options).catch((e: unknown) => e);
    expect(stopped).toBeInstanceOf(ExportError);
    expect((stopped as ExportError).code).toBe('cancelled');
    expect(workers().ended).toBe(workers().started);
  });

  it('reports progress in three steps: frames, credits, then saving', async () => {
    await settle();
    const seen: ExportProgress[] = [];
    const { options } = setup({ onProgress: (p) => seen.push(p) });
    await exportFilm(options);
    const steps = seen.map((p) => p.step).filter((s, i, all) => s !== all[i - 1]);
    expect(steps).toEqual(['frames', 'credits', 'saving']);
    expect(seen.at(-1)!.fraction).toBe(1);
  });

  it('stops at the length cap and says so', async () => {
    await settle();
    const { options } = setup({ limit: micros(1) });
    const film = await exportFilm(options);
    expect(film.capped).toBe(true);
  });

  it('waits 5 seconds for a scene that waits on the viewer', () => {
    expect(EXPORT_VIEWER_WAIT).toBe(micros(5));
  });
});
