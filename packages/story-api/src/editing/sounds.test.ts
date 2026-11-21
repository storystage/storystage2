import { applyEdits, nodeId, type Expression, type Program, type Statement } from '@storystage/ast';
import { describe, expect, it } from 'vitest';
import { cascadeFor } from './cascade.ts';
import { soundUses } from './sounds.ts';
import { call, field, ID, mint, scene, text } from './testing.ts';
import { describer, referenceTypeAt, type WordsOptions } from './words.ts';

// A block's sound (decision 0076, workplan 7.17): written as text holding a clip's id or a
// shelf sound's Backstage id, as a music cue's is, and shown by its label.

const PLAY = nodeId('playsd');
const SPLASH = nodeId('splash');
const SAID = nodeId('saidsn');

/** The cat plays sn1, and says "sn1", which is only words. */
function withSound(): Program {
  return scene([
    call(
      field(ID.cat),
      'playAudio',
      { audioSource: { id: SPLASH, kind: 'text', value: 'sn1' } },
      PLAY,
    ),
    call(field(ID.cat), 'say', { text: { id: SAID, kind: 'text', value: 'sn1' } }),
  ]);
}

const LABELS: Readonly<Record<string, string>> = {
  sn1: 'Splash',
  'kenney-audio/Sound/door-creak': 'Door',
};
const words: WordsOptions = {
  referenceWord: (type, value) => (type === 'Audio' ? LABELS[value] : undefined),
};

describe('a block’s sound (0076, 7.17)', () => {
  it('knows a sound’s place from a text that only reads like one', () => {
    const program = withSound();
    expect(referenceTypeAt(program, SPLASH)).toBe('Audio');
    expect(referenceTypeAt(program, SAID)).toBeNull();
  });

  it('is shown by its label, and other text as it is', () => {
    const describe_ = describer(withSound(), words);
    const body = withSound().types[0]!.methods[0]!.body;
    expect(describe_(body[2]!)).toBe('cat play Splash');
    expect(describe_(body[3]!)).toBe('cat say sn1');
    // Without the studio's words, the id.
    expect(describer(withSound())(body[2]!)).toBe('cat play sn1');
  });

  it('keeps one describer for each program and options object', () => {
    const program = withSound();
    expect(describer(program, words)).toBe(describer(program, words));
    expect(describer(program, words)).not.toBe(describer(program));
  });

  it('finds every block that plays it, and nothing that only says its id', () => {
    expect(soundUses(withSound(), 'sn1')).toEqual([SPLASH]);
    expect(soundUses(withSound(), 'sn2')).toEqual([]);
  });

  it('finds it as a variable’s starting value and as an input’s value too', () => {
    const local: Statement = {
      id: mint(),
      kind: 'local',
      name: 'tune',
      type: { kind: 'story', name: 'Audio' },
      value: { id: nodeId('tunesn'), kind: 'text', value: 'sn1' },
    };
    const withTune = applyEdits(withSound(), [
      { kind: 'insert', parent: ID.main, slot: 'body', index: 0, node: local, label: '' },
      {
        kind: 'declare',
        parent: ID.hop,
        index: 1,
        label: '',
        node: {
          id: nodeId('hopsnd'),
          kind: 'parameter',
          name: 'sound',
          type: { kind: 'story', name: 'Audio' },
          default: text('') as Expression,
        },
      },
    ]);
    const hopRex: Statement = {
      id: mint(),
      kind: 'call',
      target: field(ID.rex),
      callee: { kind: 'user', method: ID.hop },
      args: {
        [ID.height]: { id: mint(), kind: 'number', value: 1 },
        hopsnd: { id: nodeId('hopsn1'), kind: 'text', value: 'sn1' },
      },
      details: {},
    };
    const program = applyEdits(withTune, [
      { kind: 'insert', parent: ID.main, slot: 'body', index: 0, node: hopRex, label: '' },
    ]);
    expect([...soundUses(program, 'sn1')].sort()).toEqual(
      [nodeId('hopsn1'), nodeId('tunesn'), SPLASH].sort(),
    );
  });

  it('finds it in a list of sounds too (S4’s review)', () => {
    const list: Statement = {
      id: mint(),
      kind: 'local',
      name: 'tunes',
      type: { kind: 'array', of: { kind: 'story', name: 'Audio' } },
      value: {
        id: mint(),
        kind: 'arrayOf',
        of: { kind: 'story', name: 'Audio' },
        items: [
          { id: nodeId('listsn'), kind: 'text', value: 'sn1' },
          { id: mint(), kind: 'text', value: 'kenney-audio/Sound/door-creak' },
        ],
      },
    };
    const program = applyEdits(withSound(), [
      { kind: 'insert', parent: ID.main, slot: 'body', index: 0, node: list, label: '' },
    ]);
    expect([...soundUses(program, 'sn1')].sort()).toEqual([nodeId('listsn'), SPLASH].sort());
    expect(describer(program, words)(program.types[0]!.methods[0]!.body[0]!)).toContain('Door');
  });

  it('offers the studio’s sounds in the cascade, written as their ids', () => {
    const choices = cascadeFor(
      withSound(),
      { kind: 'value', node: PLAY, slot: 'args', param: 'audioSource' },
      mint,
      { references: (type) => (type === 'Audio' ? [{ value: 'sn1', words: 'Splash' }] : []) },
    );
    expect(choices.map((c) => c.words)).toContain('Splash');
    expect(choices.find((c) => c.words === 'Splash')!.value).toMatchObject({
      kind: 'text',
      value: 'sn1',
    });
  });
});
