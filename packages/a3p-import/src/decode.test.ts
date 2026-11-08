import { describe, expect, it } from 'vitest';
import { AliceDecodeError, decodeAlice, listProp, nodeProp, nodesOf, textProp } from './decode.ts';
import { parseXml } from './xml.ts';

// Spec 19, section 2, on fragments in Alice's own form (as the starter projects write them).

const A = 'org.lgna.project.ast.';
const decode = (xml: string) => decodeAlice(parseXml(xml));
const refused = (xml: string) => {
  try {
    decode(xml);
  } catch (e) {
    if (e instanceof AliceDecodeError) return e.detail;
    throw e;
  }
  return null;
};

const PROGRAM = `<node key="1" type="${A}NamedUserType"><property name="name"><value type="java.lang.String">Program</value></property><property name="_package"><value isNull="true"/></property><property name="superType"><node key="4" type="${A}JavaType"><type name="org.lgna.story.SProgram"/></node></property><property name="methods"><collection type="java.util.ArrayList"><node key="5" type="${A}UserMethod"><property name="name"><value type="java.lang.String">main</value></property><property name="body"><node type="${A}BlockStatement"><property name="statements"><collection type="java.util.ArrayList"><node type="${A}ExpressionStatement"><property name="expression"><node type="${A}MethodInvocation"><property name="expression"><node type="${A}ThisExpression"/></property><property name="method"><node key="a" type="${A}JavaMethod"><method isVarArgs="false" name="move"><declaringClass name="org.lgna.story.SMovableTurnable"/><parameters><type name="org.lgna.story.MoveDirection"/><type name="java.lang.Number"/></parameters></method></node></property><property name="requiredArguments"><collection type="java.util.ArrayList"><node type="${A}SimpleArgument"><property name="parameter"><node key="b" type="${A}JavaMethodParameter"><node key="a"/><index>0</index></node></property><property name="expression"><node type="${A}FieldAccess"><property name="expression"><node type="${A}TypeExpression"><property name="value"><node key="4"/></property></node></property><property name="field"><node key="c" type="${A}JavaField"><field name="FORWARD"><declaringClass name="org.lgna.story.MoveDirection"/></field></node></property></node></property></node><node type="${A}SimpleArgument"><property name="parameter"><node key="d" type="${A}JavaMethodParameter"><node key="a"/><index>1</index></node></property><property name="expression"><node type="${A}DoubleLiteral"><property name="value"><value type="java.lang.Double">1.5</value></property></node></property></node></collection></property></node></property><property name="isEnabled"><value type="java.lang.Boolean">true</value></property></node></collection></property></node></property></node></collection></property></node>`;

describe('decodeAlice', () => {
  it('reads Alice’s nodes, properties and values', () => {
    const root = decode(PROGRAM);
    expect(root).toMatchObject({ type: 'NamedUserType', key: '1' });
    expect(textProp(root, 'name')).toBe('Program');
    expect(root.props['_package']).toBeNull();
    const main = listProp(root, 'methods')[0]!;
    expect(textProp(main, 'name')).toBe('main');
    const statement = listProp(nodeProp(main, 'body')!, 'statements')[0]!;
    expect(statement.props['isEnabled']).toBe(true);
    const call = nodeProp(statement, 'expression')!;
    const [direction, amount] = listProp(call, 'requiredArguments');
    expect(nodeProp(amount!, 'expression')!.props['value']).toBe(1.5);
    expect(nodeProp(nodeProp(direction!, 'expression')!, 'field')!.java).toEqual({
      kind: 'field',
      name: 'FORWARD',
      declaringClass: 'org.lgna.story.MoveDirection',
    });
  });

  it('names Alice’s own members, and resolves every use of a key to one node', () => {
    const root = decode(PROGRAM);
    const all = [...nodesOf(root)];
    const move = all.find((n) => n.type === 'JavaMethod')!;
    expect(move.java).toEqual({
      kind: 'method',
      name: 'move',
      declaringClass: 'org.lgna.story.SMovableTurnable',
      parameters: ['org.lgna.story.MoveDirection', 'java.lang.Number'],
    });
    const parameters = all.filter((n) => n.type === 'JavaMethodParameter');
    expect(parameters.map((p) => [p.owner, p.index])).toEqual([
      [move, 0],
      [move, 1],
    ]);
    // The superclass and the type expression are the same object.
    const superType = nodeProp(root, 'superType')!;
    expect(all.filter((n) => n === superType)).toHaveLength(1);
    expect(superType.java).toEqual({ kind: 'type', name: 'org.lgna.story.SProgram' });
  });

  it('lets a node refer to one it’s inside, as a method refers to its own type', () => {
    const root = decode(
      `<node key="1" type="${A}NamedUserType"><property name="methods"><collection type="java.util.ArrayList"><node key="2" type="${A}UserMethod"><property name="owner"><node key="1"/></property></node></collection></property></node>`,
    );
    expect(nodeProp(listProp(root, 'methods')[0]!, 'owner')).toBe(root);
  });

  it('refuses what Alice’s encoder never writes', () => {
    expect(
      refused(`<node key="1" type="${A}X"><property name="p"><node key="9"/></property></node>`),
    ).toMatch(/never written/);
    expect(
      refused(
        `<node key="1" type="${A}X"><property name="p"><node key="1" type="${A}Y"/></property></node>`,
      ),
    ).toMatch(/twice/);
    expect(
      refused(
        `<node type="${A}X"><property name="p"><value type="java.lang.Double">wide</value></property></node>`,
      ),
    ).toMatch(/number/);
    expect(refused(`<node type="${A}X"><oops/></node>`)).toMatch(/unexpected/);
    expect(refused('<root/>')).toMatch(/root/);
  });
});
