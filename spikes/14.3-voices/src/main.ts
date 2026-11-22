/**
 * Spike 14.3: the bundled voices for speak line (decision 0068; docs/spikes/tts-engines.md).
 *
 * Loads Kokoro-82M (8-bit) in ONNX Runtime Web, speaks ten test lines in eight British voices,
 * makes six presets (woman, man, girl, boy, small and big animal) and measures: download size,
 * load time, memory, time to speak each line (real-time factor), and, when whisper is present,
 * how much of each line whisper understood (word error rate). Every clip is on the page to play.
 * Add `?auto=1` to run at once (CI); `?voices=bf_emma` to speak in fewer voices.
 */
import { numbersAsWords, wav, wordErrorRate } from './audio.ts';
import { loadEngine, SAMPLE_RATE } from './kokoro.ts';
import { BRITISH, LINES, PRESETS, VOICES } from './lines.ts';
import { changeVoice } from './voice-fx.ts';
import { loadListener } from './whisper.ts';

const out = document.getElementById('out')!;
const clips = document.getElementById('clips')!;
const say = (t: string) => (out.textContent = t);
const params = new URLSearchParams(location.search);
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const heapMb = () => {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
  return m ? round(m.usedJSHeapSize / 1e6, 1) : null;
};

/** Every clip made, by name, as WAV bytes in base64 for the CI test to save. */
const saved: Record<string, string> = {};
function keep(name: string, label: string, samples: Float32Array) {
  const bytes = wav(samples, SAMPLE_RATE);
  const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }));
  const row = document.createElement('p');
  row.innerHTML = `<span></span><br><audio controls preload="none" src="${url}"></audio>`;
  row.querySelector('span')!.textContent = label;
  clips.append(row);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  saved[name] = btoa(bin);
}

async function run() {
  const voices = params.get('voices')?.split(',') ?? [...VOICES];
  say('Loading Kokoro (86 MB the first time)…');
  const heapBefore = heapMb();
  const engine = await loadEngine(BRITISH);
  const heapLoaded = heapMb();
  say('Loading whisper, if present…');
  const listener = await loadListener().catch(() => null);

  const spoken: unknown[] = [];
  for (const voice of voices) {
    for (const [i, line] of LINES.entries()) {
      say(`${voice}: line ${i + 1} of ${LINES.length}…`);
      const t0 = performance.now();
      const samples = await engine.speak(line, voice);
      const ms = performance.now() - t0;
      const seconds = samples.length / SAMPLE_RATE;
      const heard = listener ? await listener.hear(samples) : null;
      spoken.push({
        voice,
        line,
        phonemes: engine.phonemes(line, voice),
        seconds: round(seconds),
        speakMs: Math.round(ms),
        realTimeFactor: round(ms / 1000 / seconds),
        heard,
        wordErrorRate:
          heard === null ? null : wordErrorRate(numbersAsWords(line), numbersAsWords(heard)),
      });
      if (voice === voices[0] || i === 0) keep(`${voice}-${i + 1}`, `${voice}: ${line}`, samples);
    }
  }

  // The presets, each saying two lines, with whisper's view of the changed voice.
  const presets: unknown[] = [];
  for (const p of PRESETS) {
    for (const line of [LINES[0], LINES[3]]) {
      say(`Preset ${p.label}…`);
      const plain = await engine.speak(line, p.voice);
      const t0 = performance.now();
      const changed = changeVoice(plain, SAMPLE_RATE, p.change);
      const changeMs = performance.now() - t0;
      const heard = listener ? await listener.hear(changed) : null;
      presets.push({
        preset: p.id,
        voice: p.voice,
        change: p.change,
        line,
        changeMs: Math.round(changeMs),
        heard,
        wordErrorRate: heard === null ? null : wordErrorRate(line, heard),
      });
      keep(
        `preset-${p.id}-${line === LINES[0] ? 1 : 4}`,
        `${p.label} (${p.voice}): ${line}`,
        changed,
      );
    }
  }

  const rows = spoken as { realTimeFactor: number; wordErrorRate: number | null; voice: string }[];
  const byVoice = Object.fromEntries(
    voices.map((v) => {
      const r = rows.filter((x) => x.voice === v);
      const wers = r.map((x) => x.wordErrorRate).filter((x): x is number => x !== null);
      return [
        v,
        {
          medianRealTimeFactor: round(
            [...r.map((x) => x.realTimeFactor)].sort((a, b) => a - b)[Math.floor(r.length / 2)]!,
          ),
          meanWordErrorRate: wers.length
            ? round(wers.reduce((a, b) => a + b, 0) / wers.length)
            : null,
        },
      ];
    }),
  );
  const result = {
    userAgent: navigator.userAgent,
    crossOriginIsolated,
    cores: navigator.hardwareConcurrency,
    modelMb: round(engine.modelBytes / 1e6, 1),
    loadMs: engine.loadMs,
    jsHeapMb: { before: heapBefore, loaded: heapLoaded, after: heapMb() },
    whisper: listener !== null,
    byVoice,
    spoken,
    presets,
  };
  say(JSON.stringify({ ...result, spoken: `${spoken.length} lines (below)` }, null, 2));
  (window as unknown as { spikeResult: unknown; spikeClips: unknown }).spikeResult = result;
  (window as unknown as { spikeClips: unknown }).spikeClips = saved;
}

document
  .getElementById('run')!
  .addEventListener('click', () => void run().catch((e) => say(`Failed: ${e}`)));
if (params.has('auto'))
  void run().catch((e) => {
    say(`Failed: ${e instanceof Error ? e.stack : e}`);
    (window as unknown as { spikeResult: unknown }).spikeResult = { error: String(e) };
  });
