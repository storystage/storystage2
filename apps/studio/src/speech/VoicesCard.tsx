/**
 * Settings › Voices (spec 06 section 4.3): the accent, British English by default or American
 * English, for films with no voices of their own on this device, and to change the open film's;
 * then each character's voice in the open film, a preset with a sample to hear. Choosing is one
 * undo step, kept in the film (`manifest.voices`), so it sounds the same on every device.
 */
import { PRESETS, type Preset } from '@storystage/production';
import { Button, Icon, Segmented, useThemeStyle } from '@storystage/ui';
import { useSyncExternalStore } from 'react';
import {
  Button as AriaButton,
  Label,
  ListBox,
  ListBoxItem,
  Popover,
  Select,
  SelectValue,
} from 'react-aria-components';
import { words } from '../strings.ts';
import type { Studio } from '../studio.ts';
import { useAccentSetting, type DeviceAccent } from './accentSetting.ts';
import { VoicesDownload } from './VoicesDownload.tsx';
import type { Voices } from './voices.ts';
import './voices.css';

const ACCENTS: readonly { id: DeviceAccent; label: string }[] = [
  { id: 'british', label: 'voices.british' },
  { id: 'american', label: 'voices.american' },
];

export function VoicesCard({ studio, voices }: { studio: Studio | null; voices: Voices | null }) {
  const themeStyle = useThemeStyle();
  const [accent, setAccent] = useAccentSetting();
  useSyncExternalStore(
    (l) => voices?.subscribe(l) ?? (() => {}),
    () => voices?.state ?? null,
  );
  const p = studio?.production ?? null;
  const editable = studio !== null && studio.readOnly === null;
  const filmAccent = p && voices ? voices.accentOf(p) : accent;
  const cast = voices ? [...voices.voices] : [];
  const accentWord = (a: DeviceAccent) =>
    words.t(a === 'british' ? 'voices.british' : 'voices.american');

  return (
    <div className="st-page">
      <section className="st-card vo-card" aria-labelledby="st-voices-title">
        <h2 id="st-voices-title" className="st-card-title">
          {words.t('voices.title')}
        </h2>
        <Segmented
          label={words.t('voices.accent')}
          options={ACCENTS.map((a) => ({ id: a.id, label: words.t(a.label as 'voices.british') }))}
          value={accent}
          onChange={setAccent}
        />
        <p className="st-note">{words.t('voices.accentHelp')}</p>
        {p && editable && voices && filmAccent !== accent && (
          <Button
            variant="secondary"
            onPress={() =>
              studio!.commit(
                words.t('voices.accentStep', { accent: accentWord(accent) }),
                voices.withAccent(p, accent),
              )
            }
          >
            {words.t('voices.useAccent', { accent: accentWord(accent) })}
          </Button>
        )}
        {voices && <VoicesDownload voices={voices} />}
        {p && voices ? (
          <ul className="vo-cast" aria-label={words.t('voices.cast')}>
            {cast.map(([name, voice]) => (
              <li key={name} className="vo-member">
                <span className="vo-name">{name}</span>
                <Select
                  className="vo-preset"
                  aria-label={words.t('voices.presetOf', { name })}
                  selectedKey={voice.preset}
                  isDisabled={!editable}
                  onSelectionChange={(key) => {
                    if (key === null || key === voice.preset) return;
                    studio!.commit(
                      words.t('voices.presetStep', {
                        name,
                        preset: words.t(`voices.preset.${key as Preset}`),
                      }),
                      voices.withPreset(p, name, key as Preset),
                    );
                  }}
                >
                  <Label className="ss-visually-hidden">
                    {words.t('voices.presetOf', { name })}
                  </Label>
                  <AriaButton className="pr-picker-button">
                    <SelectValue />
                    <Icon name="arrow_drop_down" />
                  </AriaButton>
                  <Popover className="ss-root sb-popover" style={themeStyle}>
                    <ListBox className="sb-menu" items={PRESETS.map((id) => ({ id }))}>
                      {(item) => (
                        <ListBoxItem id={item.id} className="sb-menu-item">
                          {words.t(`voices.preset.${item.id}`)}
                        </ListBoxItem>
                      )}
                    </ListBox>
                  </Popover>
                </Select>
                <Button
                  variant="quiet"
                  icon="play_arrow"
                  aria-label={words.t('voices.hearFor', { name })}
                  isDisabled={
                    voices.state.status === 'ask' || voices.state.status === 'downloading'
                  }
                  onPress={() => void voices.sample(name, words.t('voices.sample', { name }))}
                >
                  {words.t('voices.hear')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="st-note">{words.t('voices.noCast')}</p>
        )}
      </section>
    </div>
  );
}
