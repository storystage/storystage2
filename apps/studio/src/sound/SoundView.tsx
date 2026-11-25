/**
 * The Sound view (`07-ux.md` section 7.7; decision 0076, workplan 7.17), behind the Code | Sound
 * switch: the tracks' **Volumes**, for the whole film, and **Sounds in this film**, the learner's
 * imported sounds, each with the length it plays, Play and Remove…, and Import a sound…, which
 * opens the trim dialog. The music timeline joins them next.
 */
import type { NodeId } from '@storystage/ast';
import {
  importSound,
  SOUND_ACCEPT,
  SOUND_LIMITS,
  withoutSound,
  withSound,
  type SceneId,
  type SoundClip,
} from '@storystage/production';
import { soundUses } from '@storystage/story-api/editing';
import { Button, Dialog } from '@storystage/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { acceptFor } from '../fileInputs.ts';
import { codeTabs, methodHolding } from '../production/CodeEditor.tsx';
import { sceneNumber } from '../storyboard/edits.ts';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import { freeLabel, type FilmSounds } from './filmSounds.ts';
import { devicePlayer, typeOfFile, type SoundPlayer } from './player.ts';
import { DEVICE_READING, readSound, type SoundReading } from './readSound.ts';
import { secondsWords, TrimDialog } from './TrimDialog.tsx';
import { Volumes } from './Volumes.tsx';
import './sound.css';

/** Bars in the trim dialog's waveform. */
const WAVEFORM_BARS = 240;
const MB = 1024 * 1024;

export interface SoundViewProps {
  readonly studio: Studio;
  /** The film can't be changed: its sounds play, and nothing changes them. */
  readonly readOnly: boolean;
  readonly sounds: FilmSounds;
  readonly onAnnounce: (text: string) => void;
  /** Go to the block: Code, in `scene`, open at `node`. */
  readonly onGoToBlock: (scene: SceneId, node: NodeId) => void;
  /** The device's own, unless a test gives others. */
  readonly player?: SoundPlayer;
  readonly reading?: SoundReading;
}

/** A picked file, read and waiting in the trim dialog. */
interface Trimming {
  readonly clip: SoundClip;
  readonly bytes: Uint8Array;
  readonly peaks: Float32Array | null;
}

/** Why a sound can't be removed yet, beside its row. */
interface Held {
  readonly id: string;
  readonly message: string;
  readonly scene: SceneId;
  readonly node: NodeId;
}

export function SoundView({
  studio,
  readOnly,
  sounds,
  onAnnounce,
  onGoToBlock,
  player: given,
  reading = DEVICE_READING,
}: SoundViewProps) {
  const player = useMemo(() => given ?? devicePlayer(), [given]);
  const p = studio.production;
  const clips = p.manifest.sounds ?? [];
  const input = useRef<HTMLInputElement>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [trimming, setTrimming] = useState<Trimming | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [asking, setAsking] = useState<{ clip: SoundClip; scenes: number[] } | null>(null);
  // The production as the last change left it, for a pick read after the learner moved on.
  const latest = useRef(p);
  useEffect(() => {
    latest.current = p;
  });
  useEffect(() => () => player.stop(), [player]);

  const used = clips.reduce((sum, c) => sum + c.bytes, 0);

  const refuse = (message: string) => {
    setRefusal(message);
    onAnnounce(message);
  };

  const pick = async (file: File) => {
    setRefusal(null);
    setHeld(null);
    setPicked(file.name);
    const read = readSound(reading);
    const result = await importSound(
      latest.current,
      {
        name: file.name,
        size: file.size,
        read: async () => new Uint8Array(await file.arrayBuffer()),
      },
      read.measure,
    ).finally(() => setPicked(null));
    if (!result.ok) return refuse(result.message);
    const now = latest.current;
    const clip = sounds.fresh(result.clip, now);
    // One sound at a time: the dialog plays its own.
    stop();
    setTrimming({
      clip: { ...clip, label: freeLabel(clip.label, now, SOUND_LIMITS.label) },
      bytes: result.bytes,
      peaks: read.peaks(WAVEFORM_BARS),
    });
  };

  const add = (chosen: SoundClip, bytes: Uint8Array) => {
    const now = latest.current;
    const clip = { ...chosen, label: freeLabel(chosen.label, now, SOUND_LIMITS.label) };
    sounds.add(clip, bytes);
    studio.commit(words.t('sound.step.add', { name: clip.label }), withSound(now, clip));
    setTrimming(null);
    onAnnounce(words.t('sound.added', { name: clip.label }));
  };

  const remove = (clip: SoundClip) => {
    studio.commit(
      words.t('sound.step.remove', { name: clip.label }),
      withoutSound(latest.current, clip.id),
    );
    if (playing === clip.id) stop();
    setAsking(null);
    onAnnounce(words.t('sound.removed', { name: clip.label }));
  };

  const askRemove = (clip: SoundClip) => {
    setRefusal(null);
    const played = whereCodePlays(clip.id);
    if (played) {
      const message = words.t('sound.inCode', {
        name: clip.label,
        n: sceneNumber(p, played.scene),
      });
      setHeld({ id: clip.id, message, ...played });
      onAnnounce(message);
      return;
    }
    setHeld(null);
    const scenes = p.scenes
      .filter((s) => s.music?.some((cue) => cue.sound === clip.id))
      .map((s) => sceneNumber(p, s.id));
    if (scenes.length > 0) setAsking({ clip, scenes });
    else remove(clip);
  };

  /** The first scene whose code plays `id`, and where. */
  const whereCodePlays = (id: string): { scene: SceneId; node: NodeId } | null => {
    const uses = soundUses(p.program, id);
    for (const node of uses)
      for (const s of p.scenes)
        if (methodHolding(p, codeTabs(p, s.id), node) !== null) return { scene: s.id, node };
    return null;
  };

  const stop = () => {
    player.stop();
    setPlaying(null);
  };

  return (
    <section className="sd-view" aria-label={words.t('sound.region')}>
      <Volumes studio={studio} readOnly={readOnly} />
      <h3 className="sd-heading" id="sd-film-title">
        {words.t('sound.film.title')}
      </h3>
      {clips.length === 0 ? (
        <p className="sd-note">{words.t('sound.film.none')}</p>
      ) : (
        <>
          <ul className="sd-list" aria-labelledby="sd-film-title">
            {clips.map((clip) => {
              const bytes = sounds.bytes(clip);
              return (
                <li key={clip.id} className="sd-row">
                  <span className="sd-name">{clip.label}</span>
                  <span className="sd-length">
                    {bytes
                      ? secondsWords(clip.trim.end - clip.trim.start)
                      : words.t('sound.missing')}
                  </span>
                  <span className="sd-row-actions">
                    {bytes &&
                      (playing === clip.id ? (
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
                      ))}
                    {!readOnly && (
                      <Button
                        variant="quiet"
                        icon="delete"
                        aria-label={words.t('sound.removeNamed', { name: clip.label })}
                        onPress={() => askRemove(clip)}
                      >
                        {words.t('sound.remove')}
                      </Button>
                    )}
                  </span>
                  {held?.id === clip.id && (
                    <div className="sd-held">
                      <p>{held.message}</p>
                      <Button
                        variant="secondary"
                        icon="arrow_forward"
                        onPress={() => onGoToBlock(held.scene, held.node)}
                      >
                        {words.t('sound.goToBlock')}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="sd-note">
            {words.t('sound.film.used', {
              used: (Math.round((used / MB) * 10) / 10).toString(),
              limit: String(SOUND_LIMITS.totalBytes / MB),
            })}
          </p>
        </>
      )}
      {!readOnly && (
        <div className="sd-import">
          <Button
            variant="secondary"
            icon="music_note"
            isDisabled={picked !== null}
            onPress={() => input.current?.click()}
          >
            {words.t('sound.import')}
          </Button>
          <input
            ref={input}
            type="file"
            hidden
            accept={acceptFor(SOUND_ACCEPT)}
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) void pick(file);
            }}
          />
          {picked !== null && (
            <p className="sd-note">{words.t('sound.reading', { name: picked })}</p>
          )}
          {refusal !== null && <p className="sd-refusal">{refusal}</p>}
        </div>
      )}
      {trimming && (
        <TrimDialog
          clip={trimming.clip}
          bytes={trimming.bytes}
          peaks={trimming.peaks}
          player={player}
          onAdd={(clip) => add(clip, trimming.bytes)}
          onCancel={() => setTrimming(null)}
        />
      )}
      {asking && (
        <Dialog
          isOpen
          title={words.t('sound.removeAsk.title', { name: asking.clip.label })}
          icon="delete"
          width={520}
          onOpenChange={(isOpen) => {
            if (!isOpen) setAsking(null);
          }}
        >
          <p>
            {words.plural('sound.removeAsk.music', asking.scenes.length, {
              scenes: new Intl.ListFormat('en-GB', { type: 'conjunction' }).format(
                asking.scenes.map(String),
              ),
            })}
          </p>
          <div className="sd-actions">
            <Button variant="primary" icon="delete" onPress={() => remove(asking.clip)}>
              {words.t('sound.removeAsk.remove')}
            </Button>
            <Button variant="secondary" onPress={() => setAsking(null)}>
              {words.t('sound.cancel')}
            </Button>
          </div>
        </Dialog>
      )}
    </section>
  );
}

export default SoundView;
