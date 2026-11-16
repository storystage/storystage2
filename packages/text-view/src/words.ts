/** The text view's own words. */
import { fill } from '@storystage/story-api/editing';
import strings from './strings/en-GB.json' with { type: 'json' };

const all = strings as Readonly<Record<string, string>>;

/** `textView.<key>` from this package's strings, with `{name}` values filled. */
export const t = (key: string, values: Readonly<Record<string, string>> = {}): string =>
  fill(all[`textView.${key}`] ?? key, values);
