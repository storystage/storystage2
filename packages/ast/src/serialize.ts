/** The bytes of a program: the same program always gives the same text (spec section 5). */
import type { Program } from './nodes.ts';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value !== 'object' || value === null) return value;
  const object = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.keys(object)
      .sort()
      .map((key) => [key, sortKeys(object[key])]),
  );
}

/** JSON with every object's keys sorted by code unit, however the program was built. */
export const serializeProgram = (program: Program): string => JSON.stringify(sortKeys(program));
