import { ENUMS } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import { keyName } from './keys.ts';

describe('keys', () => {
  it('names letters in lower case, whatever Shift or Caps Lock is doing', () => {
    expect(keyName('a')).toBe('a');
    expect(keyName('A')).toBe('a');
  });

  it('names digits and arrows as the Story API does', () => {
    expect(keyName('7')).toBe('digit7');
    expect(keyName('ArrowLeft')).toBe('left');
    expect(keyName(' ')).toBe('space');
  });

  it('only ever gives a name the Story API has', () => {
    const keys: readonly string[] = ENUMS.Key;
    const browser = [...'aZ09', 'ArrowUp', 'Enter', 'Tab', 'Backspace', 'Escape', 'Shift'];
    for (const key of [...browser, 'Control', 'Alt', ',', '.', '-', '=', '/', ';', "'"])
      expect(keys, key).toContain(keyName(key));
  });

  it('has no name for keys the Story API leaves out', () => {
    for (const key of ['F1', 'Home', 'é', '[', 'constructor']) expect(keyName(key)).toBeNull();
  });
});
