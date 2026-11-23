/**
 * The trim dialog, once, on import (`07-ux.md` section 7.7; decision 0076, workplan 7.17): the
 * sound's name, its waveform with a Start and an End handle, the same two as numbers, and Play
 * this part. The part kept is set here and never again: to trim it another way, the learner
 * imports it again.
 */
import { SOUND_LIMITS, type SoundClip } from '@storystage/production';
import { Button, Dialog, TextField } from '@storystage/ui';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Input, Label, NumberField } from 'react-aria-components';
import { words } from '../strings.ts';
import type { SoundPlayer } from './player.ts';
import { typeOfFile } from './player.ts';
import './sound.css';

/** The shortest part a sound can keep, in seconds. */
export const SHORTEST_PART = 0.1;

/** Seconds to a tenth, as the handles move and say them. */
const tenth = (seconds: number) => Math.round(seconds * 10) / 10;
const between = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** "3.1 seconds", or "1 second". */
export const secondsWords = (seconds: number) => words.plural('sound.seconds', tenth(seconds));

export interface TrimDialogProps {
  /** The sound as `importSound` read it, its name already free in the film. */
  readonly clip: SoundClip;
  readonly bytes: Uint8Array;
  /** Its waveform, or `null` when the device couldn't draw it. */
  readonly peaks: Float32Array | null;
  readonly player: SoundPlayer;
  /** Add sound: the clip with the name and the part the learner chose. */
  readonly onAdd: (clip: SoundClip) => void;
  readonly onCancel: () => void;
}

export function TrimDialog({ clip, bytes, peaks, player, onAdd, onCancel }: TrimDialogProps) {
  const [name, setName] = useState(clip.label);
  const [start, setStart] = useState(clip.trim.start);
  const [end, setEnd] = useState(clip.trim.end);
  const [playing, setPlaying] = useState(false);
  const length = clip.length;
  // The furthest each handle can go: the other's place, less the shortest part.
  const startMax = Math.max(0, Math.round((end - SHORTEST_PART) * 1000) / 1000);
  const endMin = Math.min(length, Math.round((start + SHORTEST_PART) * 1000) / 1000);

  useEffect(() => () => player.stop(), [player]);

  const stop = () => {
    player.stop();
    setPlaying(false);
  };
  const cancel = () => {
    stop();
    onCancel();
  };

  return (
    <Dialog
      isOpen
      title={words.t('sound.trim.title')}
      icon="content_cut"
      width={720}
      onOpenChange={(isOpen) => {
        if (!isOpen) cancel();
      }}
    >
      <div className="sd-trim">
        <TextField
          label={words.t('sound.trim.name')}
          value={name}
          onChange={setName}
          maxLength={SOUND_LIMITS.label}
        />
        <p className="sd-note">{words.t('sound.trim.once')}</p>
        <div className="sd-wave-box">
          <Waveform peaks={peaks} start={start / length} end={end / length} />
          <Handle
            name={words.t('sound.trim.start')}
            value={start}
            min={0}
            max={startMax}
            length={length}
            onChange={setStart}
          />
          <Handle
            name={words.t('sound.trim.end')}
            value={end}
            min={endMin}
            max={length}
            length={length}
            onChange={setEnd}
          />
        </div>
        <div className="sd-trim-times">
          <Seconds
            label={words.t('sound.trim.start')}
            value={start}
            min={0}
            max={startMax}
            onChange={setStart}
          />
          <Seconds
            label={words.t('sound.trim.end')}
            value={end}
            min={endMin}
            max={length}
            onChange={setEnd}
          />
          <p className="sd-kept">
            {words.t('sound.trim.kept', { length: secondsWords(end - start) })}
          </p>
        </div>
        <div className="sd-trim-play">
          {playing ? (
            <Button variant="secondary" icon="stop" onPress={stop}>
              {words.t('sound.stop')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              icon="play_arrow"
              onPress={() => {
                setPlaying(true);
                player.play(bytes, typeOfFile(clip.file), start, end, () => setPlaying(false));
              }}
            >
              {words.t('sound.trim.play')}
            </Button>
          )}
        </div>
        <div className="sd-actions">
          <Button
            variant="primary"
            icon="add"
            onPress={() => {
              stop();
              onAdd({ ...clip, label: name.trim() || clip.label, trim: { start, end } });
            }}
          >
            {words.t('sound.trim.add')}
          </Button>
          <Button variant="secondary" onPress={cancel}>
            {words.t('sound.cancel')}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** The waveform, drawn for sighted learners only: the handles say everything it shows. */
function Waveform(props: { peaks: Float32Array | null; start: number; end: number }) {
  const peaks = props.peaks ?? new Float32Array(0);
  const n = Math.max(1, peaks.length);
  return (
    <svg
      className="sd-wave"
      aria-hidden="true"
      viewBox={`0 0 ${n} 100`}
      preserveAspectRatio="none"
      focusable="false"
    >
      <defs>
        <pattern id="sd-hatch" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" className="sd-hatch-dim" />
          <path d="M0 6 L6 0" className="sd-hatch-line" />
        </pattern>
      </defs>
      {[...peaks].map((peak, i) => {
        const h = Math.max(1, peak * 96);
        return (
          <rect key={i} className="sd-bar" x={i + 0.1} width={0.8} y={50 - h / 2} height={h} />
        );
      })}
      <rect className="sd-left-out" x={0} width={props.start * n} y={0} height={100} />
      <rect
        className="sd-left-out"
        x={props.end * n}
        width={(1 - props.end) * n}
        y={0}
        height={100}
      />
    </svg>
  );
}

const KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 0.1,
  ArrowUp: 0.1,
  ArrowLeft: -0.1,
  ArrowDown: -0.1,
  PageUp: 10,
  PageDown: -10,
};

/** A handle on the waveform: a slider saying its time, moved by pointer or keys. */
function Handle(props: {
  name: string;
  value: number;
  min: number;
  max: number;
  length: number;
  onChange: (seconds: number) => void;
}) {
  const { name, value, min, max, length, onChange } = props;
  const dragging = useRef(false);
  const set = (seconds: number) => onChange(between(tenth(seconds), min, max));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Home') onChange(min);
    else if (e.key === 'End') onChange(max);
    else if (e.key in KEY_STEPS) {
      const step = KEY_STEPS[e.key]!;
      set(value + (e.shiftKey && Math.abs(step) < 1 ? step * 10 : step));
    } else return;
    e.preventDefault();
  };
  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    set(((e.clientX - box.left) / box.width) * length);
  };
  return (
    <div
      className="sd-handle"
      role="slider"
      tabIndex={0}
      aria-label={name}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={words.t('sound.trim.at', { handle: name, time: secondsWords(value) })}
      aria-orientation="horizontal"
      style={{ left: `${(value / length) * 100}%` }}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.focus();
      }}
      onPointerMove={(e) => {
        if (dragging.current) fromPointer(e);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => (dragging.current = false)}
    />
  );
}

/** A handle's time as a number, kept to where the handle can go. */
function Seconds(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (seconds: number) => void;
}) {
  const { label, value, min, max, onChange } = props;
  return (
    <NumberField
      className="pr-number sd-seconds"
      value={tenth(value)}
      minValue={min}
      maxValue={max}
      formatOptions={{ maximumFractionDigits: 1 }}
      onChange={(seconds) => {
        if (Number.isFinite(seconds)) onChange(between(tenth(seconds), min, max));
      }}
    >
      <Label className="pr-number-label">{label}</Label>
      <Input className="ss-input pr-number-input" />
    </NumberField>
  );
}
