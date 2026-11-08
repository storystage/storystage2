import { describe, expect, it } from 'vitest';
import { childNamed, parseXml, textOf, XmlRefused, type XmlElement } from './xml.ts';

const refusal = (text: string, depth?: number) => {
  try {
    parseXml(text, depth);
  } catch (e) {
    if (e instanceof XmlRefused) return e.code;
    throw e;
  }
  return null;
};

describe('parseXml', () => {
  it('reads elements, attributes and text, as Alice writes them', () => {
    const root = parseXml(
      '<?xml version="1.0" encoding="UTF-8" standalone="no"?><node key="1" type="T"><property name="name"><value type="java.lang.String">Program</value></property><property name="_package"><value isNull="true"/></property></node>',
    );
    expect(root.name).toBe('node');
    expect(root.attributes).toEqual({ key: '1', type: 'T' });
    const name = childNamed(root, 'property')!;
    expect(name.attributes['name']).toBe('name');
    expect(textOf(name)).toBe('Program');
    const empty = (root.children[1] as XmlElement).children[0] as XmlElement;
    expect(empty).toEqual({ name: 'value', attributes: { isNull: 'true' }, children: [] });
  });

  it('reads XML’s own entities, character references and CDATA, and keeps spaces', () => {
    const root = parseXml(
      `<v a='&lt;&amp;&quot;'> a &#38; b &#x263A; <![CDATA[<not a tag> &amp;]]></v>`,
    );
    expect(root.attributes['a']).toBe('<&"');
    expect(root.children).toEqual([' a & b ☺ <not a tag> &amp;']);
  });

  it('skips comments and processing instructions', () => {
    expect(parseXml('<!-- hi --><?pi x?><r><!-- in --></r>')).toEqual({
      name: 'r',
      attributes: {},
      children: [],
    });
  });

  it('refuses a document type declaration before parsing: no billion laughs', () => {
    const laughs = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">]><lolz>&lol2;</lolz>`;
    expect(refusal(laughs)).toBe('declaration');
    expect(refusal('<r/><!doctype r>')).toBe('declaration');
  });

  it('refuses any other declaration, and any entity it doesn’t define', () => {
    expect(refusal('<r><!ENTITY x "y"></r>')).toBe('declaration');
    expect(refusal('<r>&lol;</r>')).toBe('malformed');
    expect(refusal('<r>a & b</r>')).toBe('malformed');
    expect(refusal('<r>&#0;</r>')).toBe('malformed');
    expect(refusal('<r>&#xD800;</r>')).toBe('malformed');
  });

  it('stops at its nesting limit', () => {
    const deep = (n: number) => '<a>'.repeat(n) + '</a>'.repeat(n);
    expect(refusal(deep(256))).toBeNull();
    expect(refusal(deep(257))).toBe('tooDeep');
    expect(refusal('<a><a><a/></a></a>', 2)).toBe('tooDeep');
  });

  it('refuses what isn’t one well-formed document', () => {
    for (const bad of [
      '',
      'text',
      '<a>',
      '<a></b>',
      '<a/><b/>',
      '<a x="1" x="2"/>',
      '<a x=1/>',
      '<a x="<"/>',
      '<a',
      '<a><!-- open</a>',
      '<a><![CDATA[ open</a>',
      'x<a/>',
    ])
      expect(refusal(bad), bad).toBe('malformed');
  });

  it('treats an attribute called __proto__ as a name like any other', () => {
    const root = parseXml('<a __proto__="x"/>');
    expect(Object.getPrototypeOf(root.attributes)).toBe(Object.prototype);
    expect(Object.keys(root.attributes)).toEqual(['__proto__']);
  });

  it('reads a long document in time linear in its length', () => {
    const many = `<r>${'<p a="1">x</p>'.repeat(50_000)}</r>`;
    const start = performance.now();
    expect(parseXml(many).children).toHaveLength(50_000);
    expect(performance.now() - start).toBeLessThan(2_000);
  });
});
