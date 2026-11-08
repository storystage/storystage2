/** The Story API's name for a key, from the browser's `KeyboardEvent.key`. Null if it has none. */
const NAMED: Readonly<Record<string, string>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ' ': 'space',
  Enter: 'enter',
  Tab: 'tab',
  Backspace: 'backSpace',
  Escape: 'escape',
  Shift: 'shift',
  Control: 'control',
  Alt: 'alt',
  ',': 'comma',
  '.': 'period',
  '-': 'minus',
  '=': 'equals',
  '/': 'slash',
  ';': 'semicolon',
  "'": 'quote',
};

export function keyName(key: string): string | null {
  if (/^[a-z]$/i.test(key)) return key.toLowerCase();
  if (/^[0-9]$/.test(key)) return `digit${key}`;
  return Object.hasOwn(NAMED, key) ? NAMED[key]! : null;
}
