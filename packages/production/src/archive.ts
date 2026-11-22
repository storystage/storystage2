/**
 * WP8.4: the one archive reader (and writer) for `.storystage` files, `.a3p` files and model
 * packs, so the rules in `docs/spec/15-security.md` section 3 live in one place and are tested
 * once.
 *
 * Reading parses the zip's structure itself, so it can refuse what a general zip library would
 * quietly accept: links and devices, encrypted or split archives, ZIP64, names that escape the
 * folder or clash on Windows or macOS. It inflates only the entries the caller asks for, counting
 * bytes as they come and stopping at the limits, never trusting the sizes the zip declares. It
 * runs anywhere: in the import worker, in Node, in the browser. `fflate` (MIT) inflates and
 * deflates.
 *
 * Writing gives the same bytes for the same entries (spec 03, section 1): the entries in the order
 * given, deflated the same way, each with the same fixed date.
 *
 * Refusals are in plain words and never quote the file (spec 15, section 3).
 */
import { Inflate, deflateSync } from 'fflate';

/** Spec 15, section 3.1. A test may pass smaller ones. */
export const ARCHIVE_LIMITS = {
  /** The file on disk. */
  fileBytes: 512 * 1024 * 1024,
  /** Everything read, once unpacked. */
  unpackedBytes: 1024 * 1024 * 1024,
  /** One entry, once unpacked. */
  entryBytes: 256 * 1024 * 1024,
  /** One JSON or XML entry, once unpacked. */
  jsonBytes: 64 * 1024 * 1024,
  entries: 20_000,
  /** Unpacked size against packed size, checked once an entry passes `ratioFromBytes`. */
  ratio: 200,
  ratioFromBytes: 1024 * 1024,
  nameLength: 255,
  /** Nesting in JSON. */
  jsonDepth: 256,
} as const;

export type ArchiveLimits = { readonly [K in keyof typeof ARCHIVE_LIMITS]: number };

export type ArchiveProblemCode =
  | 'tooBig'
  | 'notAnArchive'
  | 'unsupported'
  | 'encrypted'
  | 'tooManyEntries'
  | 'badName'
  | 'sameName'
  | 'notAFile'
  | 'entryTooBig'
  | 'tooMuchUnpacked'
  | 'suspicious'
  | 'damaged'
  | 'tooDeep';

export interface ArchiveProblem {
  readonly code: ArchiveProblemCode;
  /** In plain words, for the learner. Never quotes the file. */
  readonly message: string;
}

const MESSAGES: Readonly<Record<ArchiveProblemCode, string>> = {
  tooBig: 'This file is too big to open.',
  notAnArchive: "This isn't a file StoryStage can open.",
  unsupported: 'This file was packed in a way StoryStage can’t open.',
  encrypted: 'This file is locked with a password, so StoryStage can’t open it.',
  tooManyEntries: 'This file has too many parts to open.',
  badName: 'Something inside this file has a name that isn’t safe, so it wasn’t opened.',
  sameName: 'Two things inside this file have the same name, so it wasn’t opened.',
  notAFile: 'Something inside this file isn’t an ordinary file, so it wasn’t opened.',
  entryTooBig: 'Something inside this file is too big to open.',
  tooMuchUnpacked: 'This file holds too much to open.',
  suspicious: 'This file unpacks to far more than its size, so it wasn’t opened.',
  damaged: 'This file is damaged, so it wasn’t opened.',
  tooDeep: 'Something inside this file is nested too deeply to open.',
};

const problem = (code: ArchiveProblemCode): ArchiveProblem => ({ code, message: MESSAGES[code] });

export type ReadArchiveResult =
  | {
      readonly ok: true;
      /** Every file entry's name, in the archive's order (folders left out). */
      readonly names: readonly string[];
      /** The wanted entries, unpacked. */
      readonly entries: ReadonlyMap<string, Uint8Array>;
    }
  | { readonly ok: false; readonly problem: ArchiveProblem };

export interface ReadArchiveOptions {
  /** Which entries to unpack: the ones the format names. Others are checked, never unpacked. */
  readonly wanted: (name: string) => boolean;
  /** Which entries are JSON or XML, so get the smaller limit. Default: names ending .json or .xml. */
  readonly isText?: (name: string) => boolean;
  readonly limits?: Partial<ArchiveLimits>;
}

// ---- Names -----------------------------------------------------------------------------------

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Why an entry name is refused (spec 15, section 3.2), or null if it's safe. */
export function nameProblem(
  name: string,
  maxLength: number = ARCHIVE_LIMITS.nameLength,
): string | null {
  if (name.length === 0) return 'empty';
  if (name.length > maxLength) return 'too long';
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(name)) return 'a control character or backslash';
  if (name.startsWith('/') || /^[A-Za-z]:/.test(name)) return 'absolute';
  const parts = name.replace(/\/$/, '').split('/');
  for (const part of parts) {
    if (part === '') return 'an empty part';
    if (part === '..' || part === '.') return 'a relative part';
    if (RESERVED.test(part.split('.')[0]!)) return 'a name Windows reserves';
    if (/[. ]$/.test(part)) return 'a part ending in a dot or a space';
  }
  return null;
}

/** Names that are the same once normalised and case-folded clash on Windows and macOS. */
const folded = (name: string) => name.normalize('NFC').toLowerCase();

// ---- Reading ---------------------------------------------------------------------------------

const u16 = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u32 = (b: Uint8Array, at: number) =>
  (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0;

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const S_IFMT = 0o170000;
const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;

interface Entry {
  readonly name: string;
  readonly method: number;
  readonly crc: number;
  readonly packed: number;
  readonly unpacked: number;
  readonly local: number;
  readonly folder: boolean;
}

class Refused extends Error {
  readonly code: ArchiveProblemCode;
  constructor(code: ArchiveProblemCode) {
    super(code);
    this.code = code;
  }
}

/** Finds the end-of-central-directory record, which may be followed by a comment. */
function findEnd(b: Uint8Array): number {
  const earliest = Math.max(0, b.length - 22 - 0xffff);
  for (let at = b.length - 22; at >= earliest; at--) if (u32(b, at) === EOCD) return at;
  throw new Refused('notAnArchive');
}

function readDirectory(b: Uint8Array, limits: ArchiveLimits): Entry[] {
  const end = findEnd(b);
  const disk = u16(b, end + 4);
  const cdDisk = u16(b, end + 6);
  const onDisk = u16(b, end + 8);
  const count = u16(b, end + 10);
  const cdSize = u32(b, end + 12);
  const cdOffset = u32(b, end + 16);
  if (disk !== 0 || cdDisk !== 0 || onDisk !== count) throw new Refused('unsupported');
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff)
    throw new Refused('unsupported'); // ZIP64
  if (count > limits.entries) throw new Refused('tooManyEntries');
  if (cdOffset + cdSize > end) throw new Refused('damaged');

  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: Entry[] = [];
  const seen = new Set<string>();
  let at = cdOffset;
  for (let i = 0; i < count; i++) {
    if (at + 46 > end || u32(b, at) !== CENTRAL) throw new Refused('damaged');
    const madeBy = u16(b, at + 4) >> 8;
    const flags = u16(b, at + 8);
    const method = u16(b, at + 10);
    const nameLength = u16(b, at + 28);
    const extraLength = u16(b, at + 30);
    const commentLength = u16(b, at + 32);
    const external = u32(b, at + 38);
    const nameBytes = b.subarray(at + 46, at + 46 + nameLength);
    if (at + 46 + nameLength > end) throw new Refused('damaged');
    if (flags & 0x1 || flags & 0x40) throw new Refused('encrypted');
    if (method !== 0 && method !== 8) throw new Refused('unsupported');

    let name: string;
    try {
      name = decoder.decode(nameBytes);
    } catch {
      throw new Refused('badName');
    }
    // Names that aren't marked UTF-8 must be plain ASCII, so they can't be read two ways.
    if (!(flags & 0x800) && /[^\x20-\x7e]/.test(name)) throw new Refused('badName');
    if (nameProblem(name, limits.nameLength)) throw new Refused('badName');
    const key = folded(name.replace(/\/$/, ''));
    if (seen.has(key)) throw new Refused('sameName');
    seen.add(key);

    // On Unix the high half of the external attributes is the file's mode.
    const mode = madeBy === 3 ? external >>> 16 : 0;
    const type = mode & S_IFMT;
    const folder =
      name.endsWith('/') || type === S_IFDIR || (madeBy === 0 && (external & 0x10) !== 0);
    if (type !== 0 && type !== S_IFREG && type !== S_IFDIR) throw new Refused('notAFile');

    entries.push({
      name,
      method,
      crc: u32(b, at + 16),
      packed: u32(b, at + 20),
      unpacked: u32(b, at + 24),
      local: u32(b, at + 42),
      folder,
    });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** An entry's packed bytes, found through its local header. */
function packedBytes(b: Uint8Array, e: Entry, end: number): Uint8Array {
  if (e.local + 30 > end || u32(b, e.local) !== LOCAL) throw new Refused('damaged');
  const start = e.local + 30 + u16(b, e.local + 26) + u16(b, e.local + 28);
  if (start + e.packed > end) throw new Refused('damaged');
  return b.subarray(start, start + e.packed);
}

/** Unpacks one entry, counting as it goes; never trusts the declared size. */
function unpack(
  packed: Uint8Array,
  e: Entry,
  max: number,
  budget: { left: number },
  limits: ArchiveLimits,
): Uint8Array {
  const chunks: Uint8Array[] = [];
  let size = 0;
  const take = (chunk: Uint8Array) => {
    size += chunk.length;
    if (size > budget.left) throw new Refused('tooMuchUnpacked');
    if (size > max) throw new Refused('entryTooBig');
    if (size > limits.ratioFromBytes && size > limits.ratio * Math.max(packed.length, 1))
      throw new Refused('suspicious');
    chunks.push(chunk);
  };
  if (e.method === 0) take(packed);
  else {
    let done = false;
    const inflate = new Inflate((chunk, final) => {
      take(chunk);
      if (final) done = true;
    });
    const STEP = 16 * 1024;
    try {
      for (let at = 0; at < packed.length; at += STEP)
        inflate.push(packed.subarray(at, at + STEP), at + STEP >= packed.length);
      if (packed.length === 0) inflate.push(new Uint8Array(0), true);
    } catch (err) {
      if (err instanceof Refused) throw err;
      throw new Refused('damaged');
    }
    if (!done) throw new Refused('damaged');
  }
  budget.left -= size;
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  if (size !== e.unpacked || crc32(out) !== e.crc) throw new Refused('damaged');
  return out;
}

const textName = (name: string) => /\.(json|xml)$/i.test(name);

/**
 * Reads an archive: checks every entry's name and kind, then unpacks the wanted ones within the
 * limits. Any problem refuses the whole file; nothing is half-read.
 */
export function readArchive(bytes: Uint8Array, options: ReadArchiveOptions): ReadArchiveResult {
  const limits: ArchiveLimits = { ...ARCHIVE_LIMITS, ...options.limits };
  const isText = options.isText ?? textName;
  try {
    if (bytes.length > limits.fileBytes) throw new Refused('tooBig');
    const all = readDirectory(bytes, limits);
    const end = findEnd(bytes);
    const budget = { left: limits.unpackedBytes };
    const entries = new Map<string, Uint8Array>();
    const files = all.filter((e) => !e.folder);
    for (const e of files) {
      if (!options.wanted(e.name)) continue;
      const max = isText(e.name)
        ? Math.min(limits.jsonBytes, limits.entryBytes)
        : limits.entryBytes;
      entries.set(e.name, unpack(packedBytes(bytes, e, end), e, max, budget, limits));
    }
    return { ok: true, names: files.map((e) => e.name), entries };
  } catch (err) {
    if (err instanceof Refused) return { ok: false, problem: problem(err.code) };
    throw err;
  }
}

// ---- JSON ------------------------------------------------------------------------------------

/**
 * Parses a JSON entry: UTF-8 only, nesting checked before parsing (spec 15, section 3.1), so a
 * deep file can't exhaust the parser.
 */
export function readJson(
  bytes: Uint8Array,
  maxDepth: number = ARCHIVE_LIMITS.jsonDepth,
): { ok: true; value: unknown } | { ok: false; problem: ArchiveProblem } {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // a byte-order mark
  } catch {
    return { ok: false, problem: problem('damaged') };
  }
  let depth = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{' || c === '[') {
      if (++depth > maxDepth) return { ok: false, problem: problem('tooDeep') };
    } else if (c === '}' || c === ']') depth--;
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, problem: problem('damaged') };
  }
}

// ---- Writing ---------------------------------------------------------------------------------

/** 1 January 1980, midnight: the earliest date a zip can hold, the same in every entry. */
const DOS_DATE = (0 << 9) | (1 << 5) | 1;
const DOS_TIME = 0;

export interface ArchiveEntry {
  readonly name: string;
  readonly bytes: Uint8Array;
}

/**
 * Writes an archive: the same entries always give the same bytes. Throws if a name isn't safe or
 * repeats, so a file StoryStage writes is always one it can read.
 */
export function writeArchive(entries: readonly ArchiveEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const { name, bytes } of entries) {
    const why = nameProblem(name);
    if (why) throw new Error(`Can't write an entry named ${JSON.stringify(name)}: ${why}.`);
    if (seen.has(folded(name))) throw new Error(`Two entries are named ${JSON.stringify(name)}.`);
    seen.add(folded(name));
    const nameBytes = encoder.encode(name);
    const deflated = deflateSync(bytes, { level: 6 });
    const stored = deflated.length >= bytes.length;
    const data = stored ? bytes : deflated;
    const crc = crc32(bytes);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL, true);
    lv.setUint16(4, 20, true); // version needed: 2.0
    lv.setUint16(6, 0x800, true); // names in UTF-8
    lv.setUint16(8, stored ? 0 : 8, true);
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, bytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);

    const dir = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, CENTRAL, true);
    dv.setUint16(4, 20, true); // made by: MS-DOS host, 2.0, so no Unix modes
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x800, true);
    dv.setUint16(10, stored ? 0 : 8, true);
    dv.setUint16(12, DOS_TIME, true);
    dv.setUint16(14, DOS_DATE, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, data.length, true);
    dv.setUint32(24, bytes.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint32(42, offset, true);
    dir.set(nameBytes, 46);

    parts.push(local, data);
    central.push(dir);
    offset += local.length + data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, EOCD, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);

  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

// ---- CRC-32 ----------------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
