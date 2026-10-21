/**
 * Spike 1.3: whisper.cpp in WebAssembly transcribes a short spoken request on the device.
 * Measures how long the model takes to load, how long transcription takes, and memory, and
 * compares the transcript with what was said. Audio never leaves the device: the clips come
 * with the page, and the microphone recording stays in this tab.
 *
 * The page needs cross-origin isolation (whisper uses threads); on GitHub Pages,
 * coi-serviceworker provides it. Add `?auto=1` to run the test clips at once (CI).
 */

interface WhisperModule {
  FS: { writeFile(path: string, data: Uint8Array): void; unlink(path: string): void };
  HEAPU8: Uint8Array;
  init(path: string): number;
  free(instance: number): void;
  full_default(
    instance: number,
    audio: Float32Array,
    lang: string,
    threads: number,
    translate: boolean,
  ): number;
}

const MODELS = {
  'tiny.en-q5_1': {
    file: 'models/ggml-tiny.en-q5_1.bin',
    label: 'tiny English, quantised (32 MB)',
  },
  'tiny.en': { file: 'models/ggml-tiny.en.bin', label: 'tiny English, full (78 MB)' },
} as const;
type ModelId = keyof typeof MODELS;

const CLIPS = [
  {
    id: 'request',
    file: 'clips/request.wav',
    said: 'Make the cat walk to the tree, and then wave hello.',
  },
  {
    id: 'jfk',
    file: 'clips/jfk.wav',
    said: 'And so my fellow Americans, ask not what your country can do for you, ask what you can do for your country.',
  },
] as const;

const out = () => document.getElementById('out')!;
const say = (t: string) => (out().textContent = t);
const mb = (bytes: number) => Math.round(bytes / 1e5) / 10;
const jsHeapMb = () => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? mb(m.usedJSHeapSize) : null;
};

// ---- whisper.cpp's printed output is how it reports text and timings ----------------------
let lines: string[] = [];
let onTotal: (() => void) | null = null;
function capture(line: string) {
  lines.push(line);
  if (/total time\s*=/.test(line)) onTotal?.();
}

let modulePromise: Promise<WhisperModule> | null = null;
function loadModule(): Promise<WhisperModule> {
  modulePromise ??= new Promise((resolve, reject) => {
    const started = performance.now();
    const Module = {
      print: capture,
      printErr: capture,
      onRuntimeInitialized: () => {
        loadMs.runtime = Math.round(performance.now() - started);
        resolve(Module as unknown as WhisperModule);
      },
    };
    (window as unknown as { Module: unknown }).Module = Module;
    const script = document.createElement('script');
    script.src = 'main.js';
    script.onerror = () => reject(new Error('main.js did not load'));
    document.body.append(script);
  });
  return modulePromise;
}
const loadMs: Record<string, number> = {};

/** Decodes a sound file and turns it into 16 kHz mono, which is what whisper needs. */
async function to16kMono(buffer: ArrayBuffer): Promise<Float32Array> {
  const decoded = await new AudioContext().decodeAudioData(buffer);
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16_000), 16_000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  return (await offline.startRendering()).getChannelData(0);
}

/** Word error rate: how many words were wrong, as a share of what was said. */
export function wordErrorRate(said: string, heard: string): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9' ]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
  const a = norm(said);
  const b = norm(heard);
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(
        d[i - 1]![j]! + 1,
        d[i]![j - 1]! + 1,
        d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
  return Math.round((d[a.length]![b.length]! / Math.max(1, a.length)) * 100) / 100;
}

let instance = 0;
let instanceModel: ModelId | null = null;
async function useModel(whisper: WhisperModule, id: ModelId) {
  if (instanceModel === id) return;
  if (instance) whisper.free(instance);
  const t0 = performance.now();
  const bytes = new Uint8Array(await (await fetch(MODELS[id].file)).arrayBuffer());
  loadMs.download = Math.round(performance.now() - t0);
  const t1 = performance.now();
  try {
    whisper.FS.unlink('/model.bin');
  } catch {
    // no earlier model
  }
  whisper.FS.writeFile('/model.bin', bytes);
  instance = whisper.init('/model.bin');
  loadMs.init = Math.round(performance.now() - t1);
  if (!instance) throw new Error('whisper could not load the model');
  instanceModel = id;
}

async function transcribe(whisper: WhisperModule, audio: Float32Array) {
  lines = [];
  const threads = Math.min(8, navigator.hardwareConcurrency || 4);
  const t0 = performance.now();
  const done = new Promise<void>((resolve) => (onTotal = resolve));
  const rc = whisper.full_default(instance, audio, 'en', threads, false);
  if (rc !== 0) throw new Error(`whisper failed (${rc})`);
  await done;
  const ms = Math.round(performance.now() - t0);
  const text = lines
    .filter((l) => /^\[\d\d:\d\d:\d\d\.\d+ --> /.test(l.trim()))
    .map((l) => l.replace(/^\s*\[[^\]]*\]\s*/, '').trim())
    .join(' ')
    .trim();
  return { text, ms, threads, seconds: Math.round((audio.length / 16_000) * 10) / 10 };
}

async function runClips(id: ModelId) {
  const whisper = await loadModule();
  say(`Loading the ${MODELS[id].label} model…`);
  await useModel(whisper, id);
  const clips = [];
  for (const clip of CLIPS) {
    say(`Transcribing “${clip.id}” with ${MODELS[id].label}…`);
    const audio = await to16kMono(await (await fetch(clip.file)).arrayBuffer());
    const r = await transcribe(whisper, audio);
    clips.push({
      clip: clip.id,
      said: clip.said,
      heard: r.text,
      wordErrorRate: wordErrorRate(clip.said, r.text),
      audioSeconds: r.seconds,
      transcribeMs: r.ms,
      realTimeFactor: Math.round((r.ms / 1000 / r.seconds) * 100) / 100,
      threads: r.threads,
    });
  }
  return {
    model: id,
    loadMs: { ...loadMs },
    wasmMemoryMb: mb(whisper.HEAPU8.length),
    jsHeapMb: jsHeapMb(),
    clips,
  };
}

async function runAll() {
  const result = {
    userAgent: navigator.userAgent,
    crossOriginIsolated,
    cores: navigator.hardwareConcurrency,
    models: [] as unknown[],
  };
  if (!crossOriginIsolated) {
    say(
      'This page needs cross-origin isolation. Reload it once (the helper sets it up), then try again.',
    );
    return;
  }
  for (const id of Object.keys(MODELS) as ModelId[]) result.models.push(await runClips(id));
  say(JSON.stringify(result, null, 2));
  (window as unknown as { spikeResult: unknown }).spikeResult = result;
}

/** Records five seconds from the microphone and transcribes it. The audio stays in this tab. */
async function talk() {
  const whisper = await loadModule();
  await useModel(whisper, (document.getElementById('model') as HTMLSelectElement).value as ModelId);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const recorder = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => chunks.push(e.data);
  const stopped = new Promise((r) => (recorder.onstop = r));
  recorder.start();
  say('Listening for 5 seconds… say a request, for example “make the dog jump”.');
  await new Promise((r) => setTimeout(r, 5000));
  recorder.stop();
  await stopped;
  stream.getTracks().forEach((t) => t.stop());
  say('Turning your words into text…');
  const audio = await to16kMono(await new Blob(chunks).arrayBuffer());
  const r = await transcribe(whisper, audio);
  const result = {
    heard: r.text,
    transcribeMs: r.ms,
    audioSeconds: r.seconds,
    wasmMemoryMb: mb(whisper.HEAPU8.length),
  };
  say(JSON.stringify(result, null, 2));
}

document
  .getElementById('run')!
  .addEventListener('click', () => void runAll().catch((e) => say(`Failed: ${e}`)));
document
  .getElementById('talk')!
  .addEventListener('click', () => void talk().catch((e) => say(`Failed: ${e}`)));
if (new URLSearchParams(location.search).has('auto'))
  void runAll().catch((e) => {
    say(`Failed: ${e}`);
    (window as unknown as { spikeResult: unknown }).spikeResult = { error: String(e) };
  });
