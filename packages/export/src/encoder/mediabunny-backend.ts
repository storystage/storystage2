/**
 * The browser backend: WebCodecs for encoding and Mediabunny (MPL-2.0, used unmodified) for the
 * MP4 container, as proved in spike 1.8. Works in Chrome, Safari, WebView2 and WKWebView.
 */
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  Mp4OutputFormat,
  Output,
  QUALITY_HIGH,
  VideoSample,
  VideoSampleSource,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import type { EncoderBackend, EncoderSession, SessionConfig } from './backend.ts';

export const mediabunnyBackend: EncoderBackend = {
  canEncodeVideo: (codec, width, height) =>
    canEncodeVideo(codec, { width, height, bitrate: QUALITY_HIGH }),
  canEncodeAudio: (codec, numberOfChannels, sampleRate) =>
    canEncodeAudio(codec, { numberOfChannels, sampleRate, bitrate: QUALITY_HIGH }),

  async open(config: SessionConfig): Promise<EncoderSession> {
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });
    const video = new VideoSampleSource({
      codec: 'avc',
      bitrate: QUALITY_HIGH,
      keyFrameInterval: config.keyFrameSeconds,
      sizeChangeBehavior: 'deny',
    });
    output.addVideoTrack(video, { frameRate: config.fps });
    const audio = config.audio
      ? new AudioSampleSource({ codec: config.audio.codec, bitrate: QUALITY_HIGH })
      : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();
    const duration = 1 / config.fps;
    return {
      async addFrame(frame, index) {
        const timestamp = index * duration;
        const sample =
          frame.kind === 'canvas'
            ? new VideoSample(frame.canvas, { timestamp, duration })
            : new VideoSample(frame.data, {
                format: 'RGBA',
                codedWidth: frame.width,
                codedHeight: frame.height,
                timestamp,
                duration,
              });
        try {
          await video.add(sample);
        } finally {
          sample.close();
        }
      },
      async addAudio(chunk) {
        if (!audio) return;
        const frames = chunk.channels[0]?.length ?? 0;
        const planar = new Float32Array(frames * chunk.channels.length);
        chunk.channels.forEach((c, i) => planar.set(c, i * frames));
        const sample = new AudioSample({
          data: planar,
          format: 'f32-planar',
          numberOfChannels: chunk.channels.length,
          sampleRate: chunk.sampleRate,
          timestamp: chunk.start,
        });
        try {
          await audio.add(sample);
        } finally {
          sample.close();
        }
      },
      async finish() {
        await output.finalize();
        return output.target.buffer!;
      },
      async cancel() {
        await output.cancel();
      },
    };
  },
};
