import { ICONS, ICON_VIEWBOX, type IconName } from './icons.generated.ts';

export interface IconProps {
  name: IconName;
  /** The filled form, as Direction A uses for status icons (Checked, Look at, Coded). */
  filled?: boolean;
  /** Size in px; Direction A uses 15 (status), 20–24 (buttons, tabs) and 26–30 (dialogs). */
  size?: number;
}

/**
 * A Material Symbols Rounded icon, drawn inline in the text colour. Icons are decoration: the word
 * beside them carries the meaning (07-ux §4), so screen readers skip them.
 */
export function Icon({ name, filled = false, size = 22 }: IconProps) {
  const icon = ICONS[name];
  return (
    <svg
      className="ss-icon"
      width={size}
      height={size}
      viewBox={ICON_VIEWBOX}
      aria-hidden="true"
      focusable="false"
      data-icon={name}
    >
      <path d={filled ? icon.filled : icon.outline} />
    </svg>
  );
}

export type { IconName };
