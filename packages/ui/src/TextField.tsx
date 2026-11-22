import { useEffect, useRef } from 'react';
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

/**
 * Talk to type for one field (`docs/spec/06-speech.md` sections 1.5 and 1.7): the studio's one
 * take, as this field sees it. The studio makes it; the field draws the mic and puts the words in.
 */
export interface FieldSpeech {
  /** This field's take. `idle` while no take is for this field. */
  readonly phase: 'idle' | 'listening' | 'working';
  /** How loud the microphone is, 0 to 1, while listening. */
  readonly level: number;
  /** What went wrong with this field's last take, in plain words, or `null`. */
  readonly problem: string | null;
  /**
   * The mic tapped: starts a take for this field, or stops it. The words come to `insert`, which
   * puts them in the field at the caret.
   */
  toggle(insert: (words: string) => void): void;
  /** Esc on the mic: stops the take and throws the audio away. */
  cancel(): void;
}

export interface TextFieldProps extends Omit<AriaTextFieldProps, 'children' | 'className'> {
  label: string;
  placeholder?: string;
  description?: string;
  /**
   * Called by the mic button beside the field (Direction A: every field where learners type has one).
   * Leave it out where speaking must not be offered, such as the Claude key field.
   */
  onSpeak?: () => void;
  /** Talk to type: the mic beside the field, its take and its words. Wins over `onSpeak`. */
  speech?: FieldSpeech;
  /** Hides the label visually, where the layout already shows it (it stays for screen readers). */
  hideLabel?: boolean;
  /** A paragraph rather than a line, such as a synopsis. */
  multiline?: boolean;
}

/**
 * `words` put into `value` in place of `start`..`end`, with a space either side where the text
 * runs on, and cut to fit `maxLength`. Returns the new value and where the caret goes.
 */
export function insertWords(
  value: string,
  words: string,
  start: number,
  end: number,
  maxLength?: number,
): { value: string; caret: number } {
  const before = value.slice(0, start);
  const after = value.slice(end);
  let text = words.trim();
  if (text === '') return { value, caret: end };
  if (before !== '' && !/\s$/u.test(before)) text = ` ${text}`;
  if (after !== '' && !/^[\s.,;:!?]/u.test(after)) text = `${text} `;
  if (maxLength !== undefined) {
    const room = Math.max(0, maxLength - before.length - after.length);
    text = [...text].slice(0, room).join('');
  }
  return { value: before + text + after, caret: before.length + text.length };
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
  speech,
  hideLabel,
  multiline,
  ...props
}: TextFieldProps) {
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  // Where the caret goes once the words are in: after the next render.
  const caret = useRef<number | null>(null);
  useEffect(() => {
    const at = caret.current;
    const el = input.current;
    if (at === null || !el) return;
    caret.current = null;
    el.focus();
    el.setSelectionRange(at, at);
  });

  const atLimit =
    props.maxLength !== undefined &&
    typeof props.value === 'string' &&
    props.value.length >= props.maxLength;
  const phase = speech?.phase ?? 'idle';
  const status =
    phase === 'listening'
      ? messages.t('field.listening')
      : phase === 'working'
        ? messages.t('field.working')
        : (speech?.problem ?? null);
  const note = atLimit ? messages.t('field.atLimit', { n: props.maxLength! }) : description;

  /** The words, at the caret or over the selection, as the field's own change. */
  const insert = (words: string) => {
    const el = input.current;
    const value = typeof props.value === 'string' ? props.value : (el?.value ?? '');
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    const next = insertWords(value, words, start, end, props.maxLength);
    if (next.value === value) return;
    caret.current = next.caret;
    if (el && props.value === undefined) el.value = next.value;
    props.onChange?.(next.value);
  };

  return (
    <AriaTextField {...props} className="ss-field">
      <Label className={hideLabel ? 'ss-visually-hidden' : 'ss-field-label'}>{label}</Label>
      <div className="ss-field-row">
        {multiline ? (
          <TextArea ref={input} className="ss-input ss-textarea" placeholder={placeholder} />
        ) : (
          <Input ref={input} className="ss-input" placeholder={placeholder} />
        )}
        {speech ? (
          <span className="ss-mic" data-phase={phase}>
            <Button
              variant="secondary"
              icon="mic"
              aria-label={messages.t(phase === 'listening' ? 'field.stopSpeaking' : 'field.speak', {
                label,
              })}
              aria-pressed={phase === 'listening'}
              onPress={() => {
                if (phase !== 'working') speech.toggle(insert);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape' && phase !== 'idle') speech.cancel();
                else e.continuePropagation();
              }}
            />
            {phase === 'listening' && (
              <span className="ss-mic-level" aria-hidden="true">
                <span
                  style={{ transform: `scaleX(${Math.min(1, Math.max(0.04, speech.level))})` }}
                />
              </span>
            )}
          </span>
        ) : (
          onSpeak && (
            <Button
              variant="secondary"
              icon="mic"
              aria-label={messages.t('field.speak', { label })}
              onPress={onSpeak}
            />
          )
        )}
      </div>
      {note && (
        <Text slot="description" className="ss-field-description">
          {note}
        </Text>
      )}
      {speech && (
        // Always there, so a screen reader hears each change: "Listening…", then the words' arrival.
        <span className="ss-field-status" role="status" data-phase={phase}>
          {status ?? ''}
        </span>
      )}
    </AriaTextField>
  );
}
