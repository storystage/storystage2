/**
 * Dictation in the app (`docs/spec/06-speech.md` section 1.11): `createDictation` with the
 * browser's microphone, the whisper worker, and the window telling it when it loses focus.
 */
import type { SpeechModelName, SpeechModels } from '@storystage/host';
import { createDictation, type AwayWatcher, type Dictation } from './dictation.ts';
import { browserMicrophone, defaultMicrophoneBrowser } from './microphone.ts';
import { whisperRecogniser } from './worker-recogniser.ts';

export interface BrowserDictationOptions {
  /** whisper.cpp's built `main.js`, served by the app itself (`scripts/build-whisper.sh`). */
  readonly whisperScript: string;
  /** The learner's model choice. */
  readonly model?: () => SpeechModelName;
}

/** Calls `onAway` when the page is hidden or the window loses focus (section 1.5). */
export const pageAway: AwayWatcher = (onAway) => {
  const g = globalThis as unknown as Partial<{ document: Document; window: Window }>;
  const hidden = () => {
    if (g.document?.visibilityState === 'hidden') onAway();
  };
  g.document?.addEventListener('visibilitychange', hidden);
  g.window?.addEventListener('blur', onAway);
  return () => {
    g.document?.removeEventListener('visibilitychange', hidden);
    g.window?.removeEventListener('blur', onAway);
  };
};

/** The studio's one `Dictation`, or `null` where there is no speech or no microphone. */
export function createBrowserDictation(
  speech: SpeechModels | null,
  options: BrowserDictationOptions,
): Dictation | null {
  const browser = defaultMicrophoneBrowser();
  if (!speech || !browser) return null;
  return createDictation(speech, {
    microphone: browserMicrophone(browser),
    recogniser: whisperRecogniser({ script: options.whisperScript }),
    away: pageAway,
    ...(options.model ? { model: options.model } : {}),
  });
}
