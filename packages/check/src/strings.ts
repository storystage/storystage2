/**
 * The check's words for the learner: its items and its undo label, in one place so they can be
 * translated (English, UK, only for now; decision 0036). The check runs outside React, so this is a
 * plain lookup rather than `@storystage/ui`'s strings.
 */
import enGB from './strings/en-GB.json' with { type: 'json' };

export type WordKey = keyof typeof enGB;

/** The words for `key`, with each `{name}` filled from `values`. */
export function t(key: WordKey, values: Readonly<Record<string, string | number>> = {}): string {
  return enGB[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}
