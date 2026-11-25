/**
 * The scene's music, in the Sound view (`07-ux.md` section 7.7; decision 0076, workplan 7.17): the
 * timeline, a ruler in seconds over Speech, Music and Sound FX, with Zoom in, Zoom out and Fit,
 * the playhead and its Time box; **Add music…**, which starts a cue at the playhead; **Music in
 * this scene**, which chooses a cue without the timeline; and the chosen cue's controls.
 *
 * Until Rehearse reports how long a scene ran and when its sounds played (S3 and S2), the ruler is
 * the storyboard's planned length and Speech and Sound FX say so. Dragging on the timeline comes
 * next; every change here has its keys and its control already.
 */
import {
  mixOf,
  SOUND_LIMITS,
  type MusicCue,
  type SceneId,
  type SoundClip,
} from '@storystage/production';
import { Button } from '@storystage/ui';
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { Input, Label, NumberField } from 'react-aria-components';
import { sceneNumber, sceneSeconds } from '../storyboard/edits.ts';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import { AddMusic } from './AddMusic.tsx';
import { CueControls } from './CueControls.tsx';
import type { FilmSounds } from './filmSounds.ts';
import {
  addCue,
  changeCue,
  clipOf,
  heardMusic,
  LATEST_START,
  musicOf,
  removeCue,
  rulerStep,
  tenth,
  type CueChange,
  type HeardCue,
  type SceneLength,
} from './music.ts';
import type { SoundPlayer } from './player.ts';
import { secondsWords } from './TrimDialog.tsx';
import './sound.css';

/** Pixels a second at each zoom. */
const ZOOMS = [5, 10, 20, 40, 80, 160, 320];
/** The track heads' width, in px, beside the lanes. */
const HEAD = 128;

export interface MusicProps {
  readonly studio: Studio;
  readonly scene: SceneId;
  readonly readOnly: boolean;
  readonly sounds: FilmSounds;
  readonly player: SoundPlayer;
  readonly onAnnounce: (text: string) => void;
  /** Go to scene `scene`: where a cue carried in from it is changed. */
  readonly onGoToScene?: ((scene: SceneId) => void) | undefined;
  /** Import a sound…, from Add music…: added, it's placed at `start` in the same step. */
  readonly onImport: (start: number) => void;
}

export function Music(props: MusicProps) {
  const { studio, scene, readOnly, sounds, player, onAnnounce, onGoToScene, onImport } = props;
  const p = studio.production;
  const n = sceneNumber(p, scene);
  const length: SceneLength = { seconds: sceneSeconds(p, scene), from: 'plan' };
  const heard = heardMusic(p, scene, length);
  const [playhead, setPlayhead] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [zoom, setZoom] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // The production as the last change left it, for a run of keys before React draws.
  const latest = useRef(p);
  useEffect(() => {
    latest.current = p;
  });

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const seen = new ResizeObserver(() => setWidth(el.clientWidth));
    seen.observe(el);
    setWidth(el.clientWidth);
    return () => seen.disconnect();
  }, []);

  // The timeline shows the playhead too, wherever it's put for music to come.
  const span = Math.max(heard.span, playhead);
  const fit = width > HEAD ? (width - HEAD - 24) / span : 20;
  const px = zoom ?? Math.min(ZOOMS.at(-1)!, Math.max(ZOOMS[0]!, fit));
  const music = musicOf(p, scene);
  const cue = chosen !== null ? (music[chosen] ?? null) : null;

  const nameOf = (c: MusicCue) => clipOf(p, c)?.label ?? words.t('sound.missing');
  const missing = (c: MusicCue) => {
    const clip = clipOf(p, c);
    return !clip || !sounds.bytes(clip);
  };

  const refuse = (message: string) => {
    setRefusal(message);
    onAnnounce(message);
  };

  /** A change to a cue, one step; a key joins a run of them, named where it stopped. */
  const apply = (label: string, result: CueChange, key?: string) => {
    if (!result.ok) {
      if (result.reason === 'taken')
        refuse(words.t('sound.music.taken', { time: secondsWords(result.at) }));
      else if (result.reason === 'full')
        refuse(words.t('sound.music.full', { n: String(SOUND_LIMITS.cues) }));
      return false;
    }
    setRefusal(null);
    latest.current = result.production;
    studio.commit(label, result.production, key, key ? 'last' : 'first');
    setChosen(result.index);
    if (!key) onAnnounce(label);
    return true;
  };

  const change = (
    index: number,
    patch: Partial<Omit<MusicCue, 'sound'>>,
    label: string,
    key?: string,
  ) => apply(label, changeCue(latest.current, scene, index, patch), key);

  const add = (clip: SoundClip) => {
    const label = words.t('sound.step.addMusic', { name: clip.label });
    if (apply(label, addCue(latest.current, scene, clip, playhead))) setAdding(false);
  };

  const remove = (index: number) => {
    const c = musicOf(latest.current, scene)[index];
    if (!c) return;
    const label = words.t('sound.step.removeCue', { name: nameOf(c) });
    latest.current = removeCue(latest.current, scene, index);
    studio.commit(label, latest.current);
    setChosen(null);
    onAnnounce(label);
  };

  const onBarKey = (e: KeyboardEvent<HTMLButtonElement>, h: HeardCue) => {
    if (readOnly) return;
    const now = musicOf(latest.current, scene)[h.index] ?? h.cue;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      remove(h.index);
      return;
    }
    const step = e.shiftKey ? 1 : 0.1;
    const moves: Record<string, number> = {
      ArrowLeft: now.start - step,
      ArrowRight: now.start + step,
      Home: 0,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    let at = tenth(Math.max(0, moves[e.key]!));
    // An arrow steps over another cue's start, so a bar can pass it.
    const others = new Set(
      musicOf(latest.current, scene)
        .filter((_, i) => i !== h.index)
        .map((c) => c.start),
    );
    const dir = Math.sign(at - now.start);
    if (e.key !== 'Home') while (others.has(at) && at > 0) at = tenth(at + dir * step);
    at = Math.max(0, at);
    if (at === now.start) return;
    const label = words.t('sound.step.moveCue', { name: nameOf(now), time: secondsWords(at) });
    const moved = changeCue(latest.current, scene, h.index, { start: at });
    if (apply(label, moved, 'cue:bar')) {
      onAnnounce(label);
      // Past another cue, its bar is another in start order: focus follows it.
      if (moved.ok && moved.index !== h.index) refocus.current = moved.index;
    }
  };
  // The bar to focus once it's drawn, after a move put its cue in another place.
  const refocus = useRef<number | null>(null);
  const musicList = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (refocus.current === null) return;
    musicList.current?.querySelector<HTMLElement>(`[data-index="${refocus.current}"]`)?.focus();
    refocus.current = null;
  });

  const onRuler = (e: MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setPlayhead(tenth(Math.min(span, Math.max(0, (e.clientX - r.left) / px))));
  };

  const zoomBy = (dir: 1 | -1) => {
    const next =
      dir > 0 ? ZOOMS.find((z) => z > px + 1e-6) : [...ZOOMS].reverse().find((z) => z < px - 1e-6);
    if (next !== undefined) setZoom(next);
  };

  const lane = span * px + 24;
  const step = rulerStep(px);
  const ticks: number[] = [];
  for (let t = 0; t <= span + 1e-9; t += step) ticks.push(t);
  const mix = mixOf(p);
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  const carriedName = heard.carried ? nameOf(heard.carried.cue) : '';
  const carriedFrom = heard.carried ? sceneNumber(p, heard.carried.scene) : 0;

  return (
    <section className="sd-music" aria-labelledby="sd-timeline-title">
      <h3 className="sd-heading" id="sd-timeline-title">
        {words.t('sound.timeline.title', { n: String(n) })}
      </h3>
      <p className="sd-note">{words.plural('sound.timeline.plan', length.seconds)}</p>
      <div className="sd-tl-tools">
        <Button
          variant="quiet"
          icon="zoom_out"
          isDisabled={px <= ZOOMS[0]!}
          onPress={() => zoomBy(-1)}
        >
          {words.t('sound.zoom.out')}
        </Button>
        <Button
          variant="quiet"
          icon="zoom_in"
          isDisabled={px >= ZOOMS.at(-1)!}
          onPress={() => zoomBy(1)}
        >
          {words.t('sound.zoom.in')}
        </Button>
        <Button
          variant="quiet"
          icon="fullscreen"
          isDisabled={zoom === null}
          onPress={() => setZoom(null)}
        >
          {words.t('sound.zoom.fit')}
        </Button>
        <NumberField
          className="pr-number sd-seconds sd-time"
          value={playhead}
          minValue={0}
          maxValue={LATEST_START}
          step={0.1}
          formatOptions={{ maximumFractionDigits: 1 }}
          onChange={(t) => {
            if (Number.isFinite(t)) setPlayhead(tenth(Math.min(LATEST_START, Math.max(0, t))));
          }}
        >
          <Label className="pr-number-label">{words.t('sound.time')}</Label>
          <Input className="ss-input pr-number-input" />
        </NumberField>
        {!readOnly && (
          <Button
            variant="secondary"
            icon="music_note"
            onPress={() => {
              setRefusal(null);
              setAdding(true);
            }}
          >
            {words.t('sound.music.add')}
          </Button>
        )}
      </div>
      {refusal !== null && <p className="sd-refusal">{refusal}</p>}
      <div className="sd-tl-scroll" ref={box}>
        <div className="sd-tl-body" style={{ width: HEAD + lane }}>
          <div className="sd-tl-row sd-tl-ruler-row">
            <div className="sd-tl-head" />
            {/* A click moves the playhead; the Time box is the same by keyboard. */}
            <div className="sd-ruler" aria-hidden="true" style={{ width: lane }} onClick={onRuler}>
              {ticks.map((t) => (
                <span key={t} className="sd-tick" style={{ left: t * px }}>
                  {words.t('sound.timeline.tick', { n: String(t) })}
                </span>
              ))}
              <span className="sd-scene-end" style={{ left: length.seconds * px }} />
            </div>
          </div>
          {(['speech', 'music', 'effects'] as const).map((track) => {
            const name = words.t(`sound.track.${track}`);
            return (
              <div key={track} className="sd-tl-row" data-track={track}>
                <div className="sd-tl-head">
                  <span className="sd-name">{name}</span>
                  <span className="sd-length">{percent(mix[track])}</span>
                </div>
                {track !== 'music' ? (
                  <div className="sd-tl-lane" style={{ width: lane }}>
                    <p className="sd-note sd-tl-untimed">{words.t('sound.timeline.untimed')}</p>
                  </div>
                ) : (
                  <ul
                    ref={musicList}
                    className="sd-tl-lane sd-tl-music"
                    aria-label={name}
                    style={{ width: lane }}
                  >
                    {heard.carried && (
                      <li
                        className="sd-cue-carried"
                        style={{ left: 0, width: Math.max(8, heard.carried.end * px) }}
                      >
                        <span className="sd-cue-name">
                          {words.t('sound.cue.carried', {
                            name: carriedName,
                            n: String(carriedFrom),
                          })}
                        </span>
                      </li>
                    )}
                    {heard.cues.map((h) => (
                      <li
                        key={h.index}
                        className="sd-cue-slot"
                        style={{ left: h.start * px, width: Math.max(24, (h.end - h.start) * px) }}
                      >
                        <button
                          type="button"
                          className="sd-cue"
                          aria-pressed={chosen === h.index}
                          data-index={h.index}
                          data-past={h.past || undefined}
                          data-missing={missing(h.cue) || undefined}
                          aria-label={barWords(
                            h,
                            nameOf(h.cue),
                            missing(h.cue) && clipOf(p, h.cue) !== null,
                          )}
                          onClick={() => setChosen(h.index)}
                          onKeyDown={(e) => onBarKey(e, h)}
                          onBlur={(e) => {
                            // Focus following a moved cue to its bar keeps the step open.
                            if (!(
                              e.relatedTarget instanceof HTMLElement &&
                              e.relatedTarget.matches('.sd-cue')
                            ))
                              studio.seal();
                          }}
                        >
                          <Envelope cue={h} px={px} />
                          <span className="sd-cue-name" aria-hidden="true">
                            {nameOf(h.cue)}
                            {missing(h.cue) && clipOf(p, h.cue)
                              ? ` · ${words.t('sound.missing')}`
                              : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
          <div className="sd-playhead" aria-hidden="true" style={{ left: HEAD + playhead * px }} />
        </div>
      </div>
      {heard.carried && (
        <div className="sd-carried">
          <p>{words.t('sound.cue.carried', { name: carriedName, n: String(carriedFrom) })}</p>
          {onGoToScene && (
            <Button
              variant="secondary"
              icon="arrow_forward"
              onPress={() => onGoToScene(heard.carried!.scene)}
            >
              {words.t('sound.cue.goToScene', { n: String(carriedFrom) })}
            </Button>
          )}
        </div>
      )}
      <h4 className="sd-subheading" id="sd-music-list-title">
        {words.t('sound.music.list')}
      </h4>
      {music.length === 0 ? (
        <p className="sd-note">{words.t('sound.music.none')}</p>
      ) : (
        <ul className="sd-list sd-music-list" aria-labelledby="sd-music-list-title">
          {music.map((c, i) => (
            <li key={i}>
              <button
                type="button"
                className="sd-music-item"
                aria-pressed={chosen === i}
                onClick={() => setChosen(i)}
              >
                {words.t('sound.music.item', { name: nameOf(c), time: secondsWords(c.start) })}
              </button>
            </li>
          ))}
        </ul>
      )}
      {cue && chosen !== null && (
        <CueControls
          key={chosen}
          cue={cue}
          name={nameOf(cue)}
          scene={n}
          clip={clipOf(p, cue)}
          readOnly={readOnly}
          onChange={(patch, label, key) => change(chosen, patch, label, key)}
          onSeal={() => studio.seal()}
          onRemove={() => remove(chosen)}
        />
      )}
      {adding && (
        <AddMusic
          clips={p.manifest.sounds ?? []}
          sounds={sounds}
          player={player}
          start={playhead}
          full={music.length >= SOUND_LIMITS.cues}
          refusal={refusal}
          onAdd={add}
          onImport={() => {
            setAdding(false);
            onImport(playhead);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

/** A bar's name: the sound, when it's heard, and what it does. */
function barWords(h: HeardCue, name: string, missing: boolean): string {
  const parts = [
    words.t('sound.cue.bar', {
      name,
      start: String(tenth(h.start)),
      end: String(tenth(h.end)),
    }),
  ];
  if (h.cue.loop) parts.push(words.t('sound.cue.loops'));
  if (h.fadeIn) parts.push(words.t('sound.cue.fadesIn'));
  if (h.fadeOut) parts.push(words.t('sound.cue.fadesOut'));
  if (h.crossfade) parts.push(words.t('sound.cue.crossfades'));
  if (h.cue.carriesOn) parts.push(words.t('sound.cue.carriesOn'));
  if (missing) parts.push(words.t('sound.missing'));
  if (h.past) parts.push(words.t('sound.cue.past'));
  return parts.join(', ');
}

/**
 * A cue's loudness drawn on its bar: ramps for its fades and the crossfade, and a mark where each
 * loop starts again. Shapes, never colour alone; for sighted learners, as the bar's name says it.
 */
function Envelope({ cue: h, px }: { cue: HeardCue; px: number }) {
  const w = Math.max(1, (h.end - h.start) * px);
  const x = (t: number) => (t - h.start) * px;
  const top = 100 - Math.max(0.15, h.cue.volume) * 80;
  const points: [number, number][] = [[0, h.fadeIn ? 100 : top]];
  if (h.fadeIn) points.push([x(h.fadeIn[1]), top]);
  const down = h.fadeOut ?? h.crossfade;
  if (down) points.push([x(down[0]), top], [x(down[1]), 100]);
  else points.push([w, top]);
  points.push([w, 100], [0, 100]);
  return (
    <svg
      className="sd-envelope"
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${w} 100`}
      preserveAspectRatio="none"
    >
      <polygon
        className="sd-envelope-fill"
        points={points.map(([a, b]) => `${a},${b}`).join(' ')}
      />
      {h.crossfade && (
        <line
          className="sd-envelope-cross"
          x1={x(h.crossfade[0])}
          y1={100}
          x2={x(h.crossfade[1])}
          y2={top}
        />
      )}
      {h.loops.map((t) => (
        <line key={t} className="sd-envelope-loop" x1={x(t)} y1={0} x2={x(t)} y2={100} />
      ))}
    </svg>
  );
}
