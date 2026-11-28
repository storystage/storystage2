/**
 * The scene's music, in the Sound view (`07-ux.md` section 7.7; decision 0076, workplan 7.17): the
 * timeline, a ruler in seconds over Speech, Music and Sound FX, with Zoom in, Zoom out and Fit,
 * the playhead and its Time box; **Add music…**, which starts a cue at the playhead; **Music in
 * this scene**, which chooses a cue without the timeline; and the chosen cue's controls.
 *
 * The ruler is the scene's last whole Rehearse run, and Speech and Sound FX are where its speak
 * lines and sounds played, each a bar that offers Go to the block. Before a run, the ruler is the
 * storyboard's planned length and says so.
 *
 * A bar drags to move its cue; the chosen bar has a handle at each end of the part it plays and a
 * corner for each fade, each a slider by keys. A drag is drawn as it goes and written as one step
 * when it's let go; Esc during one puts it back.
 */
import {
  mixOf,
  SOUND_LIMITS,
  type MusicCue,
  type Production,
  type SceneId,
  type SoundClip,
} from '@storystage/production';
import { Button } from '@storystage/ui';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react';
import { Input, Label, NumberField } from 'react-aria-components';
import { sceneNumber, sceneSeconds } from '../storyboard/edits.ts';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import type { NodeId } from '@storystage/ast';
import type { SceneTiming, TimedSound } from '../production/runTiming.ts';
import { AddMusic } from './AddMusic.tsx';
import { CueControls } from './CueControls.tsx';
import type { FilmSounds } from './filmSounds.ts';
import {
  addCue,
  changeCue,
  clipOf,
  dragCue,
  heardMusic,
  LATEST_START,
  musicOf,
  partOf,
  removeCue,
  rulerStep,
  SHORTEST_CUE,
  tenth,
  type CueChange,
  type CueGrip,
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
/** How far a pointer goes before a press on a bar is a drag. */
const DRAG_AFTER = 4;

/** A drag under way: what's held, and the production and zoom when it began. */
interface Drag {
  readonly grip: CueGrip;
  readonly index: number;
  readonly x0: number;
  readonly px: number;
  readonly base: Production;
  moved: boolean;
  /** The last place it could be, which pointer-up writes before React has drawn it. */
  last: Draft | null;
}

/** What a drag shows until it's let go. */
interface Draft {
  readonly production: Production;
  readonly index: number;
  readonly px: number;
}

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
  /** The scene's last whole Rehearse run, if it has had one. */
  readonly timing?: SceneTiming | null;
  /** Go to the block: Code, open at the block that played a speak line or a sound. */
  readonly onGoToBlock?: ((node: NodeId) => void) | undefined;
}

export function Music(props: MusicProps) {
  const { studio, scene, readOnly, sounds, player, onAnnounce, onGoToScene, onImport } = props;
  const { timing = null, onGoToBlock } = props;
  const p = studio.production;
  const n = sceneNumber(p, scene);
  const length: SceneLength = timing
    ? { seconds: timing.timing.length, from: 'run' }
    : { seconds: sceneSeconds(p, scene), from: 'plan' };
  const [draft, setDraft] = useState<Draft | null>(null);
  // While a drag goes on, the timeline draws it; it's written when let go.
  const shown = draft?.production ?? p;
  const heard = heardMusic(shown, scene, length);
  const [playhead, setPlayhead] = useState(0);
  const [chosen, setChosen] = useState<number | null>(null);
  // A speak line's or a sound's bar, chosen in this run's timing: it offers Go to the block. A
  // cue chosen, or another run, ends it.
  const played = timing?.timing.sounds ?? [];
  const [heardChosen, setHeardChosen] = useState<{ sounds: unknown; index: number } | null>(null);
  const heardIndex = chosen === null && heardChosen?.sounds === played ? heardChosen.index : null;
  const chosenSound = heardIndex !== null ? (played[heardIndex] ?? null) : null;
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
  // A drag keeps the zoom it began with, so Fit doesn't move the timeline under it.
  const px = draft?.px ?? zoom ?? Math.min(ZOOMS.at(-1)!, Math.max(ZOOMS[0]!, fit));
  const music = musicOf(shown, scene);
  const at = draft ? draft.index : chosen;
  const cue = at !== null ? (music[at] ?? null) : null;

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
      if (moved.ok && moved.index !== h.index)
        refocus.current = `.sd-cue[data-index="${moved.index}"]`;
    }
  };
  /** A handle's or a corner's keys: Left and Right 0.1 s, with Shift 1 s, Home and End as far as it goes. */
  const onGripKey = (e: KeyboardEvent<HTMLElement>, grip: CueGrip, index: number) => {
    if (readOnly) return;
    const step = e.shiftKey ? 1 : 0.1;
    const moves: Record<string, number> = {
      ArrowLeft: -step,
      ArrowRight: step,
      Home: -LATEST_START,
      End: LATEST_START,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    const result = dragCue(latest.current, scene, index, grip, moves[e.key]!);
    if (!result.ok) {
      apply('', result);
      return;
    }
    const after = musicOf(result.production, scene)[result.index]!;
    const before = musicOf(latest.current, scene)[index];
    if (before && sameCue(before, after)) return;
    const label = gripLabel(grip, after, nameOf(after), n);
    if (apply(label, result, `grip:${grip}`)) {
      onAnnounce(label);
      if (result.index !== index)
        refocus.current = `[data-for="${result.index}"][data-grip="${grip}"]`;
    }
  };

  // What to focus once it's drawn, after a change put its cue in another place.
  const refocus = useRef<string | null>(null);
  const musicList = useRef<HTMLUListElement>(null);
  useEffect(() => {
    if (refocus.current === null) return;
    musicList.current?.querySelector<HTMLElement>(refocus.current)?.focus();
    refocus.current = null;
  });

  // A drag, by the bar or a handle or a corner.
  const drag = useRef<Drag | null>(null);
  // A bar let go after a drag is clicked too; that click doesn't choose again.
  const dragged = useRef(false);
  const startDrag = (e: PointerEvent<HTMLElement>, grip: CueGrip, index: number) => {
    dragged.current = false;
    if (readOnly || e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = {
      grip,
      index,
      x0: e.clientX,
      px,
      base: latest.current,
      moved: false,
      last: null,
    };
  };
  const moveDrag = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < DRAG_AFTER) return;
    d.moved = true;
    const result = dragCue(d.base, scene, d.index, d.grip, dx / d.px);
    // Onto another cue's start, the drag stays where it last could be.
    if (!result.ok) return;
    d.last = { production: result.production, index: result.index, px: d.px };
    setDraft(d.last);
  };
  const endDrag = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d?.moved) return;
    if (d.grip === 'move') dragged.current = true;
    setDraft(null);
    const draft = d.last;
    if (!draft) return;
    const before = musicOf(d.base, scene)[d.index];
    const after = musicOf(draft.production, scene)[draft.index]!;
    if (before && sameCue(before, after)) return;
    apply(gripLabel(d.grip, after, nameOf(after), n), { ok: true, ...draft });
  };
  const cancelDrag = () => {
    drag.current = null;
    setDraft(null);
  };
  // Esc during a drag puts it back.
  const dragging = draft !== null;
  useEffect(() => {
    if (!dragging) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cancelDrag();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dragging]);

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
  const widthOf = (h: HeardCue) => Math.max(24, (h.end - h.start) * px);
  const percent = (v: number) => `${Math.round(v * 100)}%`;
  const carriedName = heard.carried ? nameOf(heard.carried.cue) : '';
  const carriedFrom = heard.carried ? sceneNumber(p, heard.carried.scene) : 0;

  return (
    <section className="sd-music" aria-labelledby="sd-timeline-title">
      <h3 className="sd-heading" id="sd-timeline-title">
        {words.t('sound.timeline.title', { n: String(n) })}
      </h3>
      <p className="sd-note">
        {words.plural(
          length.from === 'run' ? 'sound.timeline.run' : 'sound.timeline.plan',
          tenth(length.seconds),
        )}
      </p>
      {timing?.changed && <p className="sd-note">{words.t('sound.timeline.changed')}</p>}
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
                  <HeardTrack
                    name={name}
                    width={lane}
                    px={px}
                    timed={timing !== null}
                    sounds={played}
                    kind={track === 'speech' ? 'speech' : 'sound'}
                    chosen={heardIndex}
                    nameOf={(s) => heardName(p, s)}
                    onChoose={(i) => {
                      setChosen(null);
                      setHeardChosen({ sounds: played, index: i });
                    }}
                  />
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
                        data-dragging={(draft && draft.index === h.index) || undefined}
                        style={{ left: h.start * px, width: widthOf(h) }}
                      >
                        <button
                          type="button"
                          className="sd-cue"
                          aria-pressed={at === h.index}
                          data-index={h.index}
                          data-past={h.past || undefined}
                          data-missing={missing(h.cue) || undefined}
                          aria-label={barWords(
                            h,
                            nameOf(h.cue),
                            missing(h.cue) && clipOf(p, h.cue) !== null,
                          )}
                          onClick={() => {
                            if (dragged.current) dragged.current = false;
                            else setChosen(h.index);
                          }}
                          onKeyDown={(e) => onBarKey(e, h)}
                          onPointerDown={(e) => startDrag(e, 'move', h.index)}
                          onPointerMove={moveDrag}
                          onPointerUp={endDrag}
                          onPointerCancel={cancelDrag}
                          onBlur={(e) => {
                            // Focus following a moved cue to its bar keeps the step open.
                            if (!(
                              e.relatedTarget instanceof HTMLElement &&
                              e.relatedTarget.matches('.sd-cue')
                            ))
                              studio.seal();
                          }}
                        >
                          <Envelope
                            cue={h}
                            before={
                              h.index === 0 ? heard.carried?.cue : heard.cues[h.index - 1]?.cue
                            }
                            px={px}
                          />
                          <span className="sd-cue-name" aria-hidden="true">
                            {nameOf(h.cue)}
                            {missing(h.cue) && clipOf(p, h.cue)
                              ? ` · ${words.t('sound.missing')}`
                              : ''}
                          </span>
                        </button>
                        {at === h.index &&
                          !readOnly &&
                          gripsOf(h, widthOf(h), px, clipOf(shown, h.cue)).map((g) => (
                            <div
                              key={g.grip}
                              className="sd-grip"
                              role="slider"
                              tabIndex={0}
                              data-grip={g.grip}
                              data-for={h.index}
                              aria-label={words.t(`sound.cue.${g.grip}`)}
                              aria-orientation="horizontal"
                              aria-valuemin={g.min}
                              aria-valuemax={g.max}
                              aria-valuenow={tenth(g.value)}
                              aria-valuetext={secondsWords(tenth(g.value))}
                              style={{ left: g.left }}
                              onKeyDown={(e) => onGripKey(e, g.grip, h.index)}
                              onBlur={(e) => {
                                if (!(
                                  e.relatedTarget instanceof HTMLElement &&
                                  e.relatedTarget.dataset['grip'] === g.grip
                                ))
                                  studio.seal();
                              }}
                              onPointerDown={(e) => startDrag(e, g.grip, h.index)}
                              onPointerMove={moveDrag}
                              onPointerUp={endDrag}
                              onPointerCancel={cancelDrag}
                            />
                          ))}
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
      {chosenSound && (
        <div className="sd-heard-chosen">
          <p>{heardWords(chosenSound, heardName(p, chosenSound))}</p>
          {onGoToBlock && (
            <Button
              variant="secondary"
              icon="arrow_forward"
              onPress={() => onGoToBlock(chosenSound.node)}
            >
              {words.t('sound.goToBlock')}
            </Button>
          )}
        </div>
      )}
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
                aria-pressed={at === i}
                onClick={() => setChosen(i)}
              >
                {words.t('sound.music.item', { name: nameOf(c), time: secondsWords(c.start) })}
              </button>
            </li>
          ))}
        </ul>
      )}
      {cue && at !== null && (
        <CueControls
          key={at}
          cue={cue}
          name={nameOf(cue)}
          scene={n}
          clip={clipOf(p, cue)}
          readOnly={readOnly}
          onChange={(patch, label, key) => change(at, patch, label, key)}
          onSeal={() => studio.seal()}
          onRemove={() => remove(at)}
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

/** Where the chosen bar's handles and corners are, and the times each can say. */
function gripsOf(h: HeardCue, width: number, px: number, clip: SoundClip | null) {
  const c = h.cue;
  const part = partOf(c);
  const x = (seconds: number) => Math.min(width, Math.max(0, seconds * px));
  const all: {
    grip: Exclude<CueGrip, 'move'>;
    left: number;
    value: number;
    min: number;
    max: number;
  }[] = [
    { grip: 'from', left: 0, value: c.from, min: 0, max: tenth(c.to - SHORTEST_CUE) },
    {
      grip: 'to',
      left: x(part),
      value: c.to,
      min: tenth(c.from + SHORTEST_CUE),
      max: clip ? tenth(clip.trim.end - clip.trim.start) : c.to,
    },
    { grip: 'fadeIn', left: x(c.fadeIn), value: c.fadeIn, min: 0, max: tenth(part) },
  ];
  // The fade out's corner, wherever it's heard: as the cue ends by itself, or where the scene stops
  // it (the owner's choice, 27 Nov). A drag moves it by how far it goes, so only its place moves.
  // With no fade yet it sits at the cue's own end, where one starts from.
  if (h.fadeOut || h.until === 'own')
    all.push({
      grip: 'fadeOut',
      left: h.fadeOut ? x(h.fadeOut[0] - h.start) : x(part - c.fadeOut),
      value: c.fadeOut,
      min: 0,
      max: tenth(part),
    });
  return all;
}

/** Whether two cues play the same part at the same time, as loud and faded the same way. */
const sameCue = (a: MusicCue, b: MusicCue) =>
  a.start === b.start &&
  a.from === b.from &&
  a.to === b.to &&
  a.fadeIn === b.fadeIn &&
  a.fadeOut === b.fadeOut;

/** A drag's step, named for what it changed. */
function gripLabel(grip: CueGrip, cue: MusicCue, name: string, scene: number): string {
  switch (grip) {
    case 'move':
      return words.t('sound.step.moveCue', { name, time: secondsWords(cue.start) });
    case 'from':
    case 'to':
      return words.t('sound.step.trimCue', { name, n: String(scene) });
    case 'fadeIn':
      return words.t('sound.step.fadeIn', { name, time: secondsWords(cue.fadeIn) });
    case 'fadeOut':
      return words.t('sound.step.fadeOut', { name, time: secondsWords(cue.fadeOut) });
  }
}

/** A bar's name: the sound, when it's heard, and what it does. */
/** A speak line by its words; a sound by its name, from the film or its own. */
function heardName(p: Production, s: TimedSound): string {
  if (s.kind === 'speech') return words.t('sound.heard.line', { text: s.text ?? '' });
  if (s.missing) return words.t('sound.missing');
  const clip = p.manifest.sounds?.find((c) => c.id === s.ref);
  return clip?.label ?? (s.ref ?? '').split('/').at(-1)!.replaceAll('-', ' ');
}

/** A speak line's or sound's bar, said: what it is and when it played. */
function heardWords(s: TimedSound, name: string): string {
  return s.length > 0
    ? words.t('sound.heard.bar', {
        name,
        start: String(tenth(s.start)),
        end: String(tenth(s.start + s.length)),
      })
    : words.t('sound.heard.at', { name, start: String(tenth(s.start)) });
}

/** Speech or Sound FX: a bar for each that played in the last whole run, to choose. */
function HeardTrack(props: {
  readonly name: string;
  readonly width: number;
  readonly px: number;
  readonly timed: boolean;
  readonly sounds: readonly TimedSound[];
  readonly kind: TimedSound['kind'];
  readonly chosen: number | null;
  readonly nameOf: (s: TimedSound) => string;
  readonly onChoose: (index: number) => void;
}) {
  const { name, width, px, timed, sounds, kind, chosen, nameOf, onChoose } = props;
  const here = sounds.flatMap((s, index) => (s.kind === kind ? [{ s, index }] : []));
  if (!timed || here.length === 0)
    return (
      <div className="sd-tl-lane" style={{ width }}>
        <p className="sd-note sd-tl-untimed">
          {words.t(timed ? 'sound.timeline.noneRun' : 'sound.timeline.untimed')}
        </p>
      </div>
    );
  return (
    <ul className="sd-tl-lane sd-tl-heard" aria-label={name} style={{ width }}>
      {here.map(({ s, index }) => (
        <li
          key={index}
          className="sd-heard-slot"
          style={{ left: s.start * px, width: Math.max(8, s.length * px) }}
        >
          <button
            type="button"
            className="sd-heard"
            aria-pressed={chosen === index}
            data-missing={s.missing || undefined}
            aria-label={heardWords(s, nameOf(s))}
            onClick={() => onChoose(index)}
          >
            <span className="sd-cue-name" aria-hidden="true">
              {nameOf(s)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

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
function Envelope({
  cue: h,
  before,
  px,
}: {
  cue: HeardCue;
  /** The cue it comes in under: the one before it, or the one carried in. */
  before: MusicCue | undefined;
  px: number;
}) {
  const w = Math.max(1, (h.end - h.start) * px);
  const x = (t: number) => (t - h.start) * px;
  const height = (cue: MusicCue) => 100 - Math.max(0.15, cue.volume) * 80;
  const top = height(h.cue);
  // It comes in by its own fade in, or under the cue before as they crossfade: the later of the two.
  const up = Math.max(h.fadeIn?.[1] ?? h.start, h.crossfadeIn?.[1] ?? h.start);
  const points: [number, number][] = [[0, up > h.start ? 100 : top]];
  if (up > h.start) points.push([x(up), top]);
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
      {/*
       * The crossfade, drawn on the cue coming in, which is drawn over the one going out: a
       * dashed line for the cue before fading out under its rise, from that cue's own volume
       * (07-ux 7.7; S3's #716 and its review of #727).
       */}
      {h.crossfadeIn && (
        <line
          className="sd-envelope-cross"
          x1={x(h.crossfadeIn[0])}
          y1={before ? height(before) : top}
          x2={x(h.crossfadeIn[1])}
          y2={100}
        />
      )}
      {h.loops.map((t) => (
        <line key={t} className="sd-envelope-loop" x1={x(t)} y1={0} x2={x(t)} y2={100} />
      ))}
    </svg>
  );
}
