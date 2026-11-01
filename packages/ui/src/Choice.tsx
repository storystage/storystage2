import type { ReactNode } from 'react';
import { Checkbox as AriaCheckbox, Label, Radio, RadioGroup, Switch } from 'react-aria-components';
import { Icon } from './Icon.tsx';

export interface ToggleProps {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  /** What the toggle switches, for example "Lock for pupils". */
  children: ReactNode;
  isDisabled?: boolean;
}

/** A toggle, 52 × 30 (Direction A): on is amber with a dark knob. A switch to screen readers. */
export function Toggle({ isSelected, onChange, children, isDisabled }: ToggleProps) {
  return (
    <Switch
      className="ss-toggle"
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
    >
      <span className="ss-toggle-track" aria-hidden="true">
        <span className="ss-toggle-knob" />
      </span>
      <span className="ss-toggle-label">{children}</span>
    </Switch>
  );
}

export interface CheckboxProps {
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  children: ReactNode;
  isDisabled?: boolean;
}

/** A check box, 26 px (Direction A): checked is amber with a check mark. */
export function Checkbox({ isSelected, onChange, children, isDisabled }: CheckboxProps) {
  return (
    <AriaCheckbox
      className="ss-checkbox"
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
    >
      <span className="ss-checkbox-box" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
      <span>{children}</span>
    </AriaCheckbox>
  );
}

export interface RadioCardOption<V extends string> {
  value: V;
  label: string;
  description?: string;
}

export interface RadioCardsProps<V extends string> {
  /** The question the cards answer, shown as the group's heading. */
  label: ReactNode;
  options: readonly RadioCardOption<V>[];
  value: V;
  onChange: (value: V) => void;
}

/**
 * Radio cards (Direction A): 44 px or taller, the chosen one amber-tinted with an amber ring dot.
 * Used for the Prompter level (decision 0034), licences and who provides the key.
 */
export function RadioCards<V extends string>({
  label,
  options,
  value,
  onChange,
}: RadioCardsProps<V>) {
  return (
    <RadioGroup className="ss-radio-cards" value={value} onChange={(v) => onChange(v as V)}>
      <Label className="ss-group-label">{label}</Label>
      {options.map((o) => (
        <Radio key={o.value} value={o.value} className="ss-radio-card">
          <span className="ss-radio-dot" aria-hidden="true" />
          <span className="ss-radio-text">
            <span className="ss-radio-label">{o.label}</span>
            {o.description && <span className="ss-radio-description">{o.description}</span>}
          </span>
        </Radio>
      ))}
    </RadioGroup>
  );
}

/** A neutral note (Direction A): for something switched off or not available here, never an error. */
export function NeutralNote({ children }: { children: ReactNode }) {
  return (
    <div className="ss-note" role="note">
      <Icon name="info" size={20} />
      <span>{children}</span>
    </div>
  );
}
