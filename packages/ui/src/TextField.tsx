import {
  Input,
  Label,
  Text,
  TextField as AriaTextField,
  type TextFieldProps as AriaTextFieldProps,
} from 'react-aria-components';
import { Button } from './Button.tsx';
import { messages } from './messages.ts';

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'children' | 'className'> {
  label: string;
  placeholder?: string;
  description?: string;
  /**
   * Called by the mic button beside the field (Direction A: every field where learners type has one).
   * Leave it out where speaking must not be offered, such as the Claude key field.
   */
  onSpeak?: () => void;
  /** Hides the label visually, where the layout already shows it (it stays for screen readers). */
  hideLabel?: boolean;
}

/** A text field, 48 px tall, with its mic button beside it (Direction A). */
export function TextField({
  label,
  placeholder,
  description,
  onSpeak,
  hideLabel,
  ...props
}: TextFieldProps) {
  return (
    <AriaTextField {...props} className="ss-field">
      <Label className={hideLabel ? 'ss-visually-hidden' : 'ss-field-label'}>{label}</Label>
      <div className="ss-field-row">
        <Input className="ss-input" placeholder={placeholder} />
        {onSpeak && (
          <Button
            variant="secondary"
            icon="mic"
            aria-label={messages.t('field.speak', { label })}
            onPress={onSpeak}
          />
        )}
      </div>
      {description && (
        <Text slot="description" className="ss-field-description">
          {description}
        </Text>
      )}
    </AriaTextField>
  );
}
