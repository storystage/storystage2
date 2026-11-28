/**
 * Decodes a sound file for the export's mix (spec 08 section 4; decision 0076), with the
 * browser's own decoder on an offline context at the film's 48 kHz, so the mix needs no further
 * resampling. A device that can't decode it, or has no Web Audio, gives `null`: that sound is
 * silent in the film, and the export dialog counts it.
 */
import { TRACK_RATE } from '@storystage/export';
import type { DecodeSound } from '@storystage/screening';

export const decodeForExport: DecodeSound = async (bytes) => {
  if (typeof OfflineAudioContext === 'undefined') return null;
  const context = new OfflineAudioContext(1, 1, TRACK_RATE);
  // `decodeAudioData` takes its buffer over, so it's given a copy.
  const buffer = await context.decodeAudioData(bytes.slice().buffer);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) =>
    buffer.getChannelData(i),
  );
  return { channels, sampleRate: buffer.sampleRate };
};
