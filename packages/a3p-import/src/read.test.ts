import { writeArchive, type ArchiveEntry } from '@storystage/production';
import { describe, expect, it } from 'vitest';
import { readA3p } from './read.ts';
import { decodeText, encodingOf } from './text.ts';

// WP9.1 on files the tests make: Alice's real starter worlds are in `starters.test.ts`.

const PROGRAM =
  '<?xml version="1.0" encoding="UTF-8" standalone="no"?><node key="1" type="org.lgna.project.ast.NamedUserType" uuid="u1" version="3.10062"><property name="name"><value type="java.lang.String">Program</value></property></node>';

const utf8 = (s: string) => new TextEncoder().encode(s);
/** UTF-16 as Alice 3.7 and later write it, little-endian with a byte-order mark. */
function utf16le(s: string, mark = true): Uint8Array {
  const out = new Uint8Array((mark ? 2 : 0) + s.length * 2);
  if (mark) out.set([0xff, 0xfe]);
  for (let i = 0; i < s.length; i++) {
    out[(mark ? 2 : 0) + i * 2] = s.charCodeAt(i) & 0xff;
    out[(mark ? 2 : 0) + i * 2 + 1] = s.charCodeAt(i) >> 8;
  }
  return out;
}
const utf16be = (s: string) => {
  const le = utf16le(s, false);
  const be = new Uint8Array(le.length);
  for (let i = 0; i < le.length; i += 2) [be[i], be[i + 1]] = [le[i + 1]!, le[i]!];
  return be;
};

const world = (parts: Record<string, Uint8Array | string>) =>
  writeArchive(
    Object.entries(parts).map(([name, bytes]): ArchiveEntry => ({
      name,
      bytes: typeof bytes === 'string' ? utf8(bytes) : bytes,
    })),
  );

const problem = (bytes: Uint8Array) => {
  const result = readA3p(bytes);
  return result.ok ? null : result.problem;
};

describe('readA3p', () => {
  it('reads a world: its version, program, pictures and thumbnail', () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const result = readA3p(
      world({
        'version.txt': '3.3.0.0.0',
        'programType.xml': PROGRAM,
        'thumbnail.png': png,
        'resources.xml':
          '<?xml version="1.0" encoding="UTF-8"?><root><resource className="org.lgna.common.resources.ImageResource" contentType="image/png" entryName="resources/ice.png" height="256" name="ice.png" uuid="r1" width="256"/><resource className="org.lgna.common.resources.AudioResource" contentType="audio/mpeg" entryName="resources/gone.mp3" name="gone.mp3" uuid="r2"/></root>',
        'resources/ice.png': png,
        'something/else.txt': 'ignored',
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const { file } = result;
    expect(file.kind).toBe('world');
    expect(file.version).toEqual({ text: '3.3.0.0.0', major: 3, minor: 3 });
    expect(file.program.attributes['type']).toBe('org.lgna.project.ast.NamedUserType');
    expect(file.thumbnail).toEqual(png);
    expect(file.resources.map((r) => [r.entryName, r.bytes !== null])).toEqual([
      ['resources/ice.png', true],
      ['resources/gone.mp3', false],
    ]);
    expect(file.resources[0]!.attributes['width']).toBe('256');
  });

  it('reads Alice 3.7’s UTF-16, in either byte order, as well as UTF-8', () => {
    for (const bytes of [utf16le(PROGRAM), utf16le(PROGRAM, false), utf16be(PROGRAM)]) {
      const result = readA3p(world({ 'version.txt': '3.7.0.0.0', 'programType.xml': bytes }));
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.file.program.name).toBe('node');
    }
  });

  it('reads a class saved on its own, from type.xml', () => {
    const result = readA3p(world({ 'version.txt': '3.5.0.0.0', 'type.xml': PROGRAM }));
    expect(result.ok && result.file.kind).toBe('class');
  });

  it('refuses a file that isn’t an Alice 3 world', () => {
    expect(problem(world({ 'programType.xml': PROGRAM }))?.code).toBe('notAlice');
    expect(problem(world({ 'version.txt': '3.3' }))?.code).toBe('notAlice');
    expect(problem(world({ 'version.txt': '2.4', 'programType.xml': PROGRAM }))?.code).toBe(
      'unknownVersion',
    );
    expect(problem(world({ 'version.txt': 'soon', 'programType.xml': PROGRAM }))?.code).toBe(
      'unknownVersion',
    );
    expect(problem(world({ 'version.txt': '3.3', 'programType.xml': '<root/>' }))?.code).toBe(
      'notAlice',
    );
    expect(problem(utf8('not a zip'))?.code).toBe('notAnArchive');
  });

  it('refuses a billion laughs in any of its XML, before parsing it', () => {
    const laughs =
      '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">]><node>&b;</node>';
    const fromProgram = problem(world({ 'version.txt': '3.3', 'programType.xml': laughs }));
    expect(fromProgram?.code).toBe('declaration');
    const fromResources = problem(
      world({ 'version.txt': '3.3', 'programType.xml': PROGRAM, 'resources.xml': laughs }),
    );
    expect(fromResources?.code).toBe('declaration');
  });

  it('refuses XML nested past spec 15’s limit, and damaged XML or text', () => {
    const deep = '<node>' + '<a>'.repeat(300) + '</a>'.repeat(300) + '</node>';
    expect(problem(world({ 'version.txt': '3.3', 'programType.xml': deep }))?.code).toBe('tooDeep');
    expect(problem(world({ 'version.txt': '3.3', 'programType.xml': '<node>' }))?.code).toBe(
      'badXml',
    );
    const notUtf8 = new Uint8Array([0x3c, 0x6e, 0xff, 0xfe, 0xfd]);
    expect(problem(world({ 'version.txt': '3.3', 'programType.xml': notUtf8 }))?.code).toBe(
      'notText',
    );
  });

  it('uses the one archive reader’s hardening: a crafted name refuses the whole file', () => {
    const bytes = world({ 'version.txt': '3.3', 'programType.xml': PROGRAM });
    // Rename programType.xml to ../gramType.xml, the same length, in both of its headers.
    const text = new TextDecoder('latin1')
      .decode(bytes)
      .replaceAll('programType.xml', '../gramType.xml');
    const crafted = Uint8Array.from(text, (c) => c.charCodeAt(0));
    expect(problem(crafted)?.code).toBe('badName');
  });

  it('never quotes the file in what it says', () => {
    const p = problem(world({ 'version.txt': '9.9 secret', 'programType.xml': PROGRAM }));
    expect(p?.message).not.toContain('secret');
    expect(p?.message).toMatch(/^This Alice world/);
  });
});

describe('Alice’s text encodings', () => {
  it('are read from the bytes, not the version or the XML line', () => {
    expect(encodingOf(utf8('<a/>')).encoding).toBe('utf-8');
    expect(encodingOf(new Uint8Array([0xef, 0xbb, 0xbf, 0x3c]))).toEqual({
      encoding: 'utf-8',
      skip: 3,
    });
    expect(encodingOf(utf16le('<a/>')).encoding).toBe('utf-16le');
    expect(encodingOf(utf16be('<a/>')).encoding).toBe('utf-16be');
    expect(decodeText(utf16be('<a/>'))).toBe('<a/>');
    expect(decodeText(new Uint8Array([0xc3]))).toBeNull();
  });
});
