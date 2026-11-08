import { createStrings } from '@storystage/ui';
import enGB from './strings/en-GB.json' with { type: 'json' };

/** The Screening room's words. English (UK) only for now (decision 0036). */
export const words = createStrings(enGB);
export type WordKey = keyof typeof enGB;
