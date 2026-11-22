import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Spec 14, 6.7: nothing in this package sends anything anywhere, and it never reads who the
// pupil is. A test, so a change that would add either has to say why here first.
const dir = new URL('.', import.meta.url);
const sources = readdirSync(dir)
  .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
  .map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));

describe('the study package keeps everything on the device (spec 14, 6.7)', () => {
  it('has no network code', () => {
    expect(sources.length).toBeGreaterThan(4);
    for (const { name, text } of sources)
      expect(text, name).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource)\b/);
  });

  it('never reads a pupil’s name or the device', () => {
    for (const { name, text } of sources)
      expect(text, name).not.toMatch(/\.name\b|navigator\.|userAgent|hostname/);
  });
});
