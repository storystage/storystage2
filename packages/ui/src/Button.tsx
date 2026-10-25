import type { ReactNode } from 'react';
import { Button as AriaButton, type ButtonProps as AriaButtonProps } from 'react-aria-components';
import { Icon, type IconName } from './Icon.tsx';

export type ButtonVariant =
  | 'primary' // amber: the one main action
  | 'strong' // chalk (dark) or ink (light)
  | 'secondary' // outlined
  | 'quiet' // text only
  | 'stop' // Stop, Stop export
  | 'prompter'; // the Prompter's own actions only

export interface ButtonProps extends Omit<AriaButtonProps, 'children' | 'className' | 'style'> {
  variant?: ButtonVariant;
  /** Every main control has an icon and a label (Direction A). */
  icon?: IconName;
  /** Filled icon, as on Stop and Rehearse. */
  iconFilled?: boolean;
  /** `key` is 52 px tall, for key actions such as Build these steps. */
  size?: 'normal' | 'key';
  children: ReactNode;
}

/**
 * A button on React Aria (12.3): Enter and Space press it, it shows Direction A's focus ring only for
 * keyboard focus, and a disabled button keeps its label so the learner can still read it.
 */
export function Button({
  variant = 'secondary',
  icon,
  iconFilled,
  size = 'normal',
  children,
  ...props
}: ButtonProps) {
  return (
    <AriaButton {...props} className="ss-button" data-variant={variant} data-size={size}>
      {icon && <Icon name={icon} filled={iconFilled ?? variant === 'stop'} />}
      {children}
    </AriaButton>
  );
}
