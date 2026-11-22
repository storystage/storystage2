/**
 * WP11.3: Export for distribution (spec 08, section 4). The film is measured, then played on a
 * stage that's never shown, in fixed steps at 30 frames a second: the title card, every frame of
 * the film with its captions, then the credits roll, each encoded by S1's `exportMp4`. The
 * captions are saved beside it as WebVTT and SRT.
 *
 * Refused before anything is drawn when a model may not leave the school (3.12), or when the
 * film stops with an error. A film longer than 10 minutes stops at the cap and says so.
 * Speak lines are voiced with the studio's sounds (`voices`, spec 08 section 4): prepared first,
 * then mixed into one track. Recorded lines and narration come later: they need their times.
 */
import { mayDistribute, type BackstageItem } from '@storystage/backstage';
import { FILM_CAP, Playback, measure, type RuntimeWorker } from '@storystage/playback';
import type { Production } from '@storystage/production';
import type { FrameImage, Stage } from '@storystage/stage';
import { micros, type BackstageId, type Micros } from '@storystage/story-api';
import type { AudioCodecChoice, EncoderBackend, Frame } from '../encoder/backend.ts';
import { ExportError, exportMp4, probeExport } from '../encoder/export-mp4.ts';
import { captionsFor, srt, webVtt } from './captions.ts';
import { filmCredits, usedModels, type CreditOptions, type FilmCreditable } from './credits.ts';
import { drawPart, filmPlan, partAt, type FramePart } from './overlay.ts';
import { TRACK_RATE, soundtrack, voicedLines, type FilmVoices } from './soundtrack.ts';
import { bylineFor, titleCard } from './titles.ts';

/** A scene that waits on the viewer ends this long after its last stage command (rule 11). */
export const EXPORT_VIEWER_WAIT = micros(5);

const FPS = 30;

export const RESOLUTIONS = {
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
} as const;
export type Resolution = keyof typeof RESOLUTIONS;

/** What the export needs from a model's Backstage record: its credit, and its name for a refusal. */
export type FilmModel = FilmCreditable & Pick<BackstageItem, 'displayName'>;

/** Draws one frame of the film: the stage's picture for the film's frames, then what goes over it. */
export interface Compositor {
  frame(part: FramePart, picture: FrameImage | null): Frame | Promise<Frame>;
}

export type ExportStep = 'voices' | 'frames' | 'credits' | 'saving';
export interface ExportProgress {
  /**
   * Preparing the speak lines' voices (a film with speak lines), drawing the film's frames, adding
   * the credits, then saving the MP4 file.
   */
  readonly step: ExportStep;
  /** Of the whole export, 0 to 1. */
  readonly fraction: number;
}

export interface ExportFilmOptions extends CreditOptions {
  readonly production: Production;
  /** A shipped model's Backstage record. A model the class imported comes from the file. */
  readonly find: (id: BackstageId) => FilmModel | undefined;
  /** A stage that's never shown (`createBabylonStage({ offscreen: true })`). The caller disposes of it. */
  readonly stage: Stage;
  /** Starts a runtime worker. The export ends every one it starts. */
  readonly startWorker: () => RuntimeWorker;
  readonly seed: number;
  /** Default on. */
  readonly titleCard?: boolean;
  /** Default: from the credit names, "A film by Ana and Sam". */
  readonly byline?: string;
  /** Default on. The caption files are saved either way. */
  readonly captionsOnPicture?: boolean;
  /** Default 720p. */
  readonly resolution?: Resolution;
  /** Default: an offscreen 2D canvas (`canvasCompositor`). */
  readonly compositor?: (size: { readonly width: number; readonly height: number }) => Compositor;
  readonly backend?: EncoderBackend;
  readonly audioCodecs?: readonly AudioCodecChoice[];
  /** The studio's voices for speak lines. Without them, speak lines are silent, with captions. */
  readonly voices?: FilmVoices;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: ExportProgress) => void;
  /** Default 10 minutes. */
  readonly limit?: Micros;
}

export interface FilmExport {
  readonly mp4: ArrayBuffer;
  /** The captions, WebVTT (`.vtt`) and SRT (`.srt`), to save beside the film. */
  readonly vtt: string;
  readonly srt: string;
  /** For the file names: the title, with what a file name can't have taken out. */
  readonly name: string;
  /** The film was longer than 10 minutes, so it stops there. */
  readonly capped: boolean;
  readonly seconds: number;
  /**
   * The speak lines' sound, for the dialog's note; `null` when the film has none. `silent`
   * lines had no sound ready; `unencoded` means this device can't encode the track, so the
   * film is silent.
   */
  readonly sound: {
    readonly voiced: number;
    readonly silent: number;
    readonly unencoded: boolean;
  } | null;
}

/** The export can't start. Each reason is in plain words. */
export class FilmRefused extends Error {
  readonly reasons: readonly string[];
  constructor(reasons: readonly string[]) {
    super(reasons.join(' '));
    this.name = 'FilmRefused';
    this.reasons = reasons;
  }
}

/** Why the film can't be shared beyond the school: its non-commercial and unchecked models. */
export function distributionProblems(
  production: Production,
  find: (id: BackstageId) => FilmModel | undefined,
): string[] {
  const packed = new Map(production.manifest.models.map((m) => [m.item.id as string, m.item]));
  const reasons: string[] = [];
  for (const id of usedModels(production)) {
    const item = packed.get(id) ?? find(id);
    const verdict = item ? mayDistribute(item) : { allowed: true as const };
    if (!verdict.allowed) reasons.push(verdict.reason);
  }
  return reasons;
}

/** The title as a file name: "Pip the Lost Penguin". */
export function fileName(title: string): string {
  const name = title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return name === '' ? 'Untitled film' : name;
}

const cancelled = (e: unknown) =>
  (e instanceof Error && e.name === 'AbortError') ||
  (e instanceof ExportError && e.code === 'cancelled');

export async function exportFilm(options: ExportFilmOptions): Promise<FilmExport> {
  const { production, stage, signal } = options;
  const problems = distributionProblems(production, options.find);
  if (problems.length > 0) throw new FilmRefused(problems);

  const measuring = options.startWorker();
  const timeline = await measure({
    production,
    stage,
    port: measuring.port,
    terminate: measuring.terminate,
    seed: options.seed,
    viewerWait: EXPORT_VIEWER_WAIT,
    limit: options.limit ?? FILM_CAP,
    ...(signal ? { signal } : {}),
  }).catch((e: unknown) => {
    throw cancelled(e) ? new ExportError('cancelled') : e;
  });
  if (timeline.end.kind === 'error')
    throw new FilmRefused([
      `The film stops with an error, so it can't be exported yet. ${timeline.end.words}`,
    ]);
  if (timeline.end.kind === 'fault') throw new FilmRefused([timeline.end.message]);

  const title =
    options.titleCard === false
      ? null
      : titleCard(
          production,
          options.byline ?? bylineFor(production.manifest.credits?.names ?? []),
        );
  const captions = captionsFor(timeline.lines, production.script, { offset: title?.duration ?? 0 });
  const plan = filmPlan({
    title,
    filmLength: timeline.length,
    credits: filmCredits(production, options.find, options),
    captions,
    captionsOnPicture: options.captionsOnPicture ?? true,
  });

  const size = RESOLUTIONS[options.resolution ?? '720p'];
  const report = (step: ExportStep, fraction: number) => options.onProgress?.({ step, fraction });

  // The speak lines' voices: prepared first, then one track (section 4).
  const speaking = voicedLines(timeline.lines);
  let audio: { channels: Float32Array[]; sampleRate: number } | null = null;
  let sound: FilmExport['sound'] = null;
  if (speaking.length > 0) {
    const voices = options.voices;
    if (voices) {
      report('voices', 0);
      await voices.prepare(speaking, signal);
      if (signal?.aborted) throw new ExportError('cancelled');
    }
    const track = voices
      ? soundtrack(timeline.lines, voices, { offset: title?.duration ?? 0, total: plan.total })
      : null;
    let unencoded = false;
    if (track && track.voiced > 0) {
      const probe = await probeExport({
        ...size,
        audio: { channels: 1, sampleRate: TRACK_RATE },
        ...(options.backend ? { backend: options.backend } : {}),
        ...(options.audioCodecs ? { audioCodecs: options.audioCodecs } : {}),
      });
      if (probe.audioCodec) audio = { channels: [track.samples], sampleRate: TRACK_RATE };
      else unencoded = true;
    }
    sound = {
      voiced: track?.voiced ?? 0,
      silent: track?.silent ?? speaking.length,
      unencoded,
    };
  }

  const compositor = (options.compositor ?? canvasCompositor)(size);
  const playing = options.startWorker();
  const playback = new Playback({
    production,
    stage,
    port: playing.port,
    terminate: playing.terminate,
    mode: 'production',
    seed: options.seed,
    viewerWait: EXPORT_VIEWER_WAIT,
  });
  const seconds = plan.total / 1_000_000;
  try {
    await playback.start();
    const result = await exportMp4({
      ...size,
      fps: FPS,
      seconds,
      renderFrame: async (_index, time) => {
        const part = partAt(plan, micros(time));
        let picture: FrameImage | null = null;
        if (part.kind === 'film') {
          if (!playback.ended()) await playback.frame(part.at);
          picture = await stage.renderFrame();
        }
        return compositor.frame(part, picture);
      },
      onProgress: ({ frame, frames }) => {
        const t = micros(frame / FPS);
        if (frame >= frames) report('saving', 1);
        else report(t < plan.creditsStart ? 'frames' : 'credits', frame / frames);
      },
      ...(options.backend ? { backend: options.backend } : {}),
      ...(options.audioCodecs ? { audioCodecs: options.audioCodecs } : {}),
      ...(audio ? { audio } : {}),
      ...(signal ? { signal } : {}),
    });
    return {
      mp4: result.bytes,
      vtt: webVtt(plan.captions),
      srt: srt(plan.captions),
      name: fileName(production.manifest.title),
      capped: timeline.end.kind === 'cap',
      seconds,
      sound,
    };
  } catch (e) {
    throw cancelled(e) ? new ExportError('cancelled') : e;
  } finally {
    playback.dispose();
  }
}

/**
 * The browser's compositor: an offscreen 2D canvas the size of the film. The stage's picture is
 * put on it (scaled if it's another size), then the title card, captions or credits are drawn.
 */
export function canvasCompositor(size: {
  readonly width: number;
  readonly height: number;
}): Compositor {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ExportError('bad_frame', 'no 2D canvas');
  return {
    async frame(part, picture) {
      ctx.globalAlpha = 1;
      if (picture) {
        const image = new ImageData(
          new Uint8ClampedArray(picture.data),
          picture.width,
          picture.height,
        );
        if (picture.width === size.width && picture.height === size.height)
          ctx.putImageData(image, 0, 0);
        else {
          const bitmap = await createImageBitmap(image);
          ctx.drawImage(bitmap, 0, 0, size.width, size.height);
          bitmap.close();
        }
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, size.width, size.height);
      }
      drawPart(ctx, part, size);
      return { kind: 'canvas', canvas };
    },
  };
}
