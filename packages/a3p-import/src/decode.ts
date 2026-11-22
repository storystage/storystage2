/**
 * Alice's XML as a graph of nodes (spec 19, section 2): the first step of WP9.2.
 *
 * Alice writes its AST as `<node type="org.lgna.project.ast.…" key="…">` with `<property>`
 * children. A node is written in full once, where it's first met, with its `key`; later uses are
 * `<node key="…"/>`. Decoding resolves those into the same object, so a method called in ten
 * places is one method. Alice's own classes, methods and fields (`JavaType`, `JavaMethod`…) are
 * named, not written out, and decode to a `java` reference by name.
 *
 * It reads only what Alice's encoder writes; anything else is refused as damaged. Which node
 * types the import knows is the mapping's business (section 7), not this file's.
 */
import { childElements, textOf, type XmlElement } from './xml.ts';

/** A property's value: text, a number, true or false, nothing, a node, or a list of them. */
export type AliceValue = string | number | boolean | null | AliceNode | readonly AliceValue[];

/** Something of Alice's own, by name: `org.lgna.story.SMovableTurnable.move`. */
export type JavaRef =
  | { readonly kind: 'type'; readonly name: string }
  | {
      readonly kind: 'method';
      readonly name: string;
      readonly declaringClass: string;
      readonly parameters: readonly string[];
    }
  | { readonly kind: 'field'; readonly name: string; readonly declaringClass: string }
  | {
      readonly kind: 'constructor';
      readonly declaringClass: string;
      readonly parameters: readonly string[];
    };

export interface AliceNode {
  /** The node's type without Alice's package: `MethodInvocation`, `JavaMethod`. */
  readonly type: string;
  /** Its key, if anything refers to it. */
  readonly key: string | null;
  readonly props: Readonly<Record<string, AliceValue>>;
  /** For Alice's own members: what they name. */
  readonly java?: JavaRef;
  /**
   * For a parameter of one of Alice's methods or constructors, and for a field's getter or
   * setter: the member it belongs to.
   */
  readonly owner?: AliceNode;
  /** For a parameter: its place, from 0. */
  readonly index?: number;
}

/** Why Alice's XML couldn't be decoded. `detail` is for logs and tests only. */
export class AliceDecodeError extends Error {
  readonly detail: string;
  constructor(detail: string) {
    super(detail);
    this.name = 'AliceDecodeError';
    this.detail = detail;
  }
}

const AST = 'org.lgna.project.ast.';
const shortType = (type: string) => (type.startsWith(AST) ? type.slice(AST.length) : type);

interface Building {
  type: string;
  key: string | null;
  props: Record<string, AliceValue>;
  java?: JavaRef;
  owner?: AliceNode;
  index?: number;
}

/** Decodes the root `<node>` of `programType.xml` or `type.xml`. */
export function decodeAlice(root: XmlElement): AliceNode {
  const byKey = new Map<string, AliceNode>();

  const fail = (what: string): never => {
    throw new AliceDecodeError(what);
  };

  /** A primitive `<value>`: its text read by its Java type. */
  const value = (e: XmlElement): AliceValue => {
    if (e.attributes['isNull'] === 'true') return null;
    const text = textOf(e);
    switch (e.attributes['type']) {
      case 'java.lang.Double':
      case 'java.lang.Float':
      case 'java.lang.Integer':
      case 'java.lang.Long':
      case 'java.lang.Short': {
        const n = Number(text);
        return Number.isFinite(n) ? n : fail(`a number that isn't one, ${e.attributes['type']}`);
      }
      case 'java.lang.Boolean':
        return text === 'true'
          ? true
          : text === 'false'
            ? false
            : fail('a true or false that is neither');
      default:
        // Strings, and Alice's enums (AccessLevel PUBLIC, an operator's EQUALS…), as their text.
        return text;
    }
  };

  const valueOf = (e: XmlElement): AliceValue => {
    if (e.name === 'node') return node(e);
    if (e.name === 'value') return value(e);
    if (e.name === 'collection') return childElements(e).map(valueOf);
    return fail(`an unexpected <${e.name}>`);
  };

  const names = (e: XmlElement | undefined) =>
    e ? childElements(e).map((t) => t.attributes['name'] ?? fail('a type with no name')) : [];

  const declaring = (e: XmlElement) =>
    childElements(e).find((c) => c.name === 'declaringClass')?.attributes['name'] ??
    fail('an Alice member with no class');

  /** What one of Alice's own members names. */
  const javaOf = (type: string, e: XmlElement): JavaRef | undefined => {
    const inner = childElements(e)[0];
    if (!inner) return undefined;
    const parameters = () => names(childElements(inner).find((c) => c.name === 'parameters'));
    switch (type) {
      case 'JavaType':
        return { kind: 'type', name: inner.attributes['name'] ?? fail('a type with no name') };
      case 'JavaMethod':
        return {
          kind: 'method',
          name: inner.attributes['name'] ?? fail('a method with no name'),
          declaringClass: declaring(inner),
          parameters: parameters(),
        };
      case 'JavaField':
        return {
          kind: 'field',
          name: inner.attributes['name'] ?? fail('a field with no name'),
          declaringClass: declaring(inner),
        };
      case 'JavaConstructor':
        return { kind: 'constructor', declaringClass: declaring(inner), parameters: parameters() };
      default:
        return undefined;
    }
  };

  const node = (e: XmlElement): AliceNode => {
    const key = e.attributes['key'] ?? null;
    const type = e.attributes['type'];
    if (type === undefined) {
      // A use of a node written earlier.
      if (key === null) return fail('a node with neither a type nor a key');
      return byKey.get(key) ?? fail(`a use of key ${key}, never written`);
    }
    if (key !== null && byKey.has(key)) fail(`key ${key} written twice`);
    const building: Building = { type: shortType(type), key, props: {} };
    // Registered before its children, which may refer back to it (a method in its own type).
    if (key !== null) byKey.set(key, building as AliceNode);
    const java = javaOf(building.type, e);
    if (java) building.java = java;
    for (const child of childElements(e)) {
      if (child.name === 'property') {
        const name = child.attributes['name'] ?? fail('a property with no name');
        const inner = childElements(child);
        if (inner.length > 1) fail(`property ${name} with more than one value`);
        building.props[name] = inner[0] ? valueOf(inner[0]) : null;
      } else if (child.name === 'node') {
        // A parameter's method or constructor, or a getter's field.
        building.owner = node(child);
      } else if (child.name === 'index') {
        const index = Number(textOf(child));
        building.index = Number.isInteger(index) && index >= 0 ? index : fail('a bad index');
      } else if (!java) {
        fail(`an unexpected <${child.name}> in ${building.type}`);
      }
    }
    return building as AliceNode;
  };

  if (root.name !== 'node') fail('a root that isn’t a node');
  return node(root);
}

/** Every node in the graph, each once, depth first. */
export function* nodesOf(root: AliceNode): Generator<AliceNode> {
  const seen = new Set<AliceNode>();
  const stack: AliceValue[] = [root];
  while (stack.length > 0) {
    const v = stack.pop();
    if (v === null || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      for (let i = v.length - 1; i >= 0; i--) stack.push(v[i]!);
      continue;
    }
    const n = v as AliceNode;
    if (seen.has(n)) continue;
    seen.add(n);
    yield n;
    if (n.owner) stack.push(n.owner);
    const values = Object.values(n.props);
    for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]!);
  }
}

/** A property that must be a node. */
export const nodeProp = (n: AliceNode, name: string): AliceNode | null => {
  const v = n.props[name];
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as AliceNode) : null;
};

/** A property that must be a list of nodes. */
export const listProp = (n: AliceNode, name: string): readonly AliceNode[] => {
  const v = n.props[name];
  return Array.isArray(v)
    ? v.filter((x): x is AliceNode => x !== null && typeof x === 'object' && !Array.isArray(x))
    : [];
};

/** A property that must be text. */
export const textProp = (n: AliceNode, name: string): string | null => {
  const v = n.props[name];
  return typeof v === 'string' ? v : null;
};
