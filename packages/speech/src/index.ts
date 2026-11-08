/**
 * @storystage/speech: whisper.cpp WASM input, speech synthesis output, narration queue.
 *
 * Owner: S7. Workplan: WP14. Spec: `docs/spec/06-speech.md`.
 *
 * WP14.2: voices (`voices.ts`), the sanitiser (`speakable.ts`), the narration queue
 * (`narration.ts`) and the browser's speaker (`browser-speaker.ts`). WP14.1: dictation
 * (`dictation.ts`), with audio for whisper (`resample.ts`) and cleaning what it hears
 * (`transcript.ts`). The browser's microphone and the whisper worker come next.
 */
export * from './browser-speaker.ts';
export * from './dictation.ts';
export * from './narration.ts';
export * from './resample.ts';
export * from './speakable.ts';
export * from './transcript.ts';
export * from './voices.ts';
