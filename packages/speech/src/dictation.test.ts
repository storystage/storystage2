import { describe, expect, it } from 'vitest';
import { SpeechModelError, type SpeechModelName, type SpeechModels } from '@storystage/host';
import {
  DICTATION_ERROR_CODES,
  DICTATION_MESSAGES,
  DictationError,
  IDLE_MS,
  MAX_TAKE_MS,
  createDictation,
  micShown,
  type Clock,
  type DictationOptions,
  type DictationState,
  type Recogniser,
} from './dictation.ts';

const RATE = 48_000;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function fakeClock() {
  let now = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  let next = 1;
  const clock: Clock = {
    setTimeout: (run, ms) => {
      const id = next++;
      timers.set(id, { at: now + ms, run });
      return id;
    },
    clearTimeout: (id) => timers.delete(id as number),
  };
  const advance = (ms: number) => {
    now += ms;
    for (const [id, t] of [...timers])
      if (t.at <= now) {
        timers.delete(id);
        t.run();
      }
  };
  return { clock, advance };
}

function setUp(overrides: Partial<DictationOptions> = {}, said = 'Make the owl fly.') {
  const mic = { open: 0, close: 0, feed: (_s: number) => {} };
  const loaded: SpeechModelName[] = [];
  const heard: Float32Array[] = [];
  let ended = 0;
  let transcribe = async (audio: Float32Array) => {
    heard.push(audio);
    return said;
  };
  const speech: SpeechModels = {
    list: async () => [],
    load: async (name) => {
      loaded.push(name);
      if (name === 'tiny.en') throw new SpeechModelError('not_downloaded');
      return new ArrayBuffer(8);
    },
    download: async () => {},
    remove: async () => {},
  };
  const recogniser = async (): Promise<Recogniser> => ({
    transcribe: (audio) => transcribe(audio),
    end: () => {
      ended += 1;
    },
  });
  const { clock, advance } = fakeClock();
  let away: () => void = () => {};
  const dictation = createDictation(speech, {
    microphone: {
      open: async (onSamples) => {
        mic.open += 1;
        mic.feed = (seconds) =>
          onSamples([new Float32Array(Math.round(RATE * seconds)).fill(0.1)], RATE);
      },
      close: () => {
        mic.close += 1;
      },
    },
    recogniser,
    clock,
    away: (onAway) => {
      away = onAway;
      return () => {};
    },
    ...overrides,
  })!;
  const states: DictationState['phase'][] = [];
  dictation.state.subscribe((s) => {
    if (states.at(-1) !== s.phase) states.push(s.phase);
  });
  return {
    dictation,
    mic,
    loaded,
    heard,
    states,
    advance,
    goAway: () => away(),
    ended: () => ended,
    setTranscribe: (f: typeof transcribe) => (transcribe = f),
  };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return 'none';
  } catch (e) {
    return e instanceof DictationError ? e.code : 'not a DictationError';
  }
};

describe('createDictation (spec 06, section 1.11)', () => {
  it('gives nothing where speech is not allowed, so a field has no mic', () => {
    expect(createDictation(null, setUpOptions())).toBeNull();
  });

  it('listens between start and stop, and gives back the words', async () => {
    const { dictation, mic, states } = setUp();
    await dictation.start();
    expect(dictation.state.get().phase).toBe('listening');
    mic.feed(2);
    expect(dictation.state.get().level).toBeGreaterThan(0);
    expect(await dictation.stop()).toEqual({ text: 'Make the owl fly.' });
    expect(mic).toMatchObject({ open: 1, close: 1 });
    expect(states).toEqual(['listening', 'working', 'idle']);
  });

  it('cleans what whisper heard before giving it back', async () => {
    const { dictation, mic } = setUp({}, '[BLANK_AUDIO] The cat jumps. The cat jumps.');
    await dictation.start();
    mic.feed(1);
    expect(await dictation.stop()).toEqual({ text: 'The cat jumps.' });
  });

  it('zeroes the audio once it has been heard (rule 3)', async () => {
    const { dictation, mic, heard } = setUp();
    await dictation.start();
    mic.feed(1);
    await dictation.stop();
    expect(heard[0]!.length).toBe(RATE);
    expect(heard[0]!.every((s) => s === 0)).toBe(true);
  });
});

describe('takes (spec 06, section 1.5)', () => {
  it('runs one take at a time', async () => {
    const { dictation } = setUp();
    await dictation.start();
    expect(await codeOf(dictation.start())).toBe('busy');
  });

  it('stops listening by itself at 30 seconds, and stop collects the words', async () => {
    const { dictation, mic, advance } = setUp();
    await dictation.start();
    mic.feed(30);
    advance(MAX_TAKE_MS);
    expect(mic.close).toBe(1);
    expect(dictation.state.get().phase).not.toBe('listening');
    expect(await dictation.stop()).toEqual({ text: 'Make the owl fly.' });
  });

  it('lets the microphone go when the window loses focus, keeping the words', async () => {
    const { dictation, mic, goAway } = setUp();
    await dictation.start();
    mic.feed(2);
    goAway();
    expect(mic.close).toBe(1);
    expect(await dictation.stop()).toEqual({ text: 'Make the owl fly.' });
  });

  it('throws the audio away on cancel, and gives no words', async () => {
    const { dictation, mic, heard } = setUp();
    await dictation.start();
    mic.feed(2);
    dictation.cancel();
    expect(mic.close).toBe(1);
    expect(dictation.state.get()).toEqual({ phase: 'idle', level: 0 });
    expect(await codeOf(dictation.stop())).toBe('cancelled');
    expect(heard).toEqual([]);
  });

  it('drops the words of a take cancelled while they were being worked out', async () => {
    const { dictation, mic, setTranscribe } = setUp();
    let finish: (text: string) => void = () => {};
    setTranscribe(() => new Promise((resolve) => (finish = resolve)));
    await dictation.start();
    mic.feed(2);
    const words = dictation.stop();
    await flush();
    dictation.cancel();
    finish('Too late.');
    expect(await codeOf(words)).toBe('cancelled');
  });

  it("doesn't transcribe a take under half a second", async () => {
    const { dictation, mic, heard } = setUp();
    await dictation.start();
    mic.feed(0.2);
    expect(await codeOf(dictation.stop())).toBe('too_short');
    expect(heard).toEqual([]);
    expect(dictation.state.get().phase).toBe('idle');
  });

  it('says when nothing was heard', async () => {
    const { dictation, mic } = setUp({}, '[BLANK_AUDIO]');
    await dictation.start();
    mic.feed(1);
    expect(await codeOf(dictation.stop())).toBe('nothing_heard');
  });

  it('passes on the microphone being missing or refused, and goes back to idle', async () => {
    for (const code of ['no_microphone', 'permission_denied'] as const) {
      const { dictation } = setUp({
        microphone: { open: () => Promise.reject(new DictationError(code)), close: () => {} },
      });
      expect(await codeOf(dictation.start())).toBe(code);
      expect(dictation.state.get().phase).toBe('idle');
    }
  });
});

describe('the model and the worker (spec 06, sections 1.3, 1.8)', () => {
  it('uses the bundled model when the chosen one is not downloaded', async () => {
    const { dictation, mic, loaded } = setUp({ model: () => 'tiny.en' });
    await dictation.start();
    mic.feed(1);
    await dictation.stop();
    expect(loaded).toEqual(['tiny.en', 'tiny.en-q5_1']);
  });

  it('says the model failed when it would not load, and tries again next take', async () => {
    let loads = 0;
    const broken: SpeechModels = {
      list: async () => [],
      load: () => {
        loads += 1;
        return Promise.reject(new SpeechModelError('check_failed'));
      },
      download: async () => {},
      remove: async () => {},
    };
    // A microphone that hears a second of sound as soon as it opens.
    const dictation = createDictation(broken, {
      ...setUpOptions(),
      microphone: {
        open: async (onSamples) => onSamples([new Float32Array(RATE).fill(0.1)], RATE),
        close: () => {},
      },
    })!;
    await dictation.start();
    expect(await codeOf(dictation.stop())).toBe('model_failed');
    expect(dictation.state.get().phase).toBe('idle');
    await dictation.start();
    expect(await codeOf(dictation.stop())).toBe('model_failed');
    expect(loads).toBe(2);
  });

  it('ends the worker 30 seconds after the last take, and starts one again when needed', async () => {
    const { dictation, mic, advance, ended, loaded } = setUp();
    await dictation.start();
    mic.feed(1);
    await dictation.stop();
    advance(IDLE_MS - 1);
    expect(ended()).toBe(0);
    advance(1);
    await flush();
    expect(ended()).toBe(1);
    await dictation.start();
    mic.feed(1);
    await dictation.stop();
    expect(loaded).toHaveLength(2);
  });

  it('ends the worker at once when the page is hidden between takes', async () => {
    const { dictation, mic, goAway, ended } = setUp();
    await dictation.start();
    mic.feed(1);
    await dictation.stop();
    goAway();
    await flush();
    expect(ended()).toBe(1);
  });

  it('starts a new worker after the system ended one for lack of memory', async () => {
    const { dictation, mic, setTranscribe, loaded } = setUp();
    setTranscribe(() => Promise.reject(new DictationError('out_of_memory')));
    await dictation.start();
    mic.feed(1);
    expect(await codeOf(dictation.stop())).toBe('out_of_memory');
    setTranscribe(async () => 'Back again.');
    await dictation.start();
    mic.feed(1);
    expect(await dictation.stop()).toEqual({ text: 'Back again.' });
    expect(loaded).toHaveLength(2);
  });
});

describe('errors (spec 06, section 1.10)', () => {
  it('has words for each code, or none where the studio says nothing', () => {
    for (const code of DICTATION_ERROR_CODES) {
      const words = DICTATION_MESSAGES[code];
      if (code === 'busy' || code === 'cancelled') expect(words).toBeNull();
      else expect(words).toMatch(/\.$/);
      expect(new DictationError(code).code).toBe(code);
    }
  });

  it('never apologises, and never uses the words rule 9 keeps from learners', () => {
    for (const words of Object.values(DICTATION_MESSAGES))
      if (words) {
        expect(words).not.toMatch(/sorry|apolog/i);
        expect(words).not.toMatch(/\b(AST|node|token|schema|API)\b/);
      }
  });
});

describe('micShown (spec 06, section 1.1)', () => {
  const speech = {} as SpeechModels;
  const all = { speech, crossOriginIsolated: true, talkToType: true };

  it('shows the mic only when speech is allowed, the page is isolated and Talk to type is on', () => {
    expect(micShown(all)).toBe(true);
    expect(micShown({ ...all, speech: null })).toBe(false);
    expect(micShown({ ...all, crossOriginIsolated: false })).toBe(false);
    expect(micShown({ ...all, talkToType: false })).toBe(false);
  });

  it("needs prompter.voiceInput for the Prompter's input, and nowhere else", () => {
    expect(micShown({ ...all, prompterVoiceInput: false })).toBe(false);
    expect(micShown({ ...all, prompterVoiceInput: true })).toBe(true);
  });
});

function setUpOptions(): DictationOptions {
  return {
    microphone: { open: async () => {}, close: () => {} },
    recogniser: async () => ({ transcribe: async () => 'x', end: () => {} }),
    clock: fakeClock().clock,
  };
}
