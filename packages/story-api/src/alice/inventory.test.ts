import { describe, expect, it } from 'vitest';
import { buildInventory, type AliceClass, type AliceMember } from './inventory.ts';
import compiled from './compiled-alice.json';
import palette from './palette.json';

const JAVA = {
  'SThing.java': `
    /** A comment with public void notAMethod() {} in it. */
    @ClassTemplate(isFollowToSuperClassDesired = false) public abstract class SThing implements Rider {
      @MethodTemplate(visibility = Visibility.COMPLETELY_HIDDEN)
      public abstract EntityImp getImplementation();

      @MethodTemplate(visibility = Visibility.TUCKED_AWAY)
      public String getName() { return "a } brace in a string"; }

      @MethodTemplate()
      public SThing getVehicle() { return null; }

      @MethodTemplate(visibility = Visibility.PRIME_TIME)
      public void delay(Number duration) { }

      // public void commentedOut() { }

      public Boolean isFacing(SThing other) { return false; }

      public void setVehicle(SThing vehicle) { }

      private void secret() { }

      public static void helper() { }

      @Override
      public String toString() { return ""; }
    }`,
  'SModel.java': `
    public abstract class SModel extends SThing {
      private final Map<String, Integer> counts = new HashMap<String, Integer>() {{ put("a", 1); }};

      public SModel(int size) { }

      @MethodTemplate()
      public void turn(TurnDirection direction, @ValueTemplate(detailsEnumCls = AngleDetails.class) Number amount, Turn.Detail... details) { }

      @MethodTemplate()
      public void say(String text, Say.Detail... details) { }

      public void addTo(Map<String, Integer> where, SThing[] set) { }

      @MethodTemplate()
      @AddEventListenerTemplate()
      public void addKeyPressListener(KeyPressListener listener, AddKeyPressListener.Detail... details) { }
    }`,
  'Turn.java': `
    public class Turn extends DurationAnimationStyleAsSeenByArgumentFactory {
      @ClassTemplate(keywordFactoryCls = Turn.class) public static interface Detail { }
      private Turn() { super(); }
    }`,
  'Say.java': `
    public class Say extends DurationAnimationStyleArgumentFactory {
      @ClassTemplate(keywordFactoryCls = Say.class) public static interface Detail { }
    }`,
  'AddKeyPressListener.java': `
    public class AddKeyPressListener {
      public interface Detail { }
      public static HeldKeyPolicy heldKeyPolicy(HeldKeyPolicy policy) { return policy; }
    }`,
  'DurationAnimationStyleArgumentFactory.java': `
    public class DurationAnimationStyleArgumentFactory {
      public static Duration duration(Number duration) { return new Duration(duration); }
      public static AnimationStyle animationStyle(AnimationStyle animationStyle) { return animationStyle; }
    }`,
  'DurationAnimationStyleAsSeenByArgumentFactory.java': `
    public class DurationAnimationStyleAsSeenByArgumentFactory extends DurationAnimationStyleArgumentFactory {
      public static AsSeenBy asSeenBy(SThing asSeenBy) { return new AsSeenBy(asSeenBy); }
    }`,
  'Duration.java': `public class Duration implements Turn.Detail, Say.Detail { }`,
  // AsSeenBy isn't a detail of Say, so it must not appear there even through a shared factory.
  'AsSeenBy.java': `public class AsSeenBy implements Turn.Detail { }`,
  'AnimationStyle.java': `
    public class AnimationStyle implements Turn.Detail, Say.Detail {
      public static final AnimationStyle BEGIN_AND_END_GENTLY = new AnimationStyle(true, true);
      public static final AnimationStyle BEGIN_AND_END_ABRUPTLY = new AnimationStyle(false, false);
      private static final double DEFAULT = 1.0;
    }`,
  'HeldKeyPolicy.java': `public enum HeldKeyPolicy implements AddKeyPressListener.Detail { FIRE_ONCE_ON_PRESS, FIRE_MULTIPLE; }`,
  'TurnDirection.java': `public enum TurnDirection { LEFT(Vector3.POSITIVE_Y_AXIS, 1), RIGHT(Vector3.NEGATIVE_Y_AXIS, -1); TurnDirection(Vector3 v, int n) { } }`,
};

const inventory = buildInventory(new Map(Object.entries(JAVA)));
const cls = (name: string): AliceClass => {
  const found = inventory.classes.find((c) => c.name === name);
  if (!found) throw new Error(`no class ${name}`);
  return found;
};
const names = (name: string) => cls(name).members.map((m) => m.name);

describe('which methods count', () => {
  it('follows Alice palette: PRIME_TIME or no annotation at all', () => {
    expect(names('SThing')).toEqual(['delay', 'getVehicle', 'isFacing', 'setVehicle']);
  });

  it('records which methods have no annotation, so the StoryStage 1 catalog can be compared', () => {
    const member = (n: string) => cls('SThing').members.find((m) => m.name === n);
    expect(member('delay')?.marked).toBe(true);
    expect(member('isFacing')?.marked).toBe(false);
  });

  it('skips constructors, fields, private and static methods, and Object methods', () => {
    expect(names('SModel')).toEqual(['addKeyPressListener', 'addTo', 'say', 'turn']);
    expect(names('SThing')).not.toContain('toString');
  });

  it('ignores anything in a comment or a string', () => {
    expect(names('SThing')).not.toContain('notAMethod');
    expect(names('SThing')).not.toContain('commentedOut');
  });
});

describe('member shape', () => {
  it('reads inheritance', () => {
    expect(cls('SModel')).toMatchObject({ extends: 'SThing', abstract: true });
    expect(cls('SThing').extends).toBeNull();
  });

  it('reads parameters past annotations, generics and arrays', () => {
    const turn = cls('SModel').members.find((m) => m.name === 'turn');
    expect(turn?.params).toEqual([
      { name: 'direction', type: 'TurnDirection' },
      { name: 'amount', type: 'Number' },
    ]);
    const addTo = cls('SModel').members.find((m) => m.name === 'addTo');
    expect(addTo?.params).toEqual([
      { name: 'where', type: 'Map<String,Integer>' },
      { name: 'set', type: 'SThing[]' },
    ]);
  });

  it('takes a trailing Detail varargs as the details, not a parameter', () => {
    const turn = cls('SModel').members.find((m) => m.name === 'turn');
    expect(turn?.details).toBe('Turn');
  });

  it('tells procedures, functions and events apart', () => {
    const kind = (c: string, n: string) => cls(c).members.find((m) => m.name === n)?.kind;
    expect(kind('SThing', 'delay')).toBe('procedure');
    expect(kind('SThing', 'getVehicle')).toBe('function');
    expect(kind('SModel', 'addKeyPressListener')).toBe('event');
  });
});

describe('keyword details', () => {
  it('collects factories up the extends chain', () => {
    expect(inventory.keywords['Turn']).toEqual({
      animationStyle: 'AnimationStyle',
      asSeenBy: 'SThing',
      duration: 'Number',
    });
  });

  it('keeps only factories whose result is a detail of that block', () => {
    expect(inventory.keywords['Say']).toEqual({
      animationStyle: 'AnimationStyle',
      duration: 'Number',
    });
  });

  it('accepts a factory that returns an enum implementing the detail', () => {
    expect(inventory.keywords['AddKeyPressListener']).toEqual({ heldKeyPolicy: 'HeldKeyPolicy' });
  });
});

describe('values', () => {
  it('lists enum constants', () => {
    expect(inventory.values['TurnDirection']).toEqual(['LEFT', 'RIGHT']);
    expect(inventory.values['HeldKeyPolicy']).toEqual(['FIRE_ONCE_ON_PRESS', 'FIRE_MULTIPLE']);
  });

  it('lists public static final constants of the class own type, and no others', () => {
    expect(inventory.values['AnimationStyle']).toEqual([
      'BEGIN_AND_END_GENTLY',
      'BEGIN_AND_END_ABRUPTLY',
    ]);
  });
});

describe('the committed inventory, palette.json', () => {
  const find = (c: string) => palette.classes.find((k) => k.name === c);
  const has = (c: string, m: string) => find(c)?.members.some((x) => x.name === m);

  it('names what it was read from', () => {
    expect(palette.source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('has the blocks the workplan names', () => {
    for (const m of ['move', 'moveTo', 'moveToward', 'moveAndOrientTo', 'place']) {
      expect(has('SMovableTurnable', m)).toBe(true);
    }
    for (const m of ['turn', 'roll', 'turnToFace', 'pointAt', 'orientTo', 'getDistanceTo']) {
      expect(has('STurnable', m)).toBe(true);
    }
    for (const m of ['say', 'think', 'resize', 'setOpacity', 'setPaint', 'getWidth']) {
      expect(has('SModel', m)).toBe(true);
    }
    expect(has('SThing', 'playAudio')).toBe(true);
    expect(has('SThing', 'isCollidingWith')).toBe(true);
  });

  it('has the methods the StoryStage 1 catalog misses because they have no annotation', () => {
    expect(has('STurnable', 'isFacing')).toBe(true);
    expect(has('SJointedModel', 'straightenOutJoints')).toBe(true);
    expect(has('SBiped', 'getLeftElbow')).toBe(true);
    expect(has('STextModel', 'setValue')).toBe(true);
  });

  it('leaves out what Alice hides', () => {
    expect(has('SBiped', 'walkTo')).toBe(false);
    expect(has('SBiped', 'touch')).toBe(false);
    expect(has('SJointedModel', 'strikePose')).toBe(false);
  });
});

/** One line per method, in the form `scripts/AliceCatalogDump.java` writes. */
function lines(keep: (member: AliceMember, cls: string) => boolean): string[] {
  const keywords: Record<string, Record<string, string>> = palette.keywords;
  return palette.classes
    .filter((c) => /^S[A-Z]/.test(c.name))
    .flatMap((c) =>
      (c.members as AliceMember[])
        .filter((m) => keep(m, c.name))
        .map((m) => {
          const details = Object.keys(keywords[m.details ?? ''] ?? {}).sort();
          return `${c.name}.${m.name}/${m.params.length}:${details.join(',')}`;
        }),
    );
}

const sorted = (list: readonly string[]) => [...new Set(list)].sort();

describe('palette.json against a compiled Alice (compiled-alice.json)', () => {
  /** The classes `ApiCatalog` walks. The others aren't among its roots. */
  const reached = new Set(compiled.apiCatalog.map((l) => l.split('.')[0]));

  it('has something to compare', () => {
    expect(compiled.palette).toHaveLength(292);
    expect(compiled.apiCatalog).toHaveLength(109);
  });

  it('matches reflection under the same palette rule', () => {
    expect(sorted(lines(() => true))).toEqual(sorted(compiled.palette));
  });

  it('matches the real ApiCatalog on the methods with an annotation', () => {
    const marked = lines((m, cls) => m.marked && reached.has(cls));
    expect(sorted(marked)).toEqual(sorted(compiled.apiCatalog));
  });
});
