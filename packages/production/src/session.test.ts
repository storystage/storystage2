import { describe, expect, it } from 'vitest';
import { nodeId, type EditOperation } from '@storystage/ast';
import { objectId } from '@storystage/story-api';
import { exampleProduction } from './example.ts';
import { addScene, deleteScene, duplicateScene, moveScene, renameScene } from './scenes.ts';
import { ProductionSession, type CheckResult, type ProductionChange } from './session.ts';
import { checkReferences, frameId, sceneId, type Production } from './types.ts';

type Source = 'code' | 'stage' | 'storyboard' | 'prompter';

const s1 = sceneId('s1');
const fox1 = nodeId('scene1f'); // scene 1's fox field
const say1 = nodeId('scene1x'); // the text scene 1's penguin says

const setupOf = (p: Production, scene = s1) => p.scenes.find((s) => s.id === scene)!.setup;
const objectIds = (p: Production, scene = s1) => setupOf(p, scene).objects.map((o) => o.id);
const sayText = (p: Production) =>
  JSON.stringify(p.program).match(/"id":"scene1x","kind":"text","value":"([^"]*)"/)?.[1];

/** Moves scene 1's penguin on the stage: a change with no program edits. */
const movePenguin = (p: Production) => ({
  ...p,
  scenes: p.scenes.map((s) =>
    s.id === s1
      ? {
          ...s,
          setup: {
            ...s.setup,
            objects: s.setup.objects.map((o) =>
              o.id === 'penguin'
                ? { ...o, transform: { ...o.transform, position: { x: 9, y: 0, z: 0 } } }
                : o,
            ),
          },
        }
      : s,
  ),
});
const penguinX = (p: Production) =>
  setupOf(p).objects.find((o) => o.id === 'penguin')!.transform.position.x;

const setText = (value: string): EditOperation => ({
  kind: 'setArgument',
  label: `Say ${value}`,
  node: nodeId('scene1b'),
  slot: 'args',
  param: 'text',
  value: { id: say1, kind: 'text', value },
});

/** The same "random" numbers every run, so new node ids are the same every run. */
function seeded(seed = 1): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const session = () => new ProductionSession<Source>(exampleProduction());

describe('ProductionSession', () => {
  it('makes program edits one step each, undone and redone as EditSession does', () => {
    const s = session();
    expect(s.apply([setText('Hello')], 'Say Hello', 'code')).toEqual({ ok: true });
    expect(sayText(s.production())).toBe('Hello');
    s.undo();
    expect(sayText(s.production())).toBe('Oh no, the ice is moving!');
    expect(s.redoLabel()).toBe('Say Hello');
    s.redo();
    expect(sayText(s.production())).toBe('Hello');
    expect(s.history()).toEqual([{ label: 'Say Hello', source: 'code', done: true }]);
  });

  it('undoes a change on the stage, which has no program edits', () => {
    const s = session();
    s.change('Move penguin', 'stage', movePenguin);
    expect(penguinX(s.production())).toBe(9);
    const program = s.program();
    s.undo();
    expect(penguinX(s.production())).toBe(-1);
    expect(s.program()).toBe(program);
    s.redo();
    expect(penguinX(s.production())).toBe(9);
  });

  it('undoes adding a scene as one step: its type, set-up, card and place together', () => {
    const s = session();
    const before = s.production();
    const added = addScene(before, { heading: 'River, dawn', label: 'Add scene 4' }, seeded());
    if (!added.ok) throw new Error('not added');
    s.step(added.step, 'storyboard');
    expect(s.production().scenes).toHaveLength(4);
    expect(s.program().types).toHaveLength(4);
    expect(checkReferences(s.production())).toEqual([]);
    s.undo();
    expect(s.production().scenes).toEqual(before.scenes);
    expect(s.production().manifest).toEqual(before.manifest);
    expect(s.program()).toEqual(before.program);
    s.redo();
    expect(s.production().storyboard.cards.at(-1)!.heading).toBe('River, dawn');
    expect(checkReferences(s.production())).toEqual([]);
  });

  it('holds a deleted scene and a moved one as steps too', () => {
    const s = session();
    const deleted = deleteScene(s.production(), sceneId('s2'), 'Delete scene 2');
    if (!deleted.ok) throw new Error(JSON.stringify(deleted));
    s.step(deleted.step, 'storyboard');
    const moved = moveScene(s.production(), sceneId('s3'), 0, 'Move scene 3');
    if (!moved.ok) throw new Error('not moved');
    s.step(moved.step, 'storyboard');
    expect(s.production().manifest.runningOrder.map((r) => r.scene)).toEqual(['s3', 's1']);
    s.goTo(0);
    expect(s.production()).toEqual(exampleProduction());
  });

  it('groups program edits, scene steps and stage changes into one step', () => {
    const s = session();
    s.begin('Build it', 'prompter');
    s.apply([setText('Hello')], 'Say Hello', 'prompter');
    s.change('Move penguin', 'prompter', movePenguin);
    const added = addScene(s.production(), { heading: 'Sea', label: 'Add scene' }, seeded());
    if (!added.ok) throw new Error('not added');
    s.step(added.step, 'prompter');
    s.commit();
    expect(s.history()).toEqual([{ label: 'Build it', source: 'prompter', done: true }]);
    s.undo();
    expect(s.production()).toEqual(exampleProduction());
    s.redo();
    expect(sayText(s.production())).toBe('Hello');
    expect(penguinX(s.production())).toBe(9);
    expect(s.production().scenes).toHaveLength(4);
  });

  it('takes a cancelled group back, and leaves no step', () => {
    const s = session();
    s.begin('Build it', 'prompter');
    s.apply([setText('Hello')], 'Say Hello', 'prompter');
    s.change('Move penguin', 'prompter', movePenguin);
    s.cancel();
    expect(s.production()).toEqual(exampleProduction());
    expect(s.history()).toEqual([]);
  });

  it('renames a scene object in its set-up when its field is renamed in code (spec 03, 2.1)', () => {
    const s = session();
    s.change('Fox carries penguin', 'stage', (p) => ({
      ...p,
      scenes: p.scenes.map((sc) =>
        sc.id === s1
          ? {
              ...sc,
              setup: {
                ...sc.setup,
                objects: sc.setup.objects.map((o) =>
                  o.id === 'penguin' ? { ...o, vehicle: objectId('fox') } : o,
                ),
              },
            }
          : sc,
      ),
    }));
    const rename: EditOperation = {
      kind: 'rename',
      label: 'Rename fox',
      node: fox1,
      name: 'rusty',
    };
    expect(s.apply([rename], 'Rename fox', 'code')).toEqual({ ok: true });
    expect(objectIds(s.production())).toEqual(['penguin', 'rusty']);
    expect(setupOf(s.production()).objects[0]!.vehicle).toBe('rusty');
    // The other scenes' foxes are their own fields, so they keep their names.
    expect(objectIds(s.production(), sceneId('s2'))).toEqual(['penguin', 'fox']);
    expect(checkReferences(s.production())).toEqual([]);
    s.undo();
    expect(objectIds(s.production())).toEqual(['penguin', 'fox']);
    expect(setupOf(s.production()).objects[0]!.vehicle).toBe('fox');
  });

  it('takes an object out of its set-up when its field is removed in code', () => {
    const s = session();
    const remove: EditOperation = { kind: 'remove', label: 'Remove fox', node: fox1 };
    expect(s.apply([remove], 'Remove fox', 'code')).toEqual({ ok: true });
    expect(objectIds(s.production())).toEqual(['penguin']);
    expect(checkReferences(s.production())).toEqual([]);
    s.undo();
    expect(s.production()).toEqual(exampleProduction());
  });

  it("refuses removing a scene's script method, in plain words", () => {
    const s = session();
    const result = s.apply(
      [{ kind: 'remove', label: 'Remove method', node: nodeId('scene1m') }],
      'Remove method',
      'code',
    );
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/first method/) });
    expect(s.history()).toEqual([]);
  });

  it('refuses every change to a read-only production', () => {
    const s = new ProductionSession<Source>(exampleProduction(), {
      readOnly: 'This was made with a newer StoryStage, so it opens read-only.',
    });
    expect(s.apply([setText('x')], 'x', 'code')).toMatchObject({ ok: false });
    expect(s.change('x', 'stage', movePenguin)).toMatchObject({ ok: false });
    expect(s.production()).toEqual(exampleProduction());
  });

  it('tells listeners what changed and where it came from, and loads afresh', () => {
    const s = session();
    const seen: ProductionChange<Source>['source'][] = [];
    s.subscribe((c) => seen.push(c.source));
    s.change('Move penguin', 'stage', movePenguin);
    s.undo();
    s.redo();
    s.load(exampleProduction());
    expect(seen).toEqual(['stage', 'undo', 'redo', 'load']);
    expect(s.history()).toEqual([]);
    expect(s.undoLabel()).toBeNull();
  });
});

describe('renameScene', () => {
  it("changes the card's heading only", () => {
    const p = exampleProduction();
    const r = renameScene(p, s1, 'Ice shelf, dawn', 'Rename scene 1');
    expect(r.ok && r.step.production.storyboard.cards[0]!.heading).toBe('Ice shelf, dawn');
    expect(r.ok && r.step.edits).toEqual([]);
    expect(renameScene(p, sceneId('s9'), 'x', 'x')).toMatchObject({ ok: false });
  });
});

describe('duplicateScene', () => {
  const p = exampleProduction();
  const result = duplicateScene(
    p,
    s1,
    { heading: 'Ice shelf, again', label: 'Duplicate scene 1' },
    seeded(),
  );
  if (!result.ok) throw new Error(JSON.stringify(result));
  const d = result.step.production;
  const copyId = sceneId('s4');

  it('copies the type, set-up and card, placed straight after the original', () => {
    expect(d.manifest.runningOrder.map((r) => r.scene)).toEqual(['s1', 's4', 's2', 's3']);
    expect(d.manifest.runningOrder[1]!.transition).toEqual(p.manifest.runningOrder[0]!.transition);
    expect(d.program.types.map((t) => t.name)).toEqual(['Scene1', 'Scene2', 'Scene3', 'Scene4']);
    expect(setupOf(d, copyId)).toEqual(setupOf(p));
    expect(d.storyboard.cards.at(-1)).toMatchObject({ id: 's4', heading: 'Ice shelf, again' });
    expect(checkReferences(d)).toEqual([]);
  });

  it('gives the copy new ids everywhere, with links and pins following the copies', () => {
    const copy = d.program.types.at(-1)!;
    const original = p.program.types[0]!;
    expect(copy.id).not.toBe(original.id);
    expect(copy.methods[0]!.id).not.toBe(original.methods[0]!.id);
    const frames = d.frames.filter((f) => f.scene === copyId);
    expect(frames.map((f) => f.id)).toEqual(['f4']);
    expect(frames[0]!.links).toEqual([copy.methods[0]!.body[0]!.id]);
    const lines = d.script.filter((l) => l.scene === copyId);
    expect(lines.map((l) => l.id)).toEqual(['l5', 'l6']);
    expect(lines.map((l) => l.pinnedFrame)).toEqual(['f4', null]);
  });

  it('is one undo step in the session, and leaves the original alone', () => {
    const s = session();
    s.step(result.step, 'storyboard');
    expect(s.production().scenes).toHaveLength(4);
    s.undo();
    expect(s.production()).toEqual(exampleProduction());
    expect(duplicateScene(p, sceneId('s9'), { heading: 'x', label: 'x' })).toMatchObject({
      ok: false,
      refusal: { code: 'noSuchScene' },
    });
  });
});

describe('ProductionSession.annotate (spec 08 section 9.6)', () => {
  const f1 = frameId('f1');
  const result = (basis: string): CheckResult => ({
    basis,
    items: [{ id: 'length', kind: 'length', outcome: 'flag', words: 'This frame lasts 6 seconds' }],
  });
  const checkOf = (s: ProductionSession<Source>) =>
    s.production().frames.find((f) => f.id === f1)!.check;
  const keepLength = (p: Production) => ({
    ...p,
    frames: p.frames.map((f) =>
      f.id === f1 && f.check ? { ...f, check: { ...f.check, kept: ['length'] } } : f,
    ),
  });

  it('saves a result on its frame with no undo step, and tells listeners it was a check', () => {
    const s = session();
    const seen: string[] = [];
    s.subscribe((c) => seen.push(c.source));
    expect(s.annotate(new Map([[f1, result('b1')]]))).toEqual({ ok: true });
    expect(checkOf(s)).toEqual({ ...result('b1'), kept: [] });
    expect(s.history()).toEqual([]);
    expect(seen).toEqual(['check']);
  });

  it('keeps the latest result through undo and redo', () => {
    const s = session();
    s.change('Move penguin', 'stage', movePenguin);
    s.annotate(new Map([[f1, result('b2')]]));
    s.undo();
    expect(penguinX(s.production())).not.toBe(9);
    expect(checkOf(s)?.basis).toBe('b2');
    s.redo();
    expect(penguinX(s.production())).toBe(9);
    expect(checkOf(s)?.basis).toBe('b2');
  });

  it("leaves the flags kept to the history: keeping one is the learner's own step", () => {
    const s = session();
    s.annotate(new Map([[f1, result('b1')]]));
    s.change('Keep a flag', 'storyboard', keepLength);
    expect(checkOf(s)?.kept).toEqual(['length']);
    // A new run keeps what was kept.
    s.annotate(new Map([[f1, result('b3')]]));
    expect(checkOf(s)).toEqual({ ...result('b3'), kept: ['length'] });
    s.undo();
    expect(checkOf(s)).toEqual({ ...result('b3'), kept: [] });
    s.redo();
    expect(checkOf(s)?.kept).toEqual(['length']);
  });

  it('removes a result with null, skips frames that are gone, and forgets them all on load', () => {
    const s = session();
    s.annotate(
      new Map([
        [f1, result('b1')],
        [frameId('nowhere'), result('b1')],
      ]),
    );
    expect(s.production().frames.some((f) => f.id === 'nowhere')).toBe(false);
    s.annotate(new Map([[f1, null]]));
    expect(checkOf(s)).toBeUndefined();
    s.annotate(new Map([[f1, result('b1')]]));
    s.load(exampleProduction());
    expect(checkOf(s)).toBeUndefined();
    s.change('Move penguin', 'stage', movePenguin);
    s.undo();
    expect(checkOf(s)).toBeUndefined();
  });

  it('is refused for a read-only production', () => {
    const s = new ProductionSession<Source>(exampleProduction(), { readOnly: 'Read-only.' });
    expect(s.annotate(new Map([[f1, result('b1')]]))).toEqual({ ok: false, reason: 'Read-only.' });
    expect(checkOf(s)).toBeUndefined();
  });
});
