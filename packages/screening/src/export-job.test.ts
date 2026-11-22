import { ExportError, FilmRefused, type ExportProgress, type FilmExport } from '@storystage/export';
import { describe, expect, it } from 'vitest';
import { ExportJob, type ExportRun } from './export-job.ts';

const FILM: FilmExport = {
  mp4: new ArrayBuffer(8),
  vtt: 'WEBVTT\n',
  srt: '',
  name: 'The Lost Penguin',
  capped: false,
  seconds: 12,
  sound: null,
};

/** A run the test moves on by hand. */
function controlled() {
  let report: ((p: ExportProgress) => void) | null = null;
  let finish: ((film: FilmExport) => void) | null = null;
  let fail: ((e: unknown) => void) | null = null;
  let signal: AbortSignal | null = null;
  const run: ExportRun = (s, onProgress) => {
    signal = s;
    report = onProgress;
    return new Promise<FilmExport>((resolve, reject) => {
      finish = resolve;
      fail = reject;
      s.addEventListener('abort', () => reject(new ExportError('cancelled')));
    });
  };
  return {
    run,
    progress: (p: ExportProgress) => report!(p),
    finish: (film = FILM) => finish!(film),
    fail: (e: unknown) => fail!(e),
    signal: () => signal!,
  };
}

const settle = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

describe('ExportJob', () => {
  it('starts idle, then reports each step with the time left', async () => {
    let now = 0;
    const r = controlled();
    const job = new ExportJob({ run: r.run, save: async () => undefined, now: () => now });
    expect(job.state).toEqual({ kind: 'idle' });
    job.start();
    expect(job.state).toMatchObject({
      kind: 'running',
      step: 'frames',
      fraction: 0,
      secondsLeft: null,
    });
    now = 10_000;
    r.progress({ step: 'frames', fraction: 0.25 });
    expect(job.state).toEqual({ kind: 'running', step: 'frames', fraction: 0.25, secondsLeft: 30 });
    r.progress({ step: 'credits', fraction: 0.9 });
    expect(job.state).toMatchObject({ step: 'credits' });
  });

  it('saves the film when it is made, and says it is done', async () => {
    const r = controlled();
    const saved: FilmExport[] = [];
    const job = new ExportJob({ run: r.run, save: async (f) => void saved.push(f) });
    job.start();
    r.finish();
    await settle();
    expect(saved).toEqual([FILM]);
    expect(job.state).toEqual({
      kind: 'done',
      name: 'The Lost Penguin',
      capped: false,
      sound: null,
    });
  });

  it('stops at once and keeps nothing', async () => {
    const r = controlled();
    const saved: FilmExport[] = [];
    const job = new ExportJob({ run: r.run, save: async (f) => void saved.push(f) });
    job.start();
    job.stop();
    await settle();
    expect(r.signal().aborted).toBe(true);
    expect(job.state).toEqual({ kind: 'idle' });
    expect(saved).toEqual([]);
  });

  it('gives the reasons when the film is refused', async () => {
    const r = controlled();
    const job = new ExportJob({ run: r.run, save: async () => undefined });
    job.start();
    r.fail(new FilmRefused(['Owl may only be used for non-commercial work.']));
    await settle();
    expect(job.state).toEqual({
      kind: 'refused',
      reasons: ['Owl may only be used for non-commercial work.'],
    });
  });

  it("says what went wrong in plain words when it can't be made", async () => {
    const r = controlled();
    const job = new ExportJob({ run: r.run, save: async () => undefined });
    job.start();
    r.fail(new ExportError('no_video_encoder'));
    await settle();
    expect(job.state).toEqual({
      kind: 'failed',
      words:
        "This device can't make video files. Try exporting the film on another computer or tablet.",
    });
  });

  it('goes back to idle when the learner cancels the save, with the film kept to save again', async () => {
    const r = controlled();
    const cancelled = Object.assign(new Error('cancelled'), { code: 'cancelled' });
    let tries = 0;
    const job = new ExportJob({
      run: r.run,
      save: async () => {
        tries++;
        if (tries === 1) throw cancelled;
      },
    });
    job.start();
    r.finish();
    await settle();
    expect(job.state).toEqual({ kind: 'unsaved', name: 'The Lost Penguin' });
    await job.saveAgain();
    expect(job.state).toMatchObject({ kind: 'done' });
  });

  it('tells its listeners, and starts again after it has finished', async () => {
    const r = controlled();
    const job = new ExportJob({ run: r.run, save: async () => undefined });
    let heard = 0;
    job.subscribe(() => heard++);
    job.start();
    job.start(); // already running: nothing new
    r.finish();
    await settle();
    expect(heard).toBeGreaterThanOrEqual(2);
    job.start();
    expect(job.state.kind).toBe('running');
  });
});
