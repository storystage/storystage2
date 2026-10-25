import enGB from './strings/en-GB.json' with { type: 'json' };
import { createStrings } from './strings.ts';

/** The design system's own words: status names, Prompter labels, notes (decision 0036: English (UK)). */
export const messages = createStrings(enGB);
export type MessageKey = keyof typeof enGB;
