/**
 * The chosen music cue's controls, under the timeline (`07-ux.md` section 7.7's table): Starts
 * at, Play from, Play to, Fade in and Fade out in seconds, Volume, Loop, Carry on into the next
 * scene, and Remove. Each change is one undo step; a run of keys on one control is one step until
 * focus leaves it, named where it stopped.
 */
import type { MusicCue, SoundClip } from '@storystage/production';
import { Button, Toggle } from '@storystage/ui';
import { Input, Label, NumberField } from 'react-aria-components';
import { words } from '../strings.ts';
import { LATEST_START, SHORTEST_CUE, tenth, trimmedOf } from './music.ts';
import { PercentControl } from './PercentControl.tsx';
import { secondsWords } from './TrimDialog.tsx';
import './sound.css';

type Patch = Partial<Omit<MusicCue, 'sound'>>;

export interface CueControlsProps {
  readonly cue: MusicCue;
  /** Its sound's name, or "Missing sound". */
  readonly name: string;
  /** The scene's number, for "Trim Rain in scene 1". */
  readonly scene: number;
  /** The sound it plays, for how much of it there is; `null` when the film hasn't got it. */
  readonly clip: SoundClip | null;
  readonly readOnly: boolean;
  /** A change, its step's name, and the key a run of changes to one control shares. */
  readonly onChange: (patch: Patch, label: string, key?: string) => void;
  /** Focus left a control: its run of changes is one step. */
  readonly onSeal: () => void;
  readonly onRemove: () => void;
}

export function CueControls(props: CueControlsProps) {
  const { cue, name, scene, clip, readOnly, onChange, onSeal, onRemove } = props;
  const length = clip ? trimmedOf(clip) : cue.to;
  const part = cue.to - cue.from;
  const trim = words.t('sound.step.trimCue', { name, n: String(scene) });

  const seconds = (
    field: 'start' | 'from' | 'to' | 'fadeIn' | 'fadeOut',
    min: number,
    max: number,
    label: (value: number) => string,
  ) => (
    <Seconds
      label={words.t(`sound.cue.${field}`)}
      value={cue[field]}
      min={min}
      max={max}
      isDisabled={readOnly}
      onChange={(value) => {
        if (value !== cue[field]) onChange({ [field]: value }, label(value), `cue:${field}`);
      }}
      onSeal={onSeal}
    />
  );

  return (
    <section className="sd-cue-controls" aria-labelledby="sd-cue-title">
      <h4 className="sd-subheading" id="sd-cue-title">
        {words.t('sound.cue.title', { name })}
      </h4>
      <div className="sd-cue-times">
        {seconds('start', 0, LATEST_START, (t) =>
          words.t('sound.step.moveCue', { name, time: secondsWords(t) }),
        )}
        {seconds('from', 0, tenth(cue.to - SHORTEST_CUE), () => trim)}
        {seconds('to', tenth(cue.from + SHORTEST_CUE), length, () => trim)}
        {seconds('fadeIn', 0, tenth(part), (t) =>
          words.t('sound.step.fadeIn', { name, time: secondsWords(t) }),
        )}
        {seconds('fadeOut', 0, tenth(part), (t) =>
          words.t('sound.step.fadeOut', { name, time: secondsWords(t) }),
        )}
      </div>
      <div className="sd-volume" onBlur={onSeal}>
        <PercentControl
          name={words.t('sound.cue.volume')}
          percentName={words.t('sound.cue.volumePercent')}
          value={Math.round(cue.volume * 100)}
          isDisabled={readOnly}
          onChange={(percent) => {
            const value = Math.round(Math.min(100, Math.max(0, percent)));
            if (value === Math.round(cue.volume * 100)) return;
            onChange(
              { volume: value / 100 },
              words.t('sound.step.cueVolume', { name, value: String(value) }),
              'cue:volume',
            );
          }}
          onDragEnd={onSeal}
        />
      </div>
      <div className="sd-cue-switches">
        <Toggle
          isSelected={cue.loop}
          isDisabled={readOnly}
          onChange={(loop) =>
            onChange({ loop }, words.t(loop ? 'sound.step.loop' : 'sound.step.noLoop', { name }))
          }
        >
          {words.t('sound.cue.loop')}
        </Toggle>
        <Toggle
          isSelected={cue.carriesOn}
          isDisabled={readOnly}
          onChange={(carriesOn) =>
            onChange(
              { carriesOn },
              words.t(carriesOn ? 'sound.step.carryOn' : 'sound.step.noCarryOn', { name }),
            )
          }
        >
          {words.t('sound.cue.carryOn')}
          <span className="sd-note"> {words.t('sound.cue.carryOnUntil')}</span>
        </Toggle>
        {!readOnly && (
          <Button
            variant="secondary"
            icon="delete"
            aria-label={words.t('sound.cue.removeNamed', { name })}
            onPress={onRemove}
          >
            {words.t('sound.cue.remove')}
          </Button>
        )}
      </div>
    </section>
  );
}

/** A time in seconds, to a tenth, kept to where it can go. */
function Seconds(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  isDisabled: boolean;
  onChange: (seconds: number) => void;
  onSeal: () => void;
}) {
  const { label, value, min, max, isDisabled, onChange, onSeal } = props;
  return (
    <div className="sd-cue-time" onBlur={onSeal}>
      <NumberField
        className="pr-number sd-seconds"
        value={tenth(value)}
        minValue={min}
        maxValue={Math.max(min, max)}
        step={0.1}
        formatOptions={SECONDS}
        isDisabled={isDisabled}
        onChange={(seconds) => {
          if (Number.isFinite(seconds)) onChange(tenth(Math.min(max, Math.max(min, seconds))));
        }}
      >
        <Label className="pr-number-label">{label}</Label>
        <Input className="ss-input pr-number-input" />
      </NumberField>
    </div>
  );
}

const SECONDS = {
  style: 'unit',
  unit: 'second',
  unitDisplay: 'long',
  maximumFractionDigits: 1,
} as const;
