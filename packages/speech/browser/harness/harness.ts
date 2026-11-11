/**
 * The dictation harness for the browser test (not shipped). `?run=clip` dictates a recorded
 * clip through the real path: dictation, the whisper worker and whisper.cpp itself, with only
 * the microphone replaced by the clip; `&threads=1` limits whisper to one thread. `?run=page`
 * runs whisper.cpp on the page instead, as spike 1.3 did, for diagnosis by hand. `?run=speak`
 * speaks four lines with Kokoro (speak line) and has whisper hear them; `&only=sound` stops
 * before whisper, reporting each line's sound (for a machine without the whisper build).
 * `?run=microphone` opens the browser's microphone (a fake device in CI) through the real
 * worklet. The result goes on `window.harnessResult`.
 */
import type { SpeechModels } from '@storystage/host';
import { createDictation, type Microphone } from '../../src/dictation.ts';
import { browserMicrophone, defaultMicrophoneBrowser } from '../../src/microphone.ts';
import { KokoroEngine } from '../../src/speak-line/kokoro-engine.ts';
import { LineCache, lineSeconds } from '../../src/speak-line/lines.ts';
import { castVoices, switchAccent } from '../../src/speak-line/presets.ts';
import { WhisperCore, type WhisperModule } from '../../src/whisper-core.ts';
import { whisperRecogniser } from '../../src/worker-recogniser.ts';

const params = new URLSearchParams(location.search);
const out = document.getElementById('out')!;
const stages: string[] = [];
const stage = (s: string) => {
  stages.push(`${Math.round(performance.now())} ms: ${s}`);
  (window as unknown as { harnessStages: string[] }).harnessStages = stages;
  console.log(s);
};
const finish = (result: unknown) => {
  (window as unknown as { harnessResult: unknown }).harnessResult = result;
  out.textContent = JSON.stringify(result);
};
const script = new URL('/whisper.js', location.href).href;

async function assets() {
  stage(`isolated: ${String(crossOriginIsolated)}`);
  const model = await (await fetch('/model.bin')).arrayBuffer();
  stage(`model fetched, ${model.byteLength} bytes`);
  const decoded = await new AudioContext().decodeAudioData(
    await (await fetch('/jfk.wav')).arrayBuffer(),
  );
  return { model, decoded };
}

async function clip() {
  const { model, decoded } = await assets();
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) =>
    decoded.getChannelData(i),
  );
  // The clip stands in for the microphone, in blocks of 128 as a worklet gives them.
  const microphone: Microphone = {
    open: async (onSamples) => {
      for (let at = 0; at < decoded.length; at += 128)
        onSamples(
          channels.map((c) => c.slice(at, at + 128)),
          decoded.sampleRate,
        );
    },
    close: () => {},
  };
  const threads = Number(params.get('threads')) || undefined;
  const speech = { load: async () => model.slice(0) } as unknown as SpeechModels;
  const dictation = createDictation(speech, {
    microphone,
    recogniser: whisperRecogniser({
      script,
      ...(threads ? { threads } : {}),
      onLog: (line) => stage(`worker: ${line}`),
    }),
  })!;
  const started = performance.now();
  await dictation.start();
  stage('listened');
  const { text } = await dictation.stop();
  stage('heard');
  return { text, ms: Math.round(performance.now() - started), rate: decoded.sampleRate };
}

/** whisper.cpp on the page, as spike 1.3 ran it, with the same core and the same build. */
async function pageWhisper(model: ArrayBuffer): Promise<WhisperCore> {
  let core: WhisperCore | null = null;
  const module = await new Promise<WhisperModule>((resolve, reject) => {
    const Module: Record<string, unknown> = {
      print: (line: string) => {
        stage(`page: ${line}`);
        core?.print(line);
      },
      printErr: (line: string) => {
        stage(`page: ${line}`);
        core?.print(line);
      },
      mainScriptUrlOrBlob: script,
      onRuntimeInitialized: () => resolve(Module as unknown as WhisperModule),
    };
    (window as unknown as { Module: unknown }).Module = Module;
    const tag = document.createElement('script');
    tag.src = script;
    tag.onerror = () => reject(new Error('whisper.js did not load'));
    document.body.append(tag);
  });
  core = new WhisperCore(module, 4, (line) => stage(`page: ${line}`));
  core.load(new Uint8Array(model));
  return core;
}

async function page() {
  const { model, decoded } = await assets();
  const core = await pageWhisper(model);
  const started = performance.now();
  const text = await core.transcribe(decoded.getChannelData(0).slice(), decoded.sampleRate);
  return { text, ms: Math.round(performance.now() - started) };
}

async function microphone() {
  const browser = defaultMicrophoneBrowser();
  if (!browser) return { error: 'no browser microphone' };
  const mic = browserMicrophone(browser);
  let blocks = 0;
  let rate = 0;
  await mic.open((channels, sampleRate) => {
    blocks += 1;
    rate = sampleRate;
    void channels;
  });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  mic.close();
  const after = blocks;
  await new Promise((resolve) => setTimeout(resolve, 300));
  return { blocks, rate, afterClose: blocks - after };
}

window.addEventListener('error', (e) =>
  stage(`error: ${e.message} at ${e.filename}:${e.lineno}:${e.colno}`),
);
window.addEventListener('unhandledrejection', (e) => stage(`unhandled: ${String(e.reason)}`));

/**
 * Speak line (spec 06, section 4): Kokoro in the real worker speaks four lines through the line
 * cache, each character's voice from `castVoices`, in British and then American English; then
 * whisper, on the page, hears every one.
 */
async function speak() {
  const places = {
    assets: new URL('/kokoro/', location.href).href,
    wasm: new URL('/ort/', location.href).href,
  };
  const threads = Number(params.get('threads')) || undefined;
  const engine = new KokoroEngine(places, {
    ...(threads ? { threads } : {}),
    onLog: (line) => stage(`kokoro: ${line}`),
  });
  const loadMs = await engine.load();
  stage(`kokoro loaded in ${loadMs} ms`);
  const cast = castVoices([
    { id: 'child', storyClass: 'Biped' },
    { id: 'teacher', storyClass: 'Biped' },
    { id: 'owl', storyClass: 'Flyer' },
    { id: 'sister', storyClass: 'Biped', preset: 'girl' },
  ]);
  const texts = [
    'Here is the key.',
    'Thank you, Mr Fox.',
    'We had a lovely picnic by the river.',
    'Can you help me find my little brother?',
  ];
  const lines = [...cast.values()].flatMap((voice, i) =>
    (['british', 'american'] as const).map((accent) => ({
      text: texts[i]!,
      voice: switchAccent(voice, accent),
      seconds: lineSeconds(texts[i]!),
    })),
  );
  const cache = new LineCache(engine);
  const started = performance.now();
  await cache.prepare(lines);
  const prepareMs = Math.round(performance.now() - started);
  stage(`${cache.size} lines prepared in ${prepareMs} ms`);
  // Each line's sound before whisper, so a bad one shows even where whisper isn't built.
  for (const line of lines) {
    const s = cache.get(line);
    const bad = s ? s.filter((x) => !Number.isFinite(x)).length : -1;
    stage(
      `${line.voice.accent} ${line.voice.preset}: ${s ? s.length : 'none'} samples, ${bad} not finite`,
    );
  }
  if (params.get('only') === 'sound') return { prepareMs, sounds: lines.length };
  const whisper = await pageWhisper(await (await fetch('/model.bin')).arrayBuffer());
  const heard = [];
  for (const line of lines) {
    const sound = cache.get(line)!;
    heard.push({
      text: line.text,
      preset: line.voice.preset,
      base: line.voice.base,
      accent: line.voice.accent,
      seconds: line.seconds,
      soundSeconds: Math.round((sound.length / engine.sampleRate) * 100) / 100,
      peak: Math.round(Math.max(...sound.map(Math.abs)) * 100) / 100,
      heard: await whisper.transcribe(sound.slice(), engine.sampleRate),
    });
  }
  engine.dispose();
  return { loadMs, prepareMs, lines: heard };
}

const which = params.get('run');
const run =
  which === 'page' ? page : which === 'microphone' ? microphone : which === 'speak' ? speak : clip;
run().then(finish, (error: unknown) =>
  finish({ error: String((error as { code?: string }).code ?? error) }),
);
