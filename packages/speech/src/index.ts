/**
 * @storystage/speech: whisper.cpp WASM input, speech synthesis output, narration queue.
 *
 * Owner: S7. Workplan: WP14. Spec: `docs/spec/06-speech.md`.
 *
 * WP14.2: voices (`voices.ts`), the sanitiser (`speakable.ts`), the narration queue
 * (`narration.ts`) and the browser's speaker (`browser-speaker.ts`). Speech in (14.1) comes next.
 */
export * from './browser-speaker.ts';
export * from './narration.ts';
export * from './speakable.ts';
export * from './voices.ts';
