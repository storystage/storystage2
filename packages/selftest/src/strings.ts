/**
 * The self-test's words: its steps, its problems and its report, in one place so they can be
 * translated (English, UK, only for now; decision 0036). The self-test runs outside React, so this
 * is a plain lookup, as `@storystage/check`'s is. `SELFTEST PASS` and `SELFTEST FAIL` aren't here:
 * they are for scripts to read, in every language.
 */
import enGB from './strings/en-GB.json' with { type: 'json' };

export type WordKey = keyof typeof enGB;

/** The words for `key`, with each `{name}` filled from `values`. */
export function t(key: WordKey, values: Readonly<Record<string, string | number>> = {}): string {
  return enGB[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}
