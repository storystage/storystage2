/** Records frame intervals while something happens (a drag), for the drag-performance numbers. */
export function startFrames() {
  const intervals: number[] = [];
  let last = performance.now();
  let running = true;
  const tick = (now: number) => {
    intervals.push(now - last);
    last = now;
    if (running) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  return () => {
    running = false;
    const sorted = [...intervals].sort((a, b) => a - b);
    const pct = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
    const r = (n: number) => Math.round(n * 10) / 10;
    return {
      frames: intervals.length,
      medianMs: r(pct(0.5)),
      p95Ms: r(pct(0.95)),
      maxMs: r(sorted[sorted.length - 1] ?? 0),
      longFrames: intervals.filter((i) => i > 50).length,
    };
  };
}

export type FrameStats = ReturnType<ReturnType<typeof startFrames>>;

/** The page's hooks for the Playwright measurement. */
export interface SpikeHooks {
  startFrames: () => void;
  stopFrames: () => FrameStats;
  programText: () => string;
}

let stop: (() => FrameStats) | null = null;
export function installHooks(programText: () => string) {
  (window as unknown as { spike: SpikeHooks }).spike = {
    startFrames: () => {
      stop = startFrames();
    },
    stopFrames: () => stop!(),
    programText,
  };
}
