import {
  Input,
  Label,
  Text,
  TextArea,
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
  /** A paragraph rather than a line, such as a synopsis. */
  multiline?: boolean;
}

/**
 * A text field, 48 px tall (taller for a paragraph), with its mic button beside it (Direction A).
 * With `maxLength`, typing stops at the limit and the field says so (`07-ux.md` section 6.9).
 */
export function TextField({
  label,
  placeholder,
  description,
  onSpeak,
  hideLabel,
  multiline,
  ...props
}: TextFieldProps) {
  const atLimit =
    props.maxLength !== undefined &&
    typeof props.value === 'string' &&
    props.value.length >= props.maxLength;
  const note = atLimit ? messages.t('field.atLimit', { n: props.maxLength! }) : description;
  return (
    <AriaTextField {...props} className="ss-field">
      <Label className={hideLabel ? 'ss-visually-hidden' : 'ss-field-label'}>{label}</Label>
      <div className="ss-field-row">
        {multiline ? (
          <TextArea className="ss-input ss-textarea" placeholder={placeholder} />
        ) : (
          <Input className="ss-input" placeholder={placeholder} />
        )}
        {onSpeak && (
          <Button
            variant="secondary"
            icon="mic"
            aria-label={messages.t('field.speak', { label })}
            onPress={onSpeak}
          />
        )}
      </div>
      {note && (
        <Text slot="description" className="ss-field-description">
          {note}
        </Text>
      )}
    </AriaTextField>
  );
}
