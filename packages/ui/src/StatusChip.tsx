import { Icon, type IconName } from './Icon.tsx';
import { messages } from './messages.ts';

/** A frame's status (07-ux §2.3). */
export const FRAME_STATUSES = [
  'planned',
  'staged',
  'coded',
  'rehearsed',
  'checked',
  'lookAt',
] as const;
export type FrameStatus = (typeof FRAME_STATUSES)[number];

const ICON: Record<FrameStatus, { name: IconName; filled: boolean }> = {
  planned: { name: 'edit_note', filled: false },
  staged: { name: 'view_in_ar', filled: false },
  coded: { name: 'extension', filled: true },
  rehearsed: { name: 'replay', filled: false },
  checked: { name: 'check_circle', filled: true },
  lookAt: { name: 'flag', filled: true },
};

export interface StatusChipProps {
  status: FrameStatus;
}

/** A frame's status as its icon and its word, never colour alone (Direction A). */
export function StatusChip({ status }: StatusChipProps) {
  const icon = ICON[status];
  return (
    <span className="ss-status" data-status={status}>
      <Icon name={icon.name} filled={icon.filled} size={15} />
      {messages.t(`status.${status}`)}
    </span>
  );
}

/** The AI badge, which the Prompter always wears and nothing else may. */
export function AiBadge() {
  return <span className="ss-ai-badge">{messages.t('prompter.badge')}</span>;
}
