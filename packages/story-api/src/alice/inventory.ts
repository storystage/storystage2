/**
 * WP4.1: what Alice's block palette offers, read from the Java source of `org.lgna.story`.
 *
 * This reads source rather than running StoryStage 1's `ApiCatalog`, which needs a compiled Alice.
 * It also follows Alice's own palette rule (`MemberTabComposite`): a public method counts when
 * its visibility is PRIME_TIME **or it has no `@MethodTemplate` at all**. `ApiCatalog.isPrimeTime`
 * requires the annotation, so it misses `straightenOutJoints`, `isFacing`, every joint getter
 * and Text's `setValue`. `marked` keeps the difference visible.
 *
 * The result is `palette.json`, the list spec 02 is checked against: names, types and values
 * only, so no Alice code comes into this repository. Regenerate it with `scripts/inventory-cli.ts`.
 */

export interface AliceParam {
  readonly name: string;
  readonly type: string;
}

export interface AliceMember {
  readonly name: string;
  readonly kind: 'procedure' | 'function' | 'event';
  readonly returns: string;
  readonly params: readonly AliceParam[];
  /** The keyword class of a trailing `X.Detail...`, or null. */
  readonly details: string | null;
  /** False when the method has no `@MethodTemplate`, so `ApiCatalog` doesn't list it. */
  readonly marked: boolean;
}

export interface AliceClass {
  readonly name: string;
  readonly extends: string | null;
  readonly abstract: boolean;
  readonly members: readonly AliceMember[];
}

export interface AliceInventory {
  readonly classes: readonly AliceClass[];
  /** Keyword class to the details it allows: name to type. */
  readonly keywords: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** Enums and constant-holding classes to their constants. */
  readonly values: Readonly<Record<string, readonly string[]>>;
}

/** Comments gone; strings and characters emptied, so their contents can't look like code. */
function stripJava(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const next = src[i + 1];
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && next === '*') {
      i = src.indexOf('*/', i + 2);
      i = i < 0 ? src.length : i + 2;
    } else if (c === '"' || c === "'") {
      out += c + c;
      i++;
      while (i < src.length && src[i] !== c) i += src[i] === '\\' ? 2 : 1;
      i++;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** `@X` and `@X(...)` taken out, returning the rest and the annotations' text. */
function splitAnnotations(text: string): { rest: string; annotations: string[] } {
  const annotations: string[] = [];
  let rest = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] !== '@') {
      rest += text[i++];
      continue;
    }
    const start = i;
    i++;
    while (i < text.length && /[\w.]/.test(text[i]!)) i++;
    let j = i;
    while (j < text.length && /\s/.test(text[j]!)) j++;
    if (text[j] === '(') {
      let depth = 0;
      do {
        if (text[j] === '(') depth++;
        if (text[j] === ')') depth--;
        j++;
      } while (depth > 0 && j < text.length);
      i = j;
    }
    annotations.push(text.slice(start, i));
  }
  return { rest, annotations };
}

/** Top-level pieces of a list, keeping `<>`, `()` and `[]` together. */
function splitTop(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const c of text) {
    if ('<([{'.includes(c)) depth++;
    if ('>)]}'.includes(c)) depth--;
    if (c === separator && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += c;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

/** `<...>` removed, for reading a declaration's words. */
function dropGenerics(text: string): string {
  let out = '';
  let depth = 0;
  for (const c of text) {
    if (c === '<') depth++;
    else if (c === '>') depth--;
    else if (depth === 0) out += c;
  }
  return out;
}

interface Declaration {
  readonly header: string;
  /** The `{ ... }` body, or null for a declaration ending in `;`. */
  readonly body: string | null;
}

/** The declarations directly inside `src`. */
function declarations(src: string): Declaration[] {
  const found: Declaration[] = [];
  let parens = 0;
  let header = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (c === '(') parens++;
    if (c === ')') parens--;
    if (c === ';' && parens === 0) {
      if (header.trim()) found.push({ header: header.trim(), body: null });
      header = '';
      i++;
    } else if (c === '{' && parens === 0) {
      const start = i + 1;
      let depth = 0;
      do {
        if (src[i] === '{') depth++;
        if (src[i] === '}') depth--;
        i++;
      } while (depth > 0 && i < src.length);
      found.push({ header: header.trim(), body: src.slice(start, i - 1) });
      header = '';
      // A field initialised with a block (`= new X() { };`) ends with a `;` of its own.
      if (src[i] === ';') i++;
    } else {
      header += c;
      i++;
    }
  }
  return found;
}

interface JavaType {
  readonly name: string;
  readonly kind: 'class' | 'interface' | 'enum';
  readonly abstract: boolean;
  readonly extends: string | null;
  readonly implements: readonly string[];
  readonly body: string;
}

const TYPE_HEADER = /\b(class|interface|enum)\s+(\w+)/;

function readType({ header, body }: Declaration): JavaType | null {
  const { rest } = splitAnnotations(header);
  const words = dropGenerics(rest).replace(/\s+/g, ' ').trim();
  const match = TYPE_HEADER.exec(words);
  if (!match || body === null) return null;
  const after = words.slice(match.index + match[0].length);
  const listAfter = (keyword: string, ends: readonly string[]): string[] => {
    const at = after.search(new RegExp(`\\b${keyword}\\b`));
    if (at < 0) return [];
    let list = after.slice(at + keyword.length);
    for (const end of ends) {
      const stop = list.search(new RegExp(`\\b${end}\\b`));
      if (stop >= 0) list = list.slice(0, stop);
    }
    return list
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  };
  const kind = match[1] as JavaType['kind'];
  return {
    name: match[2]!,
    kind,
    abstract: /\babstract\b/.test(words.slice(0, match.index)),
    extends: kind === 'class' ? (listAfter('extends', ['implements'])[0] ?? null) : null,
    implements: listAfter(kind === 'interface' ? 'extends' : 'implements', []),
    body,
  };
}

/** Methods on `Object`, which the palette never shows. */
const OBJECT_METHODS = new Set(['toString', 'equals', 'hashCode', 'finalize', 'clone']);

const DETAILS = /^(\w+)\.Detail\.\.\.$/;

function readParams(text: string): { params: AliceParam[]; details: string | null } {
  const params: AliceParam[] = [];
  let details: string | null = null;
  for (const raw of splitTop(text, ',')) {
    const words = splitAnnotations(raw)
      .rest.replace(/\bfinal\b/g, '')
      .trim();
    const at = words.search(/\S+$/);
    const name = words.slice(at);
    const type = words.slice(0, at).replace(/\s+/g, '');
    const detail = DETAILS.exec(type);
    if (detail) details = detail[1]!;
    else params.push({ name, type });
  }
  return { params, details };
}

function readMember(header: string, className: string, inInterface: boolean): AliceMember | null {
  const { rest, annotations } = splitAnnotations(header);
  const paren = rest.indexOf('(');
  if (paren < 0 || rest.includes('=')) return null;
  const before = dropGenerics(rest.slice(0, paren)).trim().split(/\s+/);
  const name = before.at(-1) ?? '';
  const returns = before.at(-2) ?? '';
  const modifiers = before.slice(0, -2);
  const isPublic = modifiers.includes('public') || inInterface;
  if (!isPublic || modifiers.includes('static') || name === className || !returns) return null;
  if (OBJECT_METHODS.has(name)) return null;

  const template = annotations.find((a) => /^@(\w+\.)*MethodTemplate\b/.test(a));
  const visibility = /visibility\s*=\s*(?:\w+\.)*(\w+)/.exec(template ?? '')?.[1];
  if (visibility && visibility !== 'PRIME_TIME') return null;

  const close = rest.lastIndexOf(')');
  const { params, details } = readParams(rest.slice(paren + 1, close));
  const isEvent = annotations.some((a) => /^@(\w+\.)*AddEventListenerTemplate\b/.test(a));
  return {
    name,
    kind: isEvent ? 'event' : returns === 'void' ? 'procedure' : 'function',
    returns,
    params,
    details,
    marked: template !== undefined,
  };
}

function staticFactories(type: JavaType): { name: string; param: string; returns: string }[] {
  const found: { name: string; param: string; returns: string }[] = [];
  for (const { header } of declarations(type.body)) {
    const { rest } = splitAnnotations(header);
    const paren = rest.indexOf('(');
    if (paren < 0 || rest.includes('=')) continue;
    const before = dropGenerics(rest.slice(0, paren)).trim().split(/\s+/);
    if (!before.includes('public') || !before.includes('static')) continue;
    const { params } = readParams(rest.slice(paren + 1, rest.lastIndexOf(')')));
    if (params.length !== 1) continue;
    found.push({ name: before.at(-1)!, param: params[0]!.type, returns: before.at(-2)! });
  }
  return found;
}

function readConstants(type: JavaType): string[] {
  if (type.kind === 'enum') {
    const end = splitTop(type.body, ';')[0] ?? '';
    return splitTop(end, ',')
      .map((c) => /^\s*(\w+)/.exec(splitAnnotations(c).rest)?.[1] ?? '')
      .filter(Boolean);
  }
  const constants: string[] = [];
  for (const { header } of declarations(type.body)) {
    const decl = /^public\s+static\s+final\s+(\w+)\s+(\w+)\s*=/.exec(
      splitAnnotations(header).rest.trim(),
    );
    if (decl?.[1] === type.name) constants.push(decl[2]!);
  }
  return constants;
}

/** Whether a story class is one the palette can show: `SThing`'s family and event objects. */
const isApiClass = (t: JavaType) => /^S[A-Z]/.test(t.name) || /Event$/.test(t.name);

/** Parents first, so the list reads from the most general class down. */
function parentsFirst(classes: readonly AliceClass[]): AliceClass[] {
  const named = new Map(classes.map((c) => [c.name, c]));
  const depth = (c: AliceClass): number => {
    const parent = c.extends ? named.get(c.extends) : undefined;
    return parent ? depth(parent) + 1 : 0;
  };
  return [...classes].sort((a, b) => depth(a) - depth(b) || a.name.localeCompare(b.name));
}

/** The inventory for a set of Java files, by any name; only their contents count. */
export function buildInventory(files: ReadonlyMap<string, string>): AliceInventory {
  const types = new Map<string, JavaType>();
  for (const source of files.values()) {
    for (const declaration of declarations(stripJava(source))) {
      const type = readType(declaration);
      if (type) types.set(type.name, type);
    }
  }

  const implementsDetail = (typeName: string, keyword: string): boolean => {
    const type = types.get(typeName);
    if (!type) return false;
    if (type.implements.includes(`${keyword}.Detail`)) return true;
    return type.extends ? implementsDetail(type.extends, keyword) : false;
  };

  const classes: AliceClass[] = [];
  const usedKeywords = new Set<string>();
  const values: Record<string, string[]> = {};
  for (const type of types.values()) {
    const constants = readConstants(type);
    if (constants.length > 0) values[type.name] = constants;
    if (!isApiClass(type) || type.kind === 'enum') continue;
    const members: AliceMember[] = [];
    for (const { header } of declarations(type.body)) {
      if (TYPE_HEADER.test(dropGenerics(splitAnnotations(header).rest))) continue;
      const member = readMember(header, type.name, type.kind === 'interface');
      if (member) members.push(member);
    }
    members.sort((a, b) => a.name.localeCompare(b.name) || a.params.length - b.params.length);
    for (const member of members) if (member.details) usedKeywords.add(member.details);
    classes.push({
      name: type.name,
      extends: type.extends,
      abstract: type.abstract,
      members,
    });
  }

  const keywords: Record<string, Record<string, string>> = {};
  for (const keyword of [...usedKeywords].sort()) {
    const details: [string, string][] = [];
    for (
      let type = types.get(keyword);
      type;
      type = type.extends ? types.get(type.extends) : undefined
    ) {
      for (const factory of staticFactories(type)) {
        if (implementsDetail(factory.returns, keyword)) details.push([factory.name, factory.param]);
      }
    }
    details.sort(([a], [b]) => a.localeCompare(b));
    keywords[keyword] = Object.fromEntries(details);
  }

  return {
    classes: parentsFirst(classes.filter((c) => c.members.length > 0 || !c.name.endsWith('Event'))),
    keywords,
    values: Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b))),
  };
}
