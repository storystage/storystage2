/**
 * For other packages' tests (`@storystage/a3p-import/testing`): real `.a3p` files, written here,
 * since Alice's own starter worlds can't be committed (they're fetched, spec 19 section 9).
 *
 * `encodeAlice` writes a decoded graph back as Alice's XML, the inverse of `decodeAlice`, and
 * `aliceArchive` packs it as an `.a3p`. `smallAliceWorld` is one small world that imports with a
 * gap of each common kind: a stand-in, a colour Alice mixed and a block left out.
 */
import { writeArchive } from '@storystage/production';
import {
  color,
  constant,
  create,
  field,
  invoke,
  javaMethod,
  javaType,
  make,
  method,
  num,
  on,
  resource,
  statement,
  text,
  userType,
  world,
} from './alice-testing.ts';
import type { AliceNode, AliceValue, JavaRef } from './decode.ts';

const AST = 'org.lgna.project.ast.';

const escape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** What names one of Alice's own members, as the first child of its `<node>`. */
function javaXml(java: JavaRef): string {
  const params = (names: readonly string[]) =>
    `<parameters>${names.map((p) => `<type name="${escape(p)}"/>`).join('')}</parameters>`;
  const cls = (name: string) => `<declaringClass name="${escape(name)}"/>`;
  switch (java.kind) {
    case 'type':
      return `<type name="${escape(java.name)}"/>`;
    case 'method':
      return `<method name="${escape(java.name)}">${cls(java.declaringClass)}${params(java.parameters)}</method>`;
    case 'field':
      return `<field name="${escape(java.name)}">${cls(java.declaringClass)}</field>`;
    case 'constructor':
      return `<constructor>${cls(java.declaringClass)}${params(java.parameters)}</constructor>`;
  }
}

/**
 * A decoded graph as Alice's XML: each node written in full where it's first met, with a key, and
 * as `<node key="…"/>` after that. `decodeAlice(readXml(encodeAlice(x)))` gives `x` back.
 */
export function encodeAlice(root: AliceNode): string {
  const keys = new Map<AliceNode, string>();

  const valueXml = (v: AliceValue): string => {
    if (v === null) return '<value isNull="true"/>';
    if (typeof v === 'string') return `<value type="java.lang.String">${escape(v)}</value>`;
    if (typeof v === 'number') return `<value type="java.lang.Double">${v}</value>`;
    if (typeof v === 'boolean') return `<value type="java.lang.Boolean">${v}</value>`;
    if (Array.isArray(v))
      return `<collection type="java.util.ArrayList">${v.map(valueXml).join('')}</collection>`;
    return nodeXml(v as AliceNode);
  };

  const nodeXml = (n: AliceNode): string => {
    const known = keys.get(n);
    if (known) return `<node key="${known}"/>`;
    const key = String(keys.size + 1);
    keys.set(n, key);
    const parts: string[] = [];
    if (n.java) parts.push(javaXml(n.java));
    if (n.owner) parts.push(nodeXml(n.owner));
    if (n.index !== undefined) parts.push(`<index>${n.index}</index>`);
    for (const [name, v] of Object.entries(n.props))
      parts.push(`<property name="${escape(name)}">${v === null ? '' : valueXml(v)}</property>`);
    return `<node key="${key}" type="${AST}${escape(n.type)}">${parts.join('')}</node>`;
  };

  return nodeXml(root);
}

/** A world's graph as an `.a3p` file's bytes, as Alice `version` would save it (UTF-8). */
export function aliceArchive(root: AliceNode, version = '3.6.0.0.0'): Uint8Array {
  const encoder = new TextEncoder();
  return writeArchive([
    { name: 'version.txt', bytes: encoder.encode(version) },
    {
      name: 'programType.xml',
      bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>${encodeAlice(root)}`),
    },
  ]);
}

/**
 * A small Alice world, `Scene`: a camera, the ground and a cat, sized in the set-up, and a
 * `myFirstMethod` where the cat says "Hello", turns left a quarter, moves forward 2 m and is
 * painted a colour Alice mixed.
 * Imported with no Backstage models it reports three gaps: the cat as a stand-in (`model`), the
 * colour Alice mixed (`value`), and Alice's set color id, left out (`block`).
 */
export function smallAliceWorld(): Uint8Array {
  const catType = userType('Cat', javaType('SQuadruped'));
  const cat = field('cat', catType, create(resource('quadruped', 'AbyssinianCat')));
  const camera = field('camera', javaType('SCamera'));
  const ground = field('ground', javaType('SGround'));
  const setUp = [
    statement(invoke(on(cat), javaMethod('SModel', 'setSize'), [make('Size', 0.5, 0.6, 1.2)])),
  ];
  const script = [
    statement(invoke(on(cat), javaMethod('SModel', 'say'), [text('Hello')])),
    statement(
      invoke(on(cat), javaMethod('STurnable', 'turn'), [
        constant('TurnDirection', 'LEFT'),
        num(0.25),
      ]),
    ),
    statement(
      invoke(on(cat), javaMethod('SMovableTurnable', 'move'), [
        constant('MoveDirection', 'FORWARD'),
        num(2),
      ]),
    ),
    statement(invoke(on(cat), javaMethod('SModel', 'setPaint'), [color(0.3, 0.6, 0.2)])),
    statement(invoke(on(cat), javaMethod('SMarker', 'setColorId'), [num(1)])),
  ];
  return aliceArchive(world([camera, ground, cat], setUp, [method('myFirstMethod', script)]));
}
