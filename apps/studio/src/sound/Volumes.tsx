/**
 * The tracks' volumes, in the Sound view (`07-ux.md` section 7.7; decision 0076, workplan 7.17):
 * Speech, Music and Sound FX, each a slider and a percentage, for the whole film (`withMix`; 100%,
 * 70% and 90% until changed). A drag is one undo step, written as it's let go, and so is a run of
 * key presses on one slider, named where it stopped ("Set Music to 60%").
 */
import { mixOf, withMix, type SoundMix } from '@storystage/production';
import { useEffect, useRef } from 'react';
import { Input, Label, NumberField, Slider, SliderThumb, SliderTrack } from 'react-aria-components';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import './sound.css';

const TRACKS: readonly (keyof SoundMix)[] = ['speech', 'music', 'effects'];

const PERCENT = { style: 'unit', unit: 'percent' } as const;

export interface VolumesProps {
  readonly studio: Studio;
  /** The film can't be changed: its volumes show, and nothing changes them. */
  readonly readOnly: boolean;
}

export function Volumes({ studio, readOnly }: VolumesProps) {
  const mix = mixOf(studio.production);
  // The production as the last change left it, for a slider's next step before React draws.
  const latest = useRef(studio.production);
  useEffect(() => {
    latest.current = studio.production;
  });
  // A pointer is dragging a slider: letting go ends its step.
  const dragging = useRef(false);

  const set = (track: keyof SoundMix, percent: number) => {
    const value = Math.round(Math.min(100, Math.max(0, percent)));
    const now = latest.current;
    if (Math.round(mixOf(now)[track] * 100) === value) return;
    const next = withMix(now, { ...mixOf(now), [track]: value / 100 });
    latest.current = next;
    studio.commit(
      words.t('sound.step.volume', { track: words.t(`sound.track.${track}`), value }),
      next,
      `volume:${track}`,
      'last',
    );
  };

  return (
    <section className="sd-volumes" aria-labelledby="sd-volumes-title">
      <h3 className="sd-heading" id="sd-volumes-title">
        {words.t('sound.volumes.title')}
      </h3>
      <p className="sd-note">{words.t('sound.volumes.film')}</p>
      {TRACKS.map((track) => {
        const name = words.t(`sound.track.${track}`);
        const value = Math.round(mix[track] * 100);
        return (
          // Leaving a track's controls ends its step; so does letting go of a drag.
          <div key={track} className="sd-volume" data-track={track} onBlur={() => studio.seal()}>
            <Slider
              className="sd-volume-slider"
              value={value}
              minValue={0}
              maxValue={100}
              step={1}
              formatOptions={PERCENT}
              isDisabled={readOnly}
              onChange={(percent) => set(track, percent)}
              onChangeEnd={() => {
                if (dragging.current) studio.seal();
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
              aria-label={words.t('sound.volumes.percent', { track: name })}
              value={value}
              minValue={0}
              maxValue={100}
              step={1}
              formatOptions={PERCENT}
              isDisabled={readOnly}
              onChange={(percent) => {
                if (Number.isFinite(percent)) set(track, percent);
              }}
            >
              <Input className="ss-input pr-number-input" />
            </NumberField>
            {track === 'music' && (
              <p className="sd-note sd-volume-note">{words.t('sound.volumes.ducking')}</p>
            )}
          </div>
        );
      })}
    </section>
  );
}
