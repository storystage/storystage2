/**
 * The browser's microphone (`docs/spec/06-speech.md` sections 1.5 and 1.6), for dictation. It is
 * open only between `open` and `close`, and `close` stops every track, so the system's microphone
 * light goes off. Samples come from an `AudioWorklet` at the device's rate.
 *
 * The browser objects are passed in, so this is tested without a microphone.
 */
import { DictationError, type Microphone } from './dictation.ts';

export interface MicrophoneBrowser {
  readonly mediaDevices: Pick<MediaDevices, 'getUserMedia'>;
  readonly AudioContext: new () => AudioContext;
  readonly AudioWorkletNode: new (context: AudioContext, name: string) => AudioWorkletNode;
  /** The worklet's file. */
  readonly workletUrl: string;
}

/** What the browser's own error means for the learner (section 1.10). */
export function microphoneError(error: unknown): DictationError {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError')
    return new DictationError('no_microphone');
  if (name === 'NotAllowedError' || name === 'SecurityError')
    return new DictationError('permission_denied');
  return new DictationError('internal');
}

/** The default: the page's own browser, and the worklet beside this file. */
export function defaultMicrophoneBrowser(): MicrophoneBrowser | null {
  const g = globalThis as unknown as Partial<{
    navigator: Navigator;
    AudioContext: new () => AudioContext;
    AudioWorkletNode: new (context: AudioContext, name: string) => AudioWorkletNode;
  }>;
  if (!g.navigator?.mediaDevices || !g.AudioContext || !g.AudioWorkletNode) return null;
  return {
    mediaDevices: g.navigator.mediaDevices,
    AudioContext: g.AudioContext,
    AudioWorkletNode: g.AudioWorkletNode,
    workletUrl: new URL('./mic-worklet.js', import.meta.url).href,
  };
}

export function browserMicrophone(browser: MicrophoneBrowser): Microphone {
  let stream: MediaStream | null = null;
  let context: AudioContext | null = null;
  let node: AudioWorkletNode | null = null;

  const close = () => {
    if (node) {
      node.port.onmessage = null;
      node.disconnect();
    }
    for (const track of stream?.getTracks() ?? []) track.stop();
    void context?.close().catch(() => {});
    stream = null;
    context = null;
    node = null;
  };

  return {
    async open(onSamples) {
      close();
      try {
        stream = await browser.mediaDevices.getUserMedia({
          audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
        });
      } catch (error) {
        throw microphoneError(error);
      }
      try {
        context = new browser.AudioContext();
        await context.audioWorklet.addModule(browser.workletUrl);
        node = new browser.AudioWorkletNode(context, 'storystage-microphone');
        const rate = context.sampleRate;
        node.port.onmessage = (event: MessageEvent<Float32Array[]>) => onSamples(event.data, rate);
        context.createMediaStreamSource(stream).connect(node);
      } catch {
        close();
        throw new DictationError('internal');
      }
    },
    close,
  };
}
