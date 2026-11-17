/**
 * The study's words for the learner and the teacher (spec 14, 6.3 to 6.5), in one place so they
 * can be translated (English, UK, only for now; decision 0036). Kept outside React, as the
 * check's are, so the studio draws them through `t`.
 */
import enGB from './strings/en-GB.json' with { type: 'json' };

export type StudyWordKey = keyof typeof enGB;

/** The words for `key`, with each `{name}` filled from `values`. */
export function t(
  key: StudyWordKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return enGB[key].replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in values ? String(values[name]) : whole,
  );
}
