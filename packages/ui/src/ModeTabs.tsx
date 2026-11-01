import type { ReactNode } from 'react';
import { Tab, TabList, TabPanel, Tabs, type Key } from 'react-aria-components';
import { Icon, type IconName } from './Icon.tsx';
import { messages } from './messages.ts';

/** The three modes, in order (decision 0015). */
export const MODES = ['storyboard', 'production', 'screening'] as const;
export type Mode = (typeof MODES)[number];

const ICON: Record<Mode, IconName> = {
  storyboard: 'draw',
  production: 'videocam',
  screening: 'theaters',
};

export interface ModeTabsProps {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  /** The shell: put <ModeTabList /> in the header and a <ModePanel> per mode in the working area. */
  children: ReactNode;
}

/**
 * The header's three mode tabs (07-ux §2.1): a tab list, so the arrow keys move between modes and
 * the working area is the selected tab's panel. Learn and Settings sit apart from it.
 */
export function ModeTabs({ mode, onModeChange, children }: ModeTabsProps) {
  return (
    <Tabs selectedKey={mode} onSelectionChange={(key: Key) => onModeChange(key as Mode)}>
      {children}
    </Tabs>
  );
}

export function ModeTabList() {
  return (
    <TabList className="ss-mode-tabs" aria-label={messages.t('mode.label')}>
      {MODES.map((m) => (
        <Tab key={m} id={m} className="ss-mode-tab">
          <Icon name={ICON[m]} size={24} />
          <span className="ss-mode-tab-label">{messages.t(`mode.${m}`)}</span>
        </Tab>
      ))}
    </TabList>
  );
}

export function ModePanel({ mode, children }: { mode: Mode; children: ReactNode }) {
  return (
    <TabPanel id={mode} className="ss-mode-panel">
      {children}
    </TabPanel>
  );
}
