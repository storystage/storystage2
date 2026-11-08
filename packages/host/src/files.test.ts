import { describe, expect, it } from 'vitest';
import { FILE_ERROR_CODES, FILE_LIMIT, safeFileName } from './files.ts';

describe('safeFileName', () => {
  it.each([
    ['Ava', 'Ava'],
    ['  The   Owl  ', 'The Owl'],
    ['../../secret', 'secret'],
    ['C:\\Users\\x', 'C Users x'],
    ['a/b:c*d?e"f<g>h|i', 'a b c d e f g h i'],
    ['tab\there\nnew', 'tab here new'],
    ['ends with dots...', 'ends with dots'],
    ['...hidden', 'hidden'],
    ['CON', 'CON_'],
    ['nul.storystage', 'nul.storystage_'],
    ['com1', 'com1_'],
    ['', 'file'],
    ['   ', 'file'],
    ['////', 'file'],
    ['Zoë and Siân', 'Zoë and Siân'],
  ])('%j becomes %j', (input, output) => {
    expect(safeFileName(input)).toBe(output);
  });

  it('keeps names short enough for every system', () => {
    expect(safeFileName('x'.repeat(300))).toHaveLength(80);
  });

  it('never leaves a path part', () => {
    for (const input of ['a/../b', '..', '.', '\\\\server\\share']) {
      const name = safeFileName(input);
      expect(name).not.toMatch(/[/\\]/);
      expect(name).not.toBe('..');
      expect(name).not.toBe('.');
    }
  });
});

it('has one code per cause, including the two S4 shows', () => {
  expect(FILE_ERROR_CODES).toEqual([
    'full',
    'unreadable',
    'locked',
    'not_found',
    'invalid',
    'too_big',
    'cancelled',
    'internal',
  ]);
});

it('limits files to 512 MiB, as spec 15 section 3.1 does', () => {
  expect(FILE_LIMIT).toBe(512 * 1024 * 1024);
});
