import {
  Button,
  Icon,
  MODES,
  ModePanel,
  ModeTabList,
  ModeTabs,
  NeutralNote,
  messages,
  type IconName,
  type Mode,
} from '@storystage/ui';
import { useState, type ReactNode } from 'react';
import { ToggleButton } from 'react-aria-components';
import { words } from '../strings.ts';

/** Learn and Settings open over the current mode and close back to it (07-ux §2.1). */
export type Overlay = 'learn' | 'settings';

export interface ShellProps {
  /** The production's title and a sub-line ("Scene 2 · Frame 2.3"), once a production is open. */
  title?: ReactNode;
  subtitle?: ReactNode;
  /** The working area of each mode. WP10a, WP7 and WP11b build them. */
  panels: Readonly<Record<Mode, ReactNode>>;
  /** What Learn and Settings show while open. */
  learn?: ReactNode;
  settings?: ReactNode;
  initialMode?: Mode;
  /** The mode, when the App needs to change it ("Go to the Storyboard"); the shell keeps it otherwise. */
  mode?: Mode;
  onModeChange?: (mode: Mode) => void;
  /** A note across every mode, above the working area: a failed save, a film opened read-only. */
  notice?: ReactNode;
}

/**
 * The studio's shell (Direction A, "Global layout"): a 64 px header with the logo and the
 * production's title, the three mode tabs and, set apart, Learn and Settings; below it the working
 * area inside a 3 px amber frame. Below 1024 px wide, a note asks for more room (decision 0033).
 */
export function Shell({
  title,
  subtitle,
  panels,
  learn,
  settings,
  initialMode = 'storyboard',
  mode: controlled,
  onModeChange,
  notice,
}: ShellProps) {
  const [own, setOwn] = useState<Mode>(initialMode);
  const mode = controlled ?? own;
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const modeName = messages.t(`mode.${mode}`);
  const toggle = (which: Overlay) => (on: boolean) => setOverlay(on ? which : null);
  const changeMode = (next: Mode) => {
    setOwn(next);
    onModeChange?.(next);
    setOverlay(null);
  };

  return (
    <>
      <div className="studio-shell" data-overlay={overlay ?? undefined}>
        <ModeTabs mode={mode} onModeChange={changeMode}>
          <header className="studio-header">
            <div className="studio-brand">
              <LogoMark />
              <span className="studio-wordmark">
                {words.t('shell.wordmark.story')}
                <span className="studio-wordmark-stage">{words.t('shell.wordmark.stage')}</span>
              </span>
              {title && (
                <>
                  <span className="studio-divider" aria-hidden="true" />
                  <span className="studio-title">
                    <span className="studio-title-main">{title}</span>
                    {subtitle && <span className="studio-title-sub">{subtitle}</span>}
                  </span>
                </>
              )}
            </div>
            <div className="studio-modes">
              <ModeTabList />
            </div>
            <div className="studio-tools">
              <span className="studio-divider" aria-hidden="true" />
              <HeaderTool
                icon="school"
                label={messages.t('header.learn')}
                kind="button"
                isSelected={overlay === 'learn'}
                onChange={toggle('learn')}
              />
              <HeaderTool
                icon="settings"
                label={messages.t('header.settings')}
                kind="tab"
                isSelected={overlay === 'settings'}
                onChange={toggle('settings')}
              />
            </div>
          </header>
          <main className="studio-frame">
            {notice && <div className="studio-notice">{notice}</div>}
            <div className="studio-panels" hidden={overlay !== null}>
              {MODES.map((m) => (
                <ModePanel key={m} mode={m}>
                  <h1 className="ss-visually-hidden">{messages.t(`mode.${m}`)}</h1>
                  {panels[m]}
                </ModePanel>
              ))}
            </div>
            {overlay && (
              <section className="studio-overlay" aria-labelledby="studio-overlay-title">
                <h1 id="studio-overlay-title" className="studio-overlay-title">
                  {words.t(overlay === 'learn' ? 'shell.learn.title' : 'shell.settings.title')}
                </h1>
                <Button variant="quiet" icon="chevron_left" onPress={() => setOverlay(null)}>
                  {words.t('shell.back', { mode: modeName })}
                </Button>
                {overlay === 'learn' ? learn : settings}
              </section>
            )}
          </main>
        </ModeTabs>
      </div>
      <div className="studio-too-narrow">
        <LogoMark />
        <h1 className="studio-overlay-title">{words.t('shell.tooNarrow.title')}</h1>
        <NeutralNote>{messages.t('note.tooNarrow')}</NeutralNote>
      </div>
    </>
  );
}

/** Direction A's logo: a spotlight beam, a lamp and a pool of light. Not a clapperboard. */
function LogoMark() {
  return (
    <svg className="studio-logo" viewBox="0 0 36 36" width="36" height="36" aria-hidden="true">
      <rect className="studio-logo-tile" x="0.5" y="0.5" width="35" height="35" rx="9.5" />
      <polygon className="studio-logo-beam" points="5,3.6 12.2,3.6 33.1,28.8 15.8,28.8" />
      <circle className="studio-logo-lamp" cx="8.5" cy="6.5" r="3.5" />
      <ellipse className="studio-logo-pool" cx="24" cy="28" rx="9" ry="3" />
    </svg>
  );
}

interface HeaderToolProps {
  icon: IconName;
  label: string;
  /** Settings becomes an amber tab when open, Learn an amber button (Direction A). */
  kind: 'button' | 'tab';
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
}

/** Learn or Settings: 84 × 46, an icon over its label, pressed while its view is open. */
function HeaderTool({ icon, label, kind, isSelected, onChange }: HeaderToolProps) {
  return (
    <ToggleButton
      className="studio-tool"
      data-kind={kind}
      isSelected={isSelected}
      onChange={onChange}
    >
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </ToggleButton>
  );
}
