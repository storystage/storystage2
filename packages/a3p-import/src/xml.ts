/**
 * A small, strict XML reader for Alice's files (WP9.1; spec 15, section 3.3; threat model F3).
 *
 * - **No declarations.** A `<!DOCTYPE` anywhere refuses the document before parsing, and so does
 *   any other `<!` declaration, so no entity can be declared. Only XML's five named entities and
 *   numeric character references are read, so nothing expands: no billion laughs.
 * - **Nothing is fetched.** There's nothing here that could.
 * - **Limits.** Nesting stops at `maxDepth` (256, spec 15's limit), and the time is linear in the
 *   length of the text: each character is looked at a fixed number of times.
 *
 * It reads elements, attributes, text and CDATA. Comments and processing instructions (the
 * `<?xml …?>` line) are skipped. It runs anywhere, in the import worker too, where there's no
 * `DOMParser`.
 */

export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  /** Elements and text, in order. Adjacent text is joined; text is kept exactly, spaces too. */
  readonly children: readonly XmlNode[];
}

export type XmlNode = XmlElement | string;

export type XmlProblemCode = 'declaration' | 'tooDeep' | 'malformed';

/** Why a document was refused. `detail` is for logs and tests, never shown to a learner. */
export class XmlRefused extends Error {
  readonly code: XmlProblemCode;
  readonly detail: string;
  constructor(code: XmlProblemCode, detail: string) {
    super(detail);
    this.name = 'XmlRefused';
    this.code = code;
    this.detail = detail;
  }
}

/** Spec 15, section 3.1: nesting in JSON or XML. */
export const XML_MAX_DEPTH = 256;

const NAMED: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

/** Text with its entity and character references read. Anything else after `&` is refused. */
function unescape(raw: string, at: number): string {
  if (!raw.includes('&')) return raw;
  let out = '';
  let from = 0;
  for (let amp = raw.indexOf('&'); amp >= 0; amp = raw.indexOf('&', from)) {
    out += raw.slice(from, amp);
    const semi = raw.indexOf(';', amp + 1);
    // The longest reference is a hex code point: `&#x10FFFF;`.
    if (semi < 0 || semi - amp > 10) throw malformed('an & that starts no reference', at + amp);
    const ref = raw.slice(amp + 1, semi);
    if (ref.startsWith('#')) {
      const code = /^#x[0-9a-fA-F]+$/.test(ref)
        ? parseInt(ref.slice(2), 16)
        : /^#[0-9]+$/.test(ref)
          ? parseInt(ref.slice(1), 10)
          : NaN;
      if (!isCharacter(code)) throw malformed('a character reference to no character', at + amp);
      out += String.fromCodePoint(code);
    } else {
      const named = NAMED[ref];
      if (named === undefined) throw malformed('an entity XML doesn’t define', at + amp);
      out += named;
    }
    from = semi + 1;
  }
  return out + raw.slice(from);
}

/** A code point XML allows in a document. */
const isCharacter = (c: number) =>
  Number.isInteger(c) &&
  (c === 0x9 ||
    c === 0xa ||
    c === 0xd ||
    (c >= 0x20 && c <= 0xd7ff) ||
    (c >= 0xe000 && c <= 0xfffd) ||
    (c >= 0x10000 && c <= 0x10ffff));

const malformed = (what: string, at: number) => new XmlRefused('malformed', `${what}, at ${at}`);

const SPACE = /\s/;
/** Characters that end a name: space, `/`, `>`, `=`, quotes and `<`. */
const NAME_END = /[\s/>="'<]/;

interface Open {
  readonly name: string;
  readonly attributes: Record<string, string>;
  readonly children: XmlNode[];
}

/** Reads `text` as one XML document, or throws `XmlRefused`. */
export function parseXml(text: string, maxDepth: number = XML_MAX_DEPTH): XmlElement {
  if (/<!DOCTYPE/i.test(text)) throw new XmlRefused('declaration', 'a document type declaration');
  const n = text.length;
  const stack: Open[] = [];
  let root: XmlElement | null = null;
  let i = 0;

  const addText = (value: string, at: number) => {
    const open = stack.at(-1);
    if (!open) {
      if (value.trim() !== '') throw malformed('text outside the root element', at);
      return;
    }
    if (value === '') return;
    const last = open.children.length - 1;
    if (typeof open.children[last] === 'string') open.children[last] += value;
    else open.children.push(value);
  };

  const close = (element: XmlElement, at: number) => {
    const parent = stack.at(-1);
    if (parent) parent.children.push(element);
    else if (root) throw malformed('a second root element', at);
    else root = element;
  };

  const skipSpace = () => {
    while (i < n && SPACE.test(text[i]!)) i++;
  };

  const readName = () => {
    const start = i;
    while (i < n && !NAME_END.test(text[i]!)) i++;
    if (i === start) throw malformed('a missing name', start);
    return text.slice(start, i);
  };

  while (i < n) {
    const lt = text.indexOf('<', i);
    const end = lt < 0 ? n : lt;
    if (end > i) addText(unescape(text.slice(i, end), i), i);
    if (lt < 0) break;
    i = lt;

    if (text.startsWith('<!--', i)) {
      const c = text.indexOf('-->', i + 4);
      if (c < 0) throw malformed('an unclosed comment', i);
      i = c + 3;
      continue;
    }
    if (text.startsWith('<![CDATA[', i)) {
      if (stack.length === 0) throw malformed('CDATA outside the root element', i);
      const c = text.indexOf(']]>', i + 9);
      if (c < 0) throw malformed('unclosed CDATA', i);
      addText(text.slice(i + 9, c), i);
      i = c + 3;
      continue;
    }
    if (text.startsWith('<?', i)) {
      const c = text.indexOf('?>', i + 2);
      if (c < 0) throw malformed('an unclosed processing instruction', i);
      i = c + 2;
      continue;
    }
    // `<!ENTITY`, `<!ELEMENT` and the like: declarations, refused like `<!DOCTYPE`.
    if (text.startsWith('<!', i)) throw new XmlRefused('declaration', `a declaration, at ${i}`);

    if (text.startsWith('</', i)) {
      const at = i;
      i += 2;
      const name = readName();
      skipSpace();
      if (text[i] !== '>') throw malformed('a closing tag that doesn’t end', at);
      i++;
      const open = stack.pop();
      if (!open || open.name !== name) throw malformed('a closing tag that matches nothing', at);
      close(open, at);
      continue;
    }

    // A start tag.
    const at = i;
    i++;
    const name = readName();
    const seen = new Set<string>();
    const pairs: [string, string][] = [];
    let selfClosing = false;
    for (;;) {
      skipSpace();
      if (i >= n) throw malformed('a tag that doesn’t end', at);
      if (text[i] === '>') {
        i++;
        break;
      }
      if (text[i] === '/' && text[i + 1] === '>') {
        i += 2;
        selfClosing = true;
        break;
      }
      const attribute = readName();
      if (seen.has(attribute)) throw malformed('the same attribute twice', i);
      seen.add(attribute);
      skipSpace();
      if (text[i] !== '=') throw malformed('an attribute with no value', i);
      i++;
      skipSpace();
      const quote = text[i];
      if (quote !== '"' && quote !== "'") throw malformed('an attribute value without quotes', i);
      const valueEnd = text.indexOf(quote, i + 1);
      if (valueEnd < 0) throw malformed('an attribute value that doesn’t end', i);
      const raw = text.slice(i + 1, valueEnd);
      if (raw.includes('<')) throw malformed('a < in an attribute value', i);
      pairs.push([attribute, unescape(raw, i + 1)]);
      i = valueEnd + 1;
    }
    if (stack.length + 1 > maxDepth)
      throw new XmlRefused('tooDeep', `nesting deeper than ${maxDepth}`);
    // Own properties only, so an attribute called `__proto__` is just a name.
    const attributes = Object.fromEntries(pairs);
    if (selfClosing) close({ name, attributes, children: [] }, at);
    else stack.push({ name, attributes, children: [] });
  }

  if (stack.length > 0) throw malformed('an element that isn’t closed', n);
  if (!root) throw malformed('no root element', 0);
  return root;
}

/** The element's first child element called `name`, if any. */
export const childNamed = (element: XmlElement, name: string): XmlElement | undefined =>
  element.children.find((c): c is XmlElement => typeof c !== 'string' && c.name === name);

/** The element's child elements, without its text. */
export const childElements = (element: XmlElement): readonly XmlElement[] =>
  element.children.filter((c): c is XmlElement => typeof c !== 'string');

/** All the element's text, joined, as `textContent` would give it. */
export const textOf = (element: XmlElement): string =>
  element.children.map((c) => (typeof c === 'string' ? c : textOf(c))).join('');
