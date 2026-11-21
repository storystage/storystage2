import { describe, expect, it } from 'vitest';
import { acceptFor, onAndroid } from './fileInputs.ts';

// The file inputs' `accept` on Android's webview (wry 0.57), where an extension Android doesn't
// know leaves nothing to filter by (S8, 21 Nov).
const ANDROID_APP =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/131.0.0.0 Mobile Safari/537.36';
const WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';

describe('the file inputs’ accept', () => {
  it('offers every file on Android, where the reader checks what it is given', () => {
    expect(onAndroid(ANDROID_APP)).toBe(true);
    expect(acceptFor('.a3p', ANDROID_APP)).toBe('*/*');
    expect(acceptFor('.storystage-models', ANDROID_APP)).toBe('*/*');
    expect(acceptFor('.fountain,.txt', ANDROID_APP)).toBe('*/*');
  });

  it('keeps the types as they are everywhere else', () => {
    for (const agent of [WINDOWS, IPAD]) {
      expect(onAndroid(agent)).toBe(false);
      expect(acceptFor('.a3p', agent)).toBe('.a3p');
      expect(acceptFor('.fountain,.txt', agent)).toBe('.fountain,.txt');
    }
  });
});
