// The microphone's audio worklet (`docs/spec/06-speech.md` section 1.6). It runs on the audio
// thread and posts a copy of each block of input to the page, one array per channel. Plain
// JavaScript, because `audioWorklet.addModule` loads it as a file, and the app's content security
// policy allows scripts only from the app itself (no `blob:` URLs).

/* global AudioWorkletProcessor, registerProcessor -- the audio thread's own scope */

class StoryStageMicrophone extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length > 0) this.port.postMessage(input.map((channel) => channel.slice()));
    return true;
  }
}

registerProcessor('storystage-microphone', StoryStageMicrophone);
