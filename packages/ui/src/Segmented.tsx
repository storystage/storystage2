import { Radio, RadioGroup } from 'react-aria-components';
import { Icon, type IconName } from './Icon.tsx';

export interface SegmentedOption<K extends string> {
  id: K;
  label: string;
  icon?: IconName;
}

export interface SegmentedProps<K extends string> {
  /** Names the group for screen readers, for example "Shot". */
  label: string;
  options: readonly SegmentedOption<K>[];
  /** The chosen segment, or `null` before any is (a question not answered yet). */
  value: K | null;
  onChange: (value: K) => void;
  isDisabled?: boolean;
}

/**
 * A segmented control (Direction A): one choice from a few, such as Wide, Medium or Close-up, or
 * Blocks or Tiles. It is a radio group: Tab lands on the chosen segment and the arrow keys choose
 * the next one, so one segment is always chosen once one has been. A question still to be answered
 * has `null`, and Tab still reaches it. (A value matching no segment would take every segment out
 * of the Tab order, as React Aria's radio group does.)
 */
export function Segmented<K extends string>({
  label,
  options,
  value,
  onChange,
  isDisabled,
}: SegmentedProps<K>) {
  return (
    <RadioGroup
      className="ss-segmented"
      aria-label={label}
      orientation="horizontal"
      value={value}
      onChange={(v) => onChange(v as K)}
      isDisabled={isDisabled}
    >
      {options.map((o) => (
        <Radio key={o.id} value={o.id} className="ss-segment">
          {o.icon && <Icon name={o.icon} size={20} />}
          {o.label}
        </Radio>
      ))}
    </RadioGroup>
  );
}
