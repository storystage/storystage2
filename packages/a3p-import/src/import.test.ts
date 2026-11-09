import { openProduction, saveProduction, writeArchive } from '@storystage/production';
import { backstageId } from '@storystage/story-api';
import { describe, expect, it } from 'vitest';
import {
  constant,
  create,
  field,
  invoke,
  javaMethod,
  javaType,
  method,
  on,
  resource,
  statement,
  userType,
  world,
} from './alice-testing.ts';
import { importAliceWorld, importDecodedWorld } from './import.ts';

// Spec 19, sections 7 and 8: the production and the report.

const camera = field('camera', javaType('SCamera'));
const ground = field('ground', javaType('SGround'));
const catType = userType('Cat', javaType('SQuadruped'));
const cat = field('cat', catType, create(resource('quadruped', 'AbyssinianCat')));
const cat2 = field('cat2', catType, create(resource('quadruped', 'AbyssinianCat')));
const tree = field(
  'tree',
  userType('MangoTree', javaType('SProp')),
  create(resource('prop', 'MangoTree')),
);

const alice = world(
  [camera, ground, cat, cat2, tree],
  [
    statement(
      invoke(on(ground), javaMethod('SGround', 'setPaint'), [
        constant('SGround$SurfaceAppearance', 'MOON'),
      ]),
    ),
  ],
  [method('myFirstMethod', [statement(invoke(on(cat), javaMethod('SMarker', 'setColorId'), []))])],
);

describe('importDecodedWorld', () => {
  it('makes a one-scene production marked as Alice’s, titled from the file', () => {
    const result = importDecodedWorld(alice, {
      fileName: 'C:\\worlds\\moon.a3p',
      findModel: (key) => (key === 'Prop/MangoTree' ? backstageId('Prop/Trees/MangoTree') : null),
    });
    const { production } = result;
    expect(production.manifest).toMatchObject({ title: 'moon', origin: 'alice' });
    expect(production.scenes).toHaveLength(1);
    expect(production.manifest.runningOrder).toEqual([
      { scene: production.scenes[0]!.id, transition: { kind: 'cut', duration: 0 } },
    ]);
    // Alice's moon ground is Backstage's, through S4's ALICE_GROUNDS.
    expect(production.scenes[0]!.setup.backdrop.ground).toBe('storystage/Ground/moon');
    // The card lists each model once: the tree's, and the cats' one stand-in.
    expect(production.storyboard.cards[0]).toMatchObject({
      heading: 'Scene',
      cast: [{ standIn: 'Abyssinian cat' }, 'Prop/Trees/MangoTree'],
    });
  });

  it('reports every gap, counted by kind', () => {
    const { report } = importDecodedWorld(alice);
    expect(report.counts).toMatchObject({ model: 2, block: 1, setUp: 0 });
    expect(report.gaps.map((g) => g.kind).sort()).toEqual(['block', 'model', 'model']);
  });

  it('gives a production that saves and opens again', () => {
    const { production } = importDecodedWorld(alice, { fileName: 'moon.a3p' });
    const opened = openProduction(saveProduction(production));
    expect(opened.status).toBe('ok');
    if (opened.status === 'ok') expect(opened.production).toEqual(production);
  });
});

describe('importAliceWorld', () => {
  const zip = (parts: Record<string, string>) =>
    writeArchive(
      Object.entries(parts).map(([name, text]) => ({
        name,
        bytes: new TextEncoder().encode(text),
      })),
    );

  it('passes on the reader’s plain-words refusals', () => {
    const result = importAliceWorld(new TextEncoder().encode('not a zip'));
    expect(result).toMatchObject({ ok: false, problem: { code: 'notAnArchive' } });
  });

  it('refuses a class on its own, which has no scene', () => {
    const result = importAliceWorld(
      zip({
        'version.txt': '3.3',
        'type.xml': '<node key="1" type="org.lgna.project.ast.NamedUserType"/>',
      }),
    );
    expect(result).toMatchObject({ ok: false, problem: { code: 'notAWorld' } });
  });

  it('refuses a world whose XML refers to a node never written', () => {
    const result = importAliceWorld(
      zip({
        'version.txt': '3.3',
        'programType.xml':
          '<node key="1" type="org.lgna.project.ast.NamedUserType"><property name="superType"><node key="9"/></property></node>',
      }),
    );
    expect(result).toMatchObject({ ok: false, problem: { code: 'badXml' } });
    if (!result.ok)
      expect(result.problem.message).toBe('This Alice world is damaged, so it wasn’t opened.');
  });
});
