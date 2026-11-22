import { describe, expect, it } from 'vitest';
import { rpDictionary, rpToKokoro, toBritish } from './british.ts';

describe('toBritish', () => {
  it.each([
    ['fox', 'fˈɑks', 'fˈɒks'],
    ['river', 'ɹˈɪvɜɹ', 'ɹˈɪvə'],
    ['here', 'hˈiɹ', 'hˈɪə'],
    ['car', 'kˈɑɹ', 'kˈɑː'],
    ['more', 'mˈɔɹ', 'mˈɔː'],
    ['nurse', 'nˈɜɹs', 'nˈɜːs'],
    ['there', 'ðˈɛɹ', 'ðˈɛː'],
    ['walk', 'wˈɔk', 'wˈɔːk'],
    ['dog', 'dˈɔɡ', 'dˈɒɡ'],
    ['long', 'lˈɔŋ', 'lˈɒŋ'],
    ['over', 'ˈOvɜɹ', 'ˈQvə'],
    ['cat', 'kˈæt', 'kˈat'],
    ['better', 'bˈɛɾɜɹ', 'bˈɛtə'],
    ['very', 'vˈɛɹi', 'vˈɛɹi'],
    ['easy', 'ˈizi', 'ˈiːzi'],
    ['food', 'fˈud', 'fˈuːd'],
    ['fire', 'fˈIɹ', 'fˈIə'],
  ])('%s: %s → %s', (_, us, gb) => expect(toBritish(us)).toBe(gb));

  it('uses only the British voices’ phonemes', () => {
    const out = toBritish('ðə kˈæt wˈɔk tˈu ðə tɹˈi, ənd ðˈɛn wˈAv həlˈO bˈɑksᵻz bˈʌɾɜɹ');
    expect(out).not.toMatch(/[æOɾᵻ]/);
  });

  it('leaves British input alone', () => {
    for (const gb of ['təmˈɑːtQ', 'ʃˈɛdjuːl', 'ɡˈaɹɑːʒ', 'kˈɑːsəl', 'ˌɑːftənˈuːn'])
      expect(toBritish(gb)).toBe(gb);
  });
});

describe('the RP list', () => {
  it('turns its phones into Kokoro’s British phonemes', () => {
    expect(rpToKokoro('D IH0 - P AA1 T')).toBe('dɪpˈɑːt');
    expect(rpToKokoro('D IH0 - L IA1 - R I0 - AX S')).toBe('dɪlˈɪəɹiəs');
    expect(rpToKokoro('R EH1 - V EL')).toBe('ɹˈɛvᵊl');
    expect(rpToKokoro('X Y1')).toBeNull();
  });

  it('reads the file: comments skipped, the first entry for each word, notes dropped', () => {
    const lines = rpDictionary(
      [
        ';;; Copyright',
        'DEMON  D IY1 - M AX N #@@{ "usage": "noun" }@@',
        'DEMON  D EH1 - M AX N',
        'DEPART  D IH0 - P AA1 T',
        'ODD  Q Q1',
      ].join('\n'),
    );
    expect(lines).toEqual(['DEMON\tdˈiːmən', 'DEPART\tdɪpˈɑːt']);
  });

  it('leaves out small words, whose weak forms the CMU dictionary already gives', () => {
    const lines = rpDictionary(
      ['THE(det)  DH IY1', 'OF  OH1 V', 'TO  T UW1', 'CASTLE  K AA1 - S EL'].join('\n'),
    );
    expect(lines).toEqual(['CASTLE\tkˈɑːsᵊl']);
  });
});
