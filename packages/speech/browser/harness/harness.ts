/**
 * The dictation harness for the browser test (not shipped). `?run=clip` dictates a recorded
 * clip through the real path: dictation, the whisper worker and whisper.cpp itself, with only
 * the microphone replaced by the clip. `?run=microphone` opens the browser's microphone (a fake
 * device in CI) through the real worklet. The result goes on `window.harnessResult`.
 */
import type { SpeechModels } from '@storystage/host';
import { createDictation, type Microphone } from '../../src/dictation.ts';
import { browserMicrophone, defaultMicrophoneBrowser } from '../../src/microphone.ts';
import { whisperRecogniser } from '../../src/worker-recogniser.ts';

const out = document.getElementById('out')!;
const finish = (result: unknown) => {
  (window as unknown as { harnessResult: unknown }).harnessResult = result;
  out.textContent = JSON.stringify(result);
};

async function clip() {
  const model = await (await fetch('/model.bin')).arrayBuffer();
  const decoded = await new AudioContext().decodeAudioData(
    await (await fetch('/jfk.wav')).arrayBuffer(),
  );
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
  const speech = { load: async () => model.slice(0) } as unknown as SpeechModels;
  const dictation = createDictation(speech, {
    microphone,
    recogniser: whisperRecogniser({ script: new URL('/whisper.js', location.href).href }),
  })!;
  const started = performance.now();
  await dictation.start();
  const { text } = await dictation.stop();
  return { text, ms: Math.round(performance.now() - started), rate: decoded.sampleRate };
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

const run = new URLSearchParams(location.search).get('run');
(run === 'microphone' ? microphone() : clip()).then(finish, (error: unknown) =>
  finish({ error: String((error as { code?: string }).code ?? error) }),
);
