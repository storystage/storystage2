import { describe, expect, it } from 'vitest';
import { deflateSync, zipSync, type ZipOptions } from 'fflate';
import {
  crc32,
  nameProblem,
  readArchive,
  readJson,
  writeArchive,
  type ArchiveEntry,
  type ArchiveLimits,
} from './archive.ts';

const text = (s: string) => new TextEncoder().encode(s);
const all = { wanted: () => true };

const entries: ArchiveEntry[] = [
  { name: 'manifest.json', bytes: text('{"title":"The ice"}') },
  { name: 'scenes/s1.json', bytes: text('{"id":"s1"}'.repeat(50)) },
  { name: 'script.fountain', bytes: text('.ON THE ICE [[scene:s1]]\n') },
];

/** Replaces every copy of `from` in a zip with `to`, the same length, as a hostile tool might. */
function patch(zip: Uint8Array, from: string, to: string): Uint8Array {
  const a = text(from);
  const b = text(to);
  expect(b.length).toBe(a.length);
  const out = zip.slice();
  for (let i = 0; i + a.length <= out.length; i++)
    if (a.every((x, k) => out[i + k] === x)) out.set(b, i);
  return out;
}

/** A zip from another tool (fflate's own writer), one file per entry, with options per file. */
const otherTool = (files: Record<string, [Uint8Array, ZipOptions?]>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([n, [b, o]]) => [n, [b, o ?? {}]])));

describe('writeArchive and readArchive', () => {
  it('read back exactly what was written', () => {
    const r = readArchive(writeArchive(entries), all);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.names).toEqual(entries.map((e) => e.name));
    for (const e of entries) expect(r.entries.get(e.name)).toEqual(e.bytes);
  });

  it('give the same bytes for the same entries, every time (spec 03, section 1)', () => {
    expect(writeArchive(entries)).toEqual(writeArchive(entries));
    expect(writeArchive(entries)).not.toEqual(writeArchive([...entries].reverse()));
  });

  it('write an empty archive, and empty entries', () => {
    expect(readArchive(writeArchive([]), all)).toMatchObject({ ok: true, names: [] });
    const r = readArchive(writeArchive([{ name: 'a', bytes: new Uint8Array(0) }]), all);
    expect(r.ok && r.entries.get('a')?.length).toBe(0);
  });

  it('refuse to write a name that is not safe or repeats', () => {
    expect(() => writeArchive([{ name: '../x', bytes: text('') }])).toThrow(/relative/);
    expect(() =>
      writeArchive([
        { name: 'A.json', bytes: text('') },
        { name: 'a.json', bytes: text('') },
      ]),
    ).toThrow(/Two entries/);
  });

  it('read zips from other tools, and their folders', () => {
    const zip = otherTool({ 'models/': [new Uint8Array(0)], 'models/cat.glb': [text('glTF')] });
    const r = readArchive(zip, all);
    expect(r).toMatchObject({ ok: true, names: ['models/cat.glb'] });
  });

  it('unpack only the entries asked for, but check them all', () => {
    const r = readArchive(writeArchive(entries), { wanted: (n) => n === 'manifest.json' });
    expect(r.ok && [...r.entries.keys()]).toEqual(['manifest.json']);
    const bad = patch(writeArchive(entries), 'scenes/s1.json', 'scenes/../1.js');
    expect(readArchive(bad, { wanted: (n) => n === 'manifest.json' })).toMatchObject({
      ok: false,
      problem: { code: 'badName' },
    });
  });
});

describe('readArchive refuses (spec 15, section 3)', () => {
  const refuses = (zip: Uint8Array, code: string, limits?: Partial<ArchiveLimits>) => {
    const r = readArchive(zip, { ...all, limits });
    expect(r).toMatchObject({ ok: false, problem: { code } });
    if (!r.ok) expect(r.problem.message).not.toMatch(/scenes|manifest|\.json/);
  };

  it('anything that is not a zip', () => {
    refuses(text('hello, this is not a zip at all, honestly'), 'notAnArchive');
    refuses(new Uint8Array(0), 'notAnArchive');
  });

  it('a file over the size limit, before reading it', () => {
    refuses(writeArchive(entries), 'tooBig', { fileBytes: 100 });
  });

  it('too many entries', () => {
    refuses(writeArchive(entries), 'tooManyEntries', { entries: 2 });
  });

  it.each([
    ['a part that is ..', 'scenes/s1.json', 'scenes/../1.js'],
    ['an absolute path', 'scenes/s1.json', '/scenes/s1.jso'],
    ['a drive letter', 'scenes/s1.json', 'C:scenes/s1.js'],
    ['a backslash', 'scenes/s1.json', 'scenes\\s1.json'],
    ['a control character', 'scenes/s1.json', 'scenes/s1\u0001json'],
    ['a name Windows reserves', 'scenes/s1.json', 'scenes/CON.jso'],
    ['a part ending in a dot', 'scenes/s1.json', 'scene./s1.json'],
    ['a part ending in a space', 'scenes/s1.json', 'scene /s1.json'],
    ['an empty part', 'scenes/s1.json', 'scenes//1.json'],
  ])('a name with %s', (_, from, to) => {
    refuses(patch(writeArchive(entries), from, to), 'badName');
  });

  it('a name over 255 characters', () => {
    refuses(writeArchive([{ name: 'a'.repeat(30), bytes: text('') }]), 'badName', {
      nameLength: 20,
    });
  });

  it('two names that are the same once normalised and case-folded', () => {
    const clash = otherTool({ 'Cat.glb': [text('a')], 'cAT.glb': [text('b')] });
    refuses(clash, 'sameName');
    // "é" as one character, and as "e" with a combining accent.
    const accents = otherTool({ 'café.json': [text('a')], 'café.json': [text('b')] });
    refuses(accents, 'sameName');
  });

  it('a symbolic link or a device', () => {
    const link = otherTool({
      'models/cat.glb': [text('/etc/passwd'), { os: 3, attrs: 0o120777 << 16 }],
    });
    refuses(link, 'notAFile');
    const device = otherTool({ 'dev.bin': [text(''), { os: 3, attrs: 0o020644 << 16 }] });
    refuses(device, 'notAFile');
    const plain = otherTool({ 'cat.glb': [text('glTF'), { os: 3, attrs: 0o100644 << 16 }] });
    expect(readArchive(plain, all).ok).toBe(true);
  });

  it('an encrypted entry', () => {
    const zip = writeArchive(entries);
    // Set the "encrypted" flag on the first central directory entry.
    const cd = zip.findIndex(
      (_, i) => zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 1 && zip[i + 3] === 2,
    );
    const out = zip.slice();
    out[cd + 8] = out[cd + 8]! | 1;
    refuses(out, 'encrypted');
  });

  it('an entry over its size, counting while unpacking, whatever it declares', () => {
    refuses(writeArchive(entries), 'entryTooBig', { entryBytes: 100 });
    // A JSON entry gets the smaller limit.
    refuses(writeArchive(entries), 'entryTooBig', { jsonBytes: 100 });
    // The declared size says 10 bytes; it unpacks to 2,000.
    const liar = writeArchive([{ name: 'big.bin', bytes: new Uint8Array(2000) }]);
    const cd = liar.findIndex(
      (_, i) => liar[i] === 0x50 && liar[i + 1] === 0x4b && liar[i + 2] === 1 && liar[i + 3] === 2,
    );
    const out = liar.slice();
    new DataView(out.buffer).setUint32(cd + 24, 10, true);
    refuses(out, 'entryTooBig', { entryBytes: 1000 });
  });

  it('more than the whole limit unpacked', () => {
    refuses(writeArchive(entries), 'tooMuchUnpacked', { unpackedBytes: 500 });
  });

  it('an entry that unpacks to far more than its size (a zip bomb)', () => {
    const bomb = writeArchive([{ name: 'zeros.bin', bytes: new Uint8Array(4 * 1024 * 1024) }]);
    refuses(bomb, 'suspicious');
  });

  it('a damaged entry', () => {
    const zip = writeArchive([{ name: 'a.txt', bytes: text('hello hello hello hello hello') }]);
    const out = zip.slice();
    out[40] = out[40]! ^ 0xff; // in the packed data, after the header and name (35 bytes)
    refuses(out, 'damaged');
  });

  it('a packing method it does not know, and ZIP64', () => {
    const zip = writeArchive(entries);
    const cd = zip.findIndex(
      (_, i) => zip[i] === 0x50 && zip[i + 1] === 0x4b && zip[i + 2] === 1 && zip[i + 3] === 2,
    );
    const odd = zip.slice();
    odd[cd + 10] = 12; // bzip2
    refuses(odd, 'unsupported');
    const z64 = zip.slice();
    new DataView(z64.buffer).setUint16(z64.length - 22 + 10, 0xffff, true);
    new DataView(z64.buffer).setUint16(z64.length - 22 + 8, 0xffff, true);
    refuses(z64, 'unsupported');
  });
});

describe('nameProblem', () => {
  it('passes the names a production uses', () => {
    for (const n of ['manifest.json', 'scenes/s1.json', 'models/class-1/cat.glb', 'audio/l1.webm'])
      expect(nameProblem(n)).toBeNull();
  });
});

describe('readJson', () => {
  it('parses UTF-8 JSON, with or without a byte-order mark', () => {
    expect(readJson(text('{"a":[1,2]}'))).toEqual({ ok: true, value: { a: [1, 2] } });
    expect(readJson(text('﻿{"a":1}'))).toEqual({ ok: true, value: { a: 1 } });
  });

  it('refuses nesting over the limit before parsing, but not brackets in strings', () => {
    expect(readJson(text('['.repeat(300) + ']'.repeat(300)))).toMatchObject({
      ok: false,
      problem: { code: 'tooDeep' },
    });
    expect(readJson(text(`{"a":"${'['.repeat(300)}"}`)).ok).toBe(true);
    expect(readJson(text('[[[1]]]'), 2)).toMatchObject({ ok: false });
  });

  it('refuses bytes that are not UTF-8, and text that is not JSON', () => {
    expect(readJson(new Uint8Array([0xff, 0xfe, 0x00]))).toMatchObject({
      ok: false,
      problem: { code: 'damaged' },
    });
    expect(readJson(text('{not json'))).toMatchObject({ ok: false, problem: { code: 'damaged' } });
  });
});

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
  });
});

// deflateSync is used by the writer; keep the import honest for readers of this test.
void deflateSync;
