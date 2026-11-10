import { nodeId, type Program, type Statement } from '@storystage/ast';
import { describer } from '@storystage/story-api/editing';
import { describe, expect, it } from 'vitest';
import { fixture, IDS } from './fixture.ts';
import { partsOf } from './parts.ts';

/** The fixture with a speak line made from script line `l7` at the start of myFirstMethod. */
function withSpeakLine(): { program: Program; speak: Statement } {
  const program = fixture();
  const speak: Statement = {
    id: nodeId('speakl'),
    kind: 'call',
    target: {
      id: nodeId('speakt'),
      kind: 'fieldRef',
      target: { id: nodeId('speaks'), kind: 'this' },
      field: IDS.cat,
    },
    callee: { kind: 'story', name: 'speakLine' },
    args: { text: { id: nodeId('speakw'), kind: 'text', value: 'Here is the key.' } },
    details: { line: { id: nodeId('speakn'), kind: 'text', value: 'l7' } },
  };
  const main = program.types[0]!.methods[0]!;
  const types = [
    { ...program.types[0]!, methods: [{ ...main, body: [speak, ...main.body] }] },
    ...program.types.slice(1),
  ];
  return { program: { ...program, types }, speak };
}

describe('a speak line made from the script (spec 06, 4.1)', () => {
  it('says it’s from the script, with no pill to change its line', () => {
    const { program, speak } = withSpeakLine();
    const parts = partsOf(speak, describer(program));
    expect(parts.map((p) => p.text)).toEqual([
      'cat',
      'speak line',
      'Here is the key.',
      'from the script',
    ]);
    expect(parts.filter((p) => p.kind === 'value').map((p) => p.text)).toEqual([
      'Here is the key.',
    ]);
    expect(parts.some((p) => p.text === 'l7')).toBe(false);
  });
});
