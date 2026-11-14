/**
 * The problem report's words, in one place so they can be translated (English, UK, only for
 * now; decision 0036). A plain lookup, as `@storystage/check`'s and `@storystage/selftest`'s are.
 */
import enGB from './strings/en-GB.json' with { type: 'json' };

export type WordKey = keyof typeof enGB;

/** The words for `key`, with each `{name}` filled from `values`. */
export function t(key: WordKey, values: Readonly<Record<string, string | number>> = {}): string {
  return enGB[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}
