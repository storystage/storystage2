import { TextField, type TextFieldProps } from '@storystage/ui';
import { useFieldSpeech } from './talkToType.tsx';

/**
 * A text field with Talk to type's mic beside it, where it's offered (spec 06 section 1.1).
 * `field` names it uniquely in the studio, so one take serves one field.
 */
export function SpokenField({ field, ...props }: TextFieldProps & { field: string }) {
  const speech = useFieldSpeech(field);
  return <TextField {...props} {...(speech ? { speech } : {})} />;
}
