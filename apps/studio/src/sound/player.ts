/**
 * Playing part of an imported sound in the studio, for the trim dialog's Play this part and the
 * Sound view's Play (`07-ux.md` section 7.7). Nothing plays until the learner asks. One sound at a
 * time: playing another stops the one before.
 */
import { SOUND_TYPES, type SoundType } from '@storystage/production';

export interface SoundPlayer {
  /** Plays `bytes` from `from` to `to` seconds; `onEnd` is called when it stops by itself. */
  play(bytes: Uint8Array, type: SoundType, from: number, to: number, onEnd: () => void): void;
  stop(): void;
}

/** The type a sound's file name gives (`sn1.mp3`), as `importSound` named it. */
export function typeOfFile(file: string): SoundType {
  const type = file.slice(file.lastIndexOf('.') + 1);
  return Object.hasOwn(SOUND_TYPES, type) ? (type as SoundType) : 'mp3';
}

/** The device's player: an audio element, stopped at `to`. */
export function devicePlayer(): SoundPlayer {
  let playing: { audio: HTMLAudioElement; url: string; timer: number } | null = null;
  const stop = () => {
    if (!playing) return;
    const { audio, url, timer } = playing;
    playing = null;
    window.clearInterval(timer);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    URL.revokeObjectURL(url);
  };
  return {
    play(bytes, type, from, to, onEnd) {
      stop();
      const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: SOUND_TYPES[type] }));
      const audio = new Audio(url);
      const end = () => {
        if (playing?.audio !== audio) return;
        stop();
        onEnd();
      };
      // `timeupdate` comes only a few times a second: a short check stops it nearer `to`.
      const timer = window.setInterval(() => {
        if (audio.currentTime >= to) end();
      }, 25);
      playing = { audio, url, timer };
      audio.onended = end;
      audio.onerror = end;
      audio.currentTime = from;
      audio.play().catch(end);
    },
    stop,
  };
}
