import { createStrings } from '@storystage/ui';
import enGB from './strings/en-GB.json' with { type: 'json' };

/**
 * The studio's words: the shell and the three tabs (WP12.4, docs/spec/07-ux.md §3). The design
 * system's own words (mode names, statuses, the Prompter's labels) are in @storystage/ui's
 * `messages`. English (UK) only for now (decision 0036).
 */
export const words = createStrings(enGB);
export type WordKey = keyof typeof enGB;
