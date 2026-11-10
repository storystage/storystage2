/**
 * Spike 14.3: whisper from spike 1.3, used to check that each spoken line can be understood.
 * Optional: present only when prepare-assets.mjs was given spike 1.3's prepared files.
 */
import { resample } from './voice-fx.ts';

interface WhisperModule {
  FS: { writeFile(path: string, data: Uint8Array): void };
  init(path: string): number;
  full_default(
    instance: number,
    audio: Float32Array,
    lang: string,
    threads: number,
    translate: boolean,
  ): number;
}

const BASE = import.meta.env.BASE_URL;
let lines: string[] = [];
let onTotal: (() => void) | null = null;

export interface Listener {
  /** What whisper hears in 24 kHz `samples`. */
  hear(samples: Float32Array): Promise<string>;
}

export async function loadListener(): Promise<Listener | null> {
  const head = await fetch(`${BASE}whisper/main.js`, { method: 'HEAD' });
  if (!head.ok || !crossOriginIsolated) return null;
  const whisper = await new Promise<WhisperModule>((resolve, reject) => {
    const capture = (line: string) => {
      lines.push(line);
      if (/total time\s*=/.test(line)) onTotal?.();
    };
    const Module = {
      print: capture,
      printErr: capture,
      onRuntimeInitialized: () => resolve(Module as unknown as WhisperModule),
    };
    (window as unknown as { Module: unknown }).Module = Module;
    const script = document.createElement('script');
    script.src = `${BASE}whisper/main.js`;
    script.onerror = () => reject(new Error('whisper did not load'));
    document.body.append(script);
  });
  const model = new Uint8Array(
    await (await fetch(`${BASE}whisper/ggml-tiny.en-q5_1.bin`)).arrayBuffer(),
  );
  whisper.FS.writeFile('/model.bin', model);
  const instance = whisper.init('/model.bin');
  if (!instance) throw new Error('whisper could not load its model');
  return {
    async hear(samples) {
      lines = [];
      const audio = resample(samples, 24_000 / 16_000); // whisper wants 16 kHz
      const done = new Promise<void>((r) => (onTotal = r));
      const rc = whisper.full_default(
        instance,
        audio,
        'en',
        Math.min(4, navigator.hardwareConcurrency || 2),
        false,
      );
      if (rc !== 0) throw new Error(`whisper failed (${rc})`);
      await done;
      return lines
        .filter((l) => /^\[\d\d:\d\d:\d\d\.\d+ --> /.test(l.trim()))
        .map((l) => l.replace(/^\s*\[[^\]]*\]\s*/, '').trim())
        .join(' ')
        .trim();
    },
  };
}
