/**
 * Add music… (`07-ux.md` section 7.7): the film's sounds by name, each with Play and Stop and Add,
 * and Import a sound…. The cue starts at the playhead and plays the whole trimmed sound. The
 * Backstage shelf's sounds join the list when it has them (S4, 11.7).
 */
import type { SoundClip } from '@storystage/production';
import { Button, Dialog } from '@storystage/ui';
import { useEffect, useState } from 'react';
import { words } from '../strings.ts';
import type { FilmSounds } from './filmSounds.ts';
import { trimmedOf } from './music.ts';
import { typeOfFile, type SoundPlayer } from './player.ts';
import { secondsWords } from './TrimDialog.tsx';
import './sound.css';

export interface AddMusicProps {
  readonly clips: readonly SoundClip[];
  readonly sounds: FilmSounds;
  readonly player: SoundPlayer;
  /** The playhead, where the cue starts. */
  readonly start: number;
  /** The scene has all the music it can hold. */
  readonly full: boolean;
  /** Why the last Add was refused, shown in the dialog. */
  readonly refusal: string | null;
  readonly onAdd: (clip: SoundClip) => void;
  readonly onImport: () => void;
  readonly onClose: () => void;
}

export function AddMusic(props: AddMusicProps) {
  const { clips, sounds, player, start, full, refusal, onAdd, onImport, onClose } = props;
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => player.stop(), [player]);
  const stop = () => {
    player.stop();
    setPlaying(null);
  };
  const usable = clips.filter((c) => sounds.bytes(c));

  return (
    <Dialog
      isOpen
      title={words.t('sound.music.addTitle')}
      icon="music_note"
      width={560}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          stop();
          onClose();
        }
      }}
    >
      <div className="sd-add-music">
        {full ? (
          <p className="sd-refusal">{words.t('sound.music.fullAdd')}</p>
        ) : (
          <p className="sd-note">{words.t('sound.music.addAt', { time: secondsWords(start) })}</p>
        )}
        {refusal !== null && !full && <p className="sd-refusal">{refusal}</p>}
        {usable.length === 0 ? (
          <p className="sd-note">{words.t('sound.music.noSounds')}</p>
        ) : (
          <ul className="sd-list" aria-label={words.t('sound.film.title')}>
            {usable.map((clip) => {
              const bytes = sounds.bytes(clip)!;
              return (
                <li key={clip.id} className="sd-row">
                  <span className="sd-name">{clip.label}</span>
                  <span className="sd-length">{secondsWords(trimmedOf(clip))}</span>
                  <span className="sd-row-actions">
                    {playing === clip.id ? (
                      <Button
                        variant="quiet"
                        icon="stop"
                        aria-label={words.t('sound.stopNamed', { name: clip.label })}
                        onPress={stop}
                      >
                        {words.t('sound.stop')}
                      </Button>
                    ) : (
                      <Button
                        variant="quiet"
                        icon="play_arrow"
                        aria-label={words.t('sound.playNamed', { name: clip.label })}
                        onPress={() => {
                          setPlaying(clip.id);
                          player.play(
                            bytes,
                            typeOfFile(clip.file),
                            clip.trim.start,
                            clip.trim.end,
                            () => setPlaying((now) => (now === clip.id ? null : now)),
                          );
                        }}
                      >
                        {words.t('sound.play')}
                      </Button>
                    )}
                    <Button
                      variant="secondary"
                      icon="add"
                      isDisabled={full}
                      aria-label={words.t('sound.music.addNamed', { name: clip.label })}
                      onPress={() => {
                        stop();
                        onAdd(clip);
                      }}
                    >
                      {words.t('sound.music.addOne')}
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <div className="sd-actions">
          <Button
            variant="secondary"
            icon="upload_file"
            isDisabled={full}
            onPress={() => {
              stop();
              onImport();
            }}
          >
            {words.t('sound.import')}
          </Button>
          <Button
            variant="quiet"
            onPress={() => {
              stop();
              onClose();
            }}
          >
            {words.t('sound.cancel')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
