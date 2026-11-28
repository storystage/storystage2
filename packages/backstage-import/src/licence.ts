/**
 * WP3.12, licence capture for an imported model (spec 17, section 6). The rules are
 * `captureLicence` in `@storystage/backstage`, shared with an imported sound (spec 03, section
 * 1.7); these are the model's words and the model's credit.
 *
 * Licences and credits are part of what learners learn, as they are in industry.
 */
import {
  captureLicence,
  type LicenceAnswers,
  type LicenceProblem,
  type LicenceRecord,
} from '@storystage/backstage';

export {
  LICENCE_CHOICES,
  MAKER_MAX,
  SOURCE_MAX,
  type LicenceAnswers,
  type LicenceChoice,
  type LicenceProblem,
  type LicenceRecord,
} from '@storystage/backstage';

/** In plain words, for the model import's licence step. */
export const LICENCE_PROBLEMS: Readonly<Record<LicenceProblem, string>> = {
  needsSource: "Paste the address of the model's own page, where you found it.",
  badSource: "That doesn't look like a web page's address. It should start with https://.",
  needsMaker:
    'This licence asks you to name who made the model. Their name is usually on its page.',
  needsName: 'Give the model a name first.',
};

/**
 * The licence, credit line and source for a model called `name`, from the person's answers.
 * Every import changes the model (it's reduced and re-encoded), so a CC BY credit ends ", changed
 * for StoryStage" (`creditFor`; spec 17, section 3a, rule 4).
 */
export function licenceRecord(
  name: string,
  answers: LicenceAnswers,
):
  | { readonly ok: true; readonly record: LicenceRecord }
  | { readonly ok: false; readonly problems: readonly LicenceProblem[] } {
  return captureLicence(name, answers, true);
}
