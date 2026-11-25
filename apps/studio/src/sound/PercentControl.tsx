/**
 * A volume as a slider and a percentage typed (`07-ux.md` section 7.7): the tracks' volumes, and a
 * music cue's. From 0% to 100% in whole percents; the slider's track is 44 px to touch.
 */
import { useRef } from 'react';
import { Input, Label, NumberField, Slider, SliderThumb, SliderTrack } from 'react-aria-components';
import './sound.css';

const PERCENT = { style: 'unit', unit: 'percent' } as const;

export interface PercentControlProps {
  /** The slider's name, "Music". */
  readonly name: string;
  /** The typed percentage's, "Music as a percentage". */
  readonly percentName: string;
  /** From 0 to 100. */
  readonly value: number;
  readonly isDisabled: boolean;
  readonly onChange: (percent: number) => void;
  /** A pointer let go of the slider: its drag is one step. */
  readonly onDragEnd: () => void;
}

export function PercentControl(props: PercentControlProps) {
  const { name, percentName, value, isDisabled, onChange, onDragEnd } = props;
  // A pointer is dragging the slider: letting go ends its step.
  const dragging = useRef(false);
  return (
    <>
      <Slider
        className="sd-volume-slider"
        value={value}
        minValue={0}
        maxValue={100}
        step={1}
        formatOptions={PERCENT}
        isDisabled={isDisabled}
        onChange={onChange}
        onChangeEnd={() => {
          if (dragging.current) onDragEnd();
          dragging.current = false;
        }}
      >
        <Label className="sd-volume-name">{name}</Label>
        <SliderTrack
          className="sd-volume-track"
          onPointerDown={() => {
            dragging.current = true;
          }}
        >
          {({ state }) => (
            <>
              <div
                className="sd-volume-fill"
                style={{ width: `${state.getThumbPercent(0) * 100}%` }}
              />
              <SliderThumb className="sd-volume-thumb" />
            </>
          )}
        </SliderTrack>
      </Slider>
      <NumberField
        className="sd-volume-percent"
        aria-label={percentName}
        value={value}
        minValue={0}
        maxValue={100}
        step={1}
        formatOptions={PERCENT}
        isDisabled={isDisabled}
        onChange={(percent) => {
          if (Number.isFinite(percent)) onChange(percent);
        }}
      >
        <Input className="ss-input pr-number-input" />
      </NumberField>
    </>
  );
}
