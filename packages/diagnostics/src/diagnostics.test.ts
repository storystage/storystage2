import { BROWSER_POLICY } from '@storystage/host';
import { afterEach, describe, expect, it } from 'vitest';
import enGB from './strings/en-GB.json' with { type: 'json' };
import {
  LINE_LENGTH,
  LOG_LINES,
  ProblemLog,
  problemLog,
  startProblemLog,
  stopProblemLog,
  type LogScope,
} from './log.ts';
import { problemReport, reportName, type Environment } from './report.ts';
import { scrub } from './scrub.ts';

// Key-shaped strings are made at run time, never written out (CLAUDE.md, the key rule).
const KEY = ['sk', 'ant', 'api03', 'x'.repeat(16) + '9Q'].join('-');
const TOKEN = ['a1B2', 'c3D4'.repeat(9)].join('');

describe('scrub', () => {
  it('takes out keys and key-shaped tokens', () => {
    expect(scrub(`sent ${KEY} to the server`)).toBe('sent (hidden) to the server');
    expect(scrub(`token=${TOKEN}`)).toBe('token=(hidden)');
    expect(scrub('Frame 12 came out empty after 3000 ms')).toBe(
      'Frame 12 came out empty after 3000 ms',
    );
  });

  it('takes out email addresses, user names in paths, and queries', () => {
    expect(scrub('from sam.jones@school.example.org')).toBe('from (an email address)');
    expect(scrub('C:\\Users\\SamJones\\Documents\\film.storystage')).toBe(
      'C:\\Users\\…\\Documents\\film.storystage',
    );
    expect(scrub('/home/sam/x and /Users/ana/y')).toBe('/home/…/x and /Users/…/y');
    expect(scrub('https://studio.test/speech/kokoro/a.bin?sha256=abc#x failed')).toBe(
      'https://studio.test/speech/kokoro/a.bin failed',
    );
  });

  it('takes out pupils’ names, whole words only, longest first, in any case', () => {
    const names = ['Ana', 'Ana Maria', 'Zoë', 'J'];
    expect(scrub('Ana Maria’s film, and ANA’s, and zoë’s', names)).toBe(
      '(a name)’s film, and (a name)’s, and (a name)’s',
    );
    // Not inside other words, and a one-letter name is left.
    expect(scrub('Banana and Jam', names)).toBe('Banana and Jam');
  });
});

describe('the problem log', () => {
  afterEach(() => stopProblemLog());

  it('keeps errors and warnings, scrubbed, the newest 200, each cut to length', () => {
    let now = 0;
    const log = new ProblemLog(() => now);
    now = 1500;
    log.add('error', [new Error(`key ${KEY} leaked`)]);
    log.add('warning', ['slow', { ms: 900 }]);
    expect(log.lines()).toEqual([
      { at: 1.5, kind: 'error', text: 'Error: key (hidden) leaked' },
      { at: 1.5, kind: 'warning', text: 'slow {"ms":900}' },
    ]);
    for (let i = 0; i < LOG_LINES + 5; i++) log.add('error', [`line ${i} ${'x'.repeat(600)}`]);
    expect(log.lines()).toHaveLength(LOG_LINES);
    expect(log.lines()[0]!.text.startsWith('line 5 ')).toBe(true);
    expect(log.lines()[0]!.text).toHaveLength(LINE_LENGTH);
  });

  it('watches console.error, console.warn and uncaught errors, and still passes them on', () => {
    const shown: string[] = [];
    const listeners = new Map<string, (e: unknown) => void>();
    const scope: LogScope = {
      console: {
        error: (...p: unknown[]) => void shown.push(`error ${p.join(' ')}`),
        warn: (...p: unknown[]) => void shown.push(`warn ${p.join(' ')}`),
      },
      addEventListener: (type, l) => void listeners.set(type, l),
      removeEventListener: (type) => void listeners.delete(type),
    };
    const log = startProblemLog(scope);
    expect(problemLog()).toBe(log);
    expect(startProblemLog(scope)).toBe(log);
    scope.console.error('It broke');
    scope.console.warn('It was slow');
    listeners.get('error')!({ message: 'Script error', error: new TypeError('x is undefined') });
    listeners.get('unhandledrejection')!({ reason: new Error('no WebGL') });
    expect(shown).toEqual(['error It broke', 'warn It was slow']);
    expect(log.lines().map((l) => `${l.kind}: ${l.text}`)).toEqual([
      'error: It broke',
      'warning: It was slow',
      'error: TypeError: x is undefined',
      'error: Error: no WebGL',
    ]);
    stopProblemLog();
    expect(listeners.size).toBe(0);
    expect(problemLog()).toBeNull();
  });
});

describe('the problem report', () => {
  const environment: Environment = {
    userAgent: 'Mozilla/5.0 (X11; CrOS x86_64) Chrome/142.0',
    language: 'en-GB',
    screen: { width: 1366, height: 768, scale: 1 },
    crossOriginIsolated: false,
    webgl2: true,
    webgpu: false,
    encoder: true,
  };

  it('says what it holds, plainly, and ends with the recent problems', () => {
    const text = problemReport({
      when: '2026-11-14T20:00:00.000Z',
      version: null,
      build: 'abc1234',
      environment,
      policy: BROWSER_POLICY,
      selftest: '7 of 7 checks passed (14.0 s).\n\nSELFTEST PASS',
      problems: [{ at: 3.2, kind: 'error', text: 'Speak line was closed.' }],
    });
    expect(text).toMatch(/^StoryStage problem report, made 2026-11-14T20:00:00.000Z\n/);
    for (const line of [
      'StoryStage: the browser version',
      'Build: abc1234',
      'Can make an MP4 here: yes',
      'Cross-origin isolated (needed for speech): no',
      'prompter.level: off',
      'The school set: nothing',
      'SELFTEST PASS',
      '3.2 s, error: Speak line was closed.',
    ])
      expect(text).toContain(line);
  });

  it('holds no key and no pupil’s name, wherever they came from', () => {
    const text = problemReport({
      when: '2026-11-14T20:00:00.000Z',
      version: '2.0.0',
      environment,
      policy: { ...BROWSER_POLICY, diagnostic: `line 3: ${KEY} isn't a setting` },
      selftest: 'Sam’s film opened differently',
      problems: [{ at: 1, kind: 'warning', text: 'Saving Sam’s film' }],
      names: ['Sam'],
    });
    expect(text).not.toContain(KEY);
    expect(text).not.toMatch(/\bSam\b/);
    expect(text).toContain('(a name)’s film opened differently');
  });

  it('says so when nothing was kept, or nothing went wrong, or the self-test wasn’t run', () => {
    const base = {
      when: '2026-11-14T20:00:00.000Z',
      version: null,
      environment,
      policy: BROWSER_POLICY,
    };
    expect(problemReport({ ...base, selftest: null, problems: [] })).toContain(
      'None since StoryStage started.',
    );
    const none = problemReport({ ...base, selftest: null, problems: null });
    expect(none).toContain('Problems aren’t being kept on this page.');
    expect(none).toContain('The self-test wasn’t run.');
  });

  it('gives the start-up timings and memory, saying where the browser doesn’t', () => {
    const base = {
      when: '2026-11-14T20:00:00.000Z',
      version: null,
      policy: BROWSER_POLICY,
      selftest: null,
      problems: [],
    };
    const text = problemReport({
      ...base,
      environment: {
        ...environment,
        timings: { firstPaintMs: 412, interactiveMs: 380, heapMb: null },
      },
    });
    expect(text).toContain('== Timings on this device ==');
    expect(text).toContain('First paint: 412 ms after the page started to load');
    expect(text).toContain('JavaScript memory in use: this browser doesn’t say');
    expect(problemReport({ ...base, environment })).not.toContain('Timings on this device');
  });

  it('names its file by the date only', () => {
    expect(reportName('2026-11-14T20:00:00.000Z')).toBe('StoryStage problem report 2026-11-14.txt');
  });

  it('has no empty phrase, and only plain {name} gaps', () => {
    for (const [key, phrase] of Object.entries(enGB)) {
      expect(phrase.trim(), key).not.toBe('');
      expect(phrase.replace(/\{\w+\}/g, ''), key).not.toMatch(/[{}]/);
    }
  });
});
