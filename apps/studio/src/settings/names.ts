/**
 * Pupils' names in Settings (`07-ux.md` sections 6.9 and 9.4): the limit, and reading a pasted
 * class list, one name a line, before anything is added.
 */

/** The longest pupil's name, in characters (07-ux section 6.9). */
export const PUPIL_NAME_LIMIT = 40;

/** How a name compares with another: ignoring case and runs of spaces. */
export const sameName = (name: string) =>
  name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-GB');

/** Why a name can't be added, or `null` when it can. */
export type NameProblem = 'empty' | 'tooLong' | 'taken' | 'repeated';

export function nameProblem(name: string, taken: readonly string[]): NameProblem | null {
  const tidy = name.trim();
  if (tidy === '') return 'empty';
  if ([...tidy].length > PUPIL_NAME_LIMIT) return 'tooLong';
  const key = sameName(tidy);
  return taken.some((each) => sameName(each) === key) ? 'taken' : null;
}

export interface PastedName {
  /** The line, tidied: spaces at either end removed, runs of spaces made one. */
  readonly name: string;
  /** `null` for a name that will be added. */
  readonly problem: Exclude<NameProblem, 'empty'> | null;
}

/**
 * A pasted class list, one name a line: each non-blank line, with whether it will be added.
 * A name already in the class, or longer than the limit, is left out, as is a second copy of a
 * name earlier in the paste ("repeated").
 */
export function readPastedNames(text: string, taken: readonly string[]): PastedName[] {
  const seen: string[] = [];
  const names: PastedName[] = [];
  for (const line of text.split(/\r?\n/)) {
    const name = line.trim().replace(/\s+/g, ' ');
    if (name === '') continue;
    const inClass = nameProblem(name, taken);
    const problem =
      inClass === 'tooLong' || inClass === 'taken'
        ? inClass
        : seen.some((each) => sameName(each) === sameName(name))
          ? 'repeated'
          : null;
    if (problem === null) seen.push(name);
    names.push({ name, problem });
  }
  return names;
}
