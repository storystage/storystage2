/**
 * Types on Blockly's connections (`14-editors.md` section 3i.3). Blockly connects a value to a
 * slot when the value's output check and the slot's input check share a name. A slot's check is
 * the type it wants; a value's check is every type it fits, by the Story API's own `fits`, so
 * Blockly refuses what `canDrop` would refuse. A value whose type can't be known has no check,
 * and fits anywhere; `canDrop` (section 2.2) has the final word on drop.
 */
import {
  API_CLASSES,
  BASIC_TYPES,
  ENTRIES,
  ENUMS,
  REFERENCE_TYPES,
  classChain,
  fits,
  type ApiClass,
  type TypeName,
} from '@storystage/story-api';

/** A class as a type: the `Text` class's 3D text is a `TextModel` (spec 02). */
const classType = (cls: ApiClass): TypeName => (cls === 'Text' ? 'TextModel' : cls) as TypeName;

const ONE: readonly TypeName[] = [
  ...BASIC_TYPES,
  ...REFERENCE_TYPES,
  ...(Object.keys(ENUMS) as TypeName[]),
  ...API_CLASSES.map(classType),
];

/** Every type a slot can want: each single type, and a list of each. */
export const ALL_TYPES: readonly TypeName[] = [...ONE, ...ONE.map((t) => `${t}[]` as TypeName)];

/** A slot's check: the one type it wants. */
export const inputCheck = (wanted: TypeName): string[] => [wanted];

/** A value's check: every type it fits, or `null` (anything) when its type can't be known. */
export function outputCheck(type: TypeName | null): string[] | null {
  if (type === null) return null;
  return ALL_TYPES.filter((wanted) => fits(type, wanted));
}

/**
 * The target slot of a Story API block: every class that has the entry, with the classes made
 * from it. An entry with the same name on two classes (`setPaint` on Ground and Model) has the
 * same parameters on both, so it is one block.
 */
export function targetCheck(name: string): string[] {
  const owners = ENTRIES.filter((e) => e.name === name).map((e) => e.on);
  const classes = API_CLASSES.filter((cls) => classChain(cls).some((c) => owners.includes(c)));
  return classes.map(classType);
}
