/**
 * Alice's XML as text (WP9.1): UTF-8 before Alice 3.7, UTF-16 from 3.7. The encoding is read
 * from the bytes themselves, a byte-order mark or the first character `<`, not from the version
 * or the `<?xml encoding?>` line, so a file can't name one encoding and use another.
 */

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';

/** The encoding the bytes are in, and how many bytes of byte-order mark to skip. */
export function encodingOf(bytes: Uint8Array): { encoding: TextEncoding; skip: number } {
  const [a, b, c] = bytes;
  if (a === 0xef && b === 0xbb && c === 0xbf) return { encoding: 'utf-8', skip: 3 };
  if (a === 0xff && b === 0xfe) return { encoding: 'utf-16le', skip: 2 };
  if (a === 0xfe && b === 0xff) return { encoding: 'utf-16be', skip: 2 };
  // No mark: an XML document starts with `<`, which shows UTF-16's byte order.
  if (a === 0x3c && b === 0x00) return { encoding: 'utf-16le', skip: 0 };
  if (a === 0x00 && b === 0x3c) return { encoding: 'utf-16be', skip: 0 };
  return { encoding: 'utf-8', skip: 0 };
}

/** The bytes as text, or null if they aren't valid in their encoding. */
export function decodeText(bytes: Uint8Array): string | null {
  const { encoding, skip } = encodingOf(bytes);
  try {
    return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(bytes.subarray(skip));
  } catch {
    return null;
  }
}
