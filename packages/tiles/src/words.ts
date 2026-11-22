/** The tile editor's own words, beside the Story API's (`@storystage/story-api/editing`). */
import { fill } from '@storystage/story-api/editing';
import strings from './strings/en-GB.json' with { type: 'json' };

const all = strings as Readonly<Record<string, string>>;

/** `tiles.<key>` from this package's strings, with `{name}` values filled. */
export const t = (key: string, values: Readonly<Record<string, string>> = {}): string =>
  fill(all[`tiles.${key}`] ?? key, values);
