/**
 * What the shared model works out from a whole program, kept with that program (spec 14, 3h).
 * A program is immutable (spec 01), so what's true of one stays true of it, and an editor that
 * asks the same thing for each of 500 rows gets it worked out once. A `WeakMap` lets each go
 * with its program.
 */
import { indexProgram, type Program } from '@storystage/ast';
import { programTypes } from '../catalog/program-types.ts';

/** `make`, worked out once for each program. */
export function perProgram<T>(make: (program: Program) => T): (program: Program) => T {
  const kept = new WeakMap<Program, T>();
  return (program) => {
    if (kept.has(program)) return kept.get(program)!;
    const made = make(program);
    kept.set(program, made);
    return made;
  };
}

/** Where every node is. Callers only read it. */
export const indexOf = perProgram(indexProgram);

export const typesOf = perProgram(programTypes);
