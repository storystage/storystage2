import type { Expression, Program } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { newCall } from './build.ts';
import { field, ID, mint, num, scene, self, text } from './testing.ts';
import { describer } from './words.ts';

// An input a block leaves out because it has a default reads as the default, not as "???".

/** The fixture with rex's hop taking `value` unless it's given a height. */
function withDefault(value: Expression): Program {
  const program = scene();
  return {
    ...program,
    types: program.types.map((type) =>
      type.id !== ID.pet
        ? type
        : {
            ...type,
            methods: type.methods.map((method) => ({
              ...method,
              params: method.params.map((p) => (p.id === ID.height ? { ...p, default: value } : p)),
            })),
          },
    ),
  };
}

const hopped = (program: Program, args: Record<string, Expression> = {}) => {
  const made = newCall(program, field(ID.rex), { kind: 'user', method: ID.hop }, false, mint);
  return describer(program).inside({ ...made, args }, ID.scene);
};

describe('an input left at its default', () => {
  it('reads as the default', () => {
    expect(hopped(withDefault(num(2)))).toBe('rex hop height 2');
  });

  it('reads as what it’s given, when it is', () => {
    expect(hopped(withDefault(num(2)), { [ID.height]: num(5) })).toBe('rex hop height 5');
  });

  it('still reads ??? with no default', () => {
    expect(hopped(scene())).toBe('rex hop height ???');
  });

  it('reads this as the character the procedure is for', () => {
    expect(hopped(withDefault(self()))).toBe('rex hop height this pet');
  });

  it('reads a default that’s text', () => {
    expect(hopped(withDefault(text('high') as Expression))).toBe('rex hop height high');
  });

  it('stops at a default that calls its own procedure', () => {
    const again: Expression = {
      id: mint(),
      kind: 'functionCall',
      target: self(),
      callee: { kind: 'user', method: ID.hop },
      args: {},
      details: {},
    };
    expect(hopped(withDefault(again))).toBe('rex hop height this pet hop height ???');
  });
});
