/**
 * Settings › Accessibility (`07-ux.md` sections 2.2 and 4): the theme and the text size, on this
 * device, for everyone who uses it. Both change the studio at once.
 */
import { Segmented } from '@storystage/ui';
import { words } from '../strings.ts';
import {
  TEXT_SIZE_CHOICES,
  THEME_CHOICES,
  useAppearanceSetting,
  type TextSize,
  type ThemeChoice,
} from './appearance.ts';

const THEME_WORD = {
  dark: 'settings.theme.dark',
  light: 'settings.theme.light',
  device: 'settings.theme.device',
} as const satisfies Record<ThemeChoice, string>;

export function AccessibilityCard() {
  const [appearance, setAppearance] = useAppearanceSetting();
  return (
    <div className="st-page">
      <section className="st-card st-access" aria-labelledby="st-access-title">
        <h2 id="st-access-title" className="st-card-title">
          {words.t('settings.access')}
        </h2>
        <span className="st-label" aria-hidden="true">
          {words.t('settings.theme')}
        </span>
        <Segmented
          label={words.t('settings.theme')}
          options={THEME_CHOICES.map((id) => ({ id, label: words.t(THEME_WORD[id]) }))}
          value={appearance.theme}
          onChange={(theme) => setAppearance({ theme })}
        />
        <span className="st-label" aria-hidden="true">
          {words.t('settings.textSize')}
        </span>
        <Segmented
          label={words.t('settings.textSize')}
          options={TEXT_SIZE_CHOICES.map((size) => ({
            id: String(size),
            label: words.t('settings.textSize.percent', { percent: Math.round(size * 100) }),
          }))}
          value={String(appearance.textSize)}
          onChange={(size) => setAppearance({ textSize: Number(size) as TextSize })}
        />
        <p className="st-note">{words.t('settings.access.help')}</p>
      </section>
    </div>
  );
}
