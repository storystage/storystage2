/**
 * Strings (WP12.4): every word on screen comes from a translation file, `src/strings/<lang>.json`,
 * never from a component. Text can carry named values (`{name}`). Plurals are separate keys ending in
 * the language's plural category (`.one`, `.other`), chosen with `Intl.PluralRules`.
 * The first release ships English (UK) only (decision 0036).
 */

export type Messages = Readonly<Record<string, string>>;
export type Values = Readonly<Record<string, string | number>>;

/** Fills `{name}` placeholders. A placeholder with no value is an error, so a missing value never reaches the screen. */
export function format(message: string, values: Values = {}): string {
  return message.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`No value for {${name}} in "${message}"`);
    return String(value);
  });
}

export interface Strings<M extends Messages> {
  /** The message for a key, with its placeholders filled. */
  t(key: keyof M & string, values?: Values): string;
  /** The plural form of `key` for `count` (`key.one`, `key.other`, …); `{count}` is filled in. */
  plural(key: string, count: number, values?: Values): string;
}

export function createStrings<M extends Messages>(messages: M, locale = 'en-GB'): Strings<M> {
  const rules = new Intl.PluralRules(locale);
  const lookup = (key: string): string => {
    const message = messages[key];
    if (message === undefined) throw new Error(`No string for "${key}" (${locale})`);
    return message;
  };
  return {
    t: (key, values) => format(lookup(key), values),
    plural: (key, count, values = {}) => {
      const category = rules.select(count);
      const message = messages[`${key}.${category}`] ?? lookup(`${key}.other`);
      return format(message, { ...values, count });
    },
  };
}
