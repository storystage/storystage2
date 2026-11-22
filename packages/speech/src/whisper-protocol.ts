/** The messages between the studio and the whisper worker (`docs/spec/06-speech.md` section 1.2). */

export type ToWhisper =
  /** `script` is whisper.cpp's built `main.js`. The model's bytes are transferred, not copied. */
  | {
      readonly type: 'load';
      readonly script: string;
      readonly model: ArrayBuffer;
      readonly threads: number;
      /** Post each stage and whisper's printed lines back, for diagnosing a build. */
      readonly verbose?: boolean;
    }
  /** The audio is transferred too, so no copy stays on the studio's side. */
  | {
      readonly type: 'transcribe';
      readonly id: number;
      readonly audio: Float32Array;
      readonly rate: number;
    };

export type FromWhisper =
  | { readonly type: 'ready' }
  /** Only with `verbose`. */
  | { readonly type: 'log'; readonly line: string }
  | { readonly type: 'text'; readonly id: number; readonly text: string }
  | {
      readonly type: 'error';
      /** The transcription it is about, or `null` for loading. */
      readonly id: number | null;
      readonly code: 'model_failed' | 'out_of_memory' | 'internal';
    };
