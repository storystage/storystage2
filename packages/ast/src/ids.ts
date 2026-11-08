/** Node ids (`docs/spec/01-ast.md`, section 3). */

/** A program node's stable id: short, survives edits; copying mints a new one. */
export type NodeId = string & { readonly __nodeId: true };

/** Marks a string as a node id, for tests and fixtures. Real ids come from `mintId`. */
export const nodeId = (id: string): NodeId => id as NodeId;

export const NODE_ID_PATTERN = '^[a-z][a-z0-9]{5,11}$';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const LETTERS_AND_DIGITS = `${LETTERS}0123456789`;
const FIRST_LENGTH = 6;
const TRIES_AT_EACH_LENGTH = 6;

const pick = (from: string, random: () => number) => from[Math.floor(random() * from.length)]!;

/** A new id that isn't in `taken`. Not a secret: it only has to be different. */
export function mintId(taken: ReadonlySet<string>, random: () => number = Math.random): NodeId {
  for (let length = FIRST_LENGTH; ; length++) {
    for (let tries = 0; tries < TRIES_AT_EACH_LENGTH; tries++) {
      let id = pick(LETTERS, random);
      while (id.length < length) id += pick(LETTERS_AND_DIGITS, random);
      if (!taken.has(id)) return nodeId(id);
    }
  }
}
