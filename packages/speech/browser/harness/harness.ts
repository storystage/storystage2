/**
 * The dictation harness for the browser test (not shipped). `?run=clip` dictates a recorded
 * clip through the real path: dictation, the whisper worker and whisper.cpp itself, with only
 * the microphone replaced by the clip; `&threads=1` limits whisper to one thread. `?run=page`
 * runs whisper.cpp on the page instead, as spike 1.3 did, to compare. `?run=microphone` opens
 * the browser's microphone (a fake device in CI) through the real worklet. The result goes on
 * `window.harnessResult`.
 */
import type { SpeechModels } from '@storystage/host';
import { createDictation, type Microphone } from '../../src/dictation.ts';
import { browserMicrophone, defaultMicrophoneBrowser } from '../../src/microphone.ts';
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
const build = params.get('build');
const script = new URL(build ? `/builds/${build}/whisper.js` : '/whisper.js', location.href).href;

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
async function page() {
  const { model, decoded } = await assets();
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

const runs: Record<string, () => Promise<unknown>> = { clip, page, microphone };
(runs[params.get('run') ?? 'clip'] ?? clip)().then(finish, (error: unknown) =>
  finish({ error: String((error as { code?: string }).code ?? error) }),
);
