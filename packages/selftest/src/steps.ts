/**
 * The self-test's steps (WP18.1): build a three-scene production, set and rehearse each scene,
 * export five seconds, check undo, and save and reopen. Each step works through the WP0.8
 * contracts, so it runs today against the fake stage and later, unchanged, against the real
 * stage, runtime and export. Where a part isn't built yet, the step says what it stands in for.
 */
import type { Program } from '@storystage/ast';
import { TestHost } from '@storystage/editor-contract/testing';
import { checkReferences, exampleProduction, type Production } from '@storystage/production';
import type { Stage } from '@storystage/stage';
import { CAMERA, micros, type SceneSetup, type StageCommand } from '@storystage/story-api';
import { check, type SelfTestStep } from './runner.ts';

export interface SelfTestContext {
  /** A fresh stage: the Babylon.js stage in the app, `FakeStage` in unit tests. */
  readonly makeStage: () => Stage | Promise<Stage>;
  /** The production to test. Default: the built-in example production. */
  readonly production?: () => Production;
}

const FPS = 30;
const productionOf = (c: SelfTestContext) => (c.production ?? exampleProduction)();

/** Moves for each actor in a scene, until the runtime runs the scene's own code (WP6). */
function rehearsal(setup: SceneSetup): StageCommand[] {
  let seq = 0;
  return setup.objects.flatMap((o, i) => [
    {
      seq: seq++,
      object: o.id,
      start: micros(i * 0.25),
      duration: micros(1),
      style: 'beginAndEndGently' as const,
      kind: 'translate' as const,
      by: { x: 0, y: 0, z: 1 },
      space: 'self' as const,
    },
    {
      seq: seq++,
      object: o.id,
      start: micros(1 + i * 0.25),
      duration: micros(0.5),
      style: 'beginAndEndGently' as const,
      kind: 'rotate' as const,
      axis: { x: 0, y: 1, z: 0 },
      turns: 0.25,
      space: 'scene' as const,
    },
    {
      seq: seq++,
      object: o.id,
      start: micros(1.5),
      duration: micros(0.5),
      style: 'beginAndEndGently' as const,
      kind: 'say' as const,
      text: 'Hello',
      bubble: 'say' as const,
    },
  ]);
}

/** Plays a scene at a fixed time step and returns the state hash of every frame. */
async function play(stage: Stage, setup: SceneSetup, seconds: number): Promise<number[]> {
  await stage.load(setup);
  stage.schedule(rehearsal(setup));
  const hashes: number[] = [];
  for (let f = 0; f <= seconds * FPS; f++) {
    stage.seek(micros(f / FPS));
    hashes.push(stage.stateHash());
  }
  return hashes;
}

export const STEPS: readonly SelfTestStep<SelfTestContext>[] = [
  {
    id: 'production',
    title: 'Make a three-scene production',
    async run(c) {
      const p = productionOf(c);
      check(p.scenes.length === 3, `The production has ${p.scenes.length} scenes, not 3.`);
      const problems = checkReferences(p);
      check(problems.length === 0, `The production doesn't hang together: ${problems[0]}`);
      check(
        JSON.stringify(JSON.parse(JSON.stringify(p))) === JSON.stringify(p),
        'The production changed when it was written out and read back.',
      );
      check(
        p.storyboard.logline && p.storyboard.synopsis,
        'The storyboard has no logline or synopsis.',
      );
      for (const s of p.scenes)
        check(
          p.frames.some((f) => f.scene === s.id),
          `Scene ${s.id} has no storyboard frame.`,
        );
      return {
        standIn:
          'uses the built-in example production until the Storyboard (WP10) and saving (WP8) are built.',
      };
    },
  },
  {
    id: 'stage',
    title: 'Set the stage for each scene',
    async run(c) {
      const stage = await c.makeStage();
      try {
        for (const scene of productionOf(c).scenes) {
          await stage.load(scene.setup);
          const objects = stage.objects();
          for (const o of scene.setup.objects)
            check(objects.includes(o.id), `Scene ${scene.id} is missing ${o.id}.`);
          check(objects.includes(CAMERA), `Scene ${scene.id} has no camera.`);
        }
      } finally {
        stage.dispose();
      }
    },
  },
  {
    id: 'rehearse',
    title: 'Rehearse each scene, twice, and check both runs match',
    async run(c) {
      for (const scene of productionOf(c).scenes) {
        const a = await c.makeStage();
        const b = await c.makeStage();
        try {
          const first = await play(a, scene.setup, 2);
          const second = await play(b, scene.setup, 2);
          check(first[0] !== first.at(-1), `Nothing moved in scene ${scene.id}.`);
          const frame = first.findIndex((h, i) => h !== second[i]);
          check(
            frame === -1,
            `Scene ${scene.id} played differently the second time, from frame ${frame}.`,
          );
        } finally {
          a.dispose();
          b.dispose();
        }
      }
      return {
        standIn: "moves set by the self-test, until the runtime (WP6) runs each scene's own code.",
      };
    },
  },
  {
    id: 'export',
    title: 'Export five seconds',
    async run(c) {
      const scene = productionOf(c).scenes[0]!;
      const render = async () => {
        const stage = await c.makeStage();
        try {
          await stage.load(scene.setup);
          stage.schedule(rehearsal(scene.setup));
          const frames: string[] = [];
          for (let f = 0; f < 5 * FPS; f++) {
            stage.seek(micros(f / FPS));
            const image = await stage.renderFrame();
            check(
              image.width > 0 && image.data.length === image.width * image.height * 4,
              `Frame ${f} came out empty.`,
            );
            frames.push(Array.from(image.data.slice(0, 64)).join(','));
          }
          return frames;
        } finally {
          stage.dispose();
        }
      };
      const first = await render();
      const second = await render();
      const frame = first.findIndex((x, i) => x !== second[i]);
      check(frame === -1, `The export came out differently the second time, from frame ${frame}.`);
      return {
        standIn:
          'checks that 150 frames render the same every time; making the MP4 arrives with WP11.',
      };
    },
  },
  {
    id: 'undo',
    title: 'Undo every change, and redo them',
    async run(c) {
      const start = productionOf(c).program;
      type Counted = Program & { readonly edits: number };
      const host = new TestHost(start, {
        apply: (p, edits) =>
          ({ ...p, edits: ((p as Counted).edits ?? 0) + edits.length }) as Counted,
      });
      const labels = [
        'Add cat',
        'Make cat say Hello',
        'Move cat forward',
        'Add dog',
        'Turn dog to face cat',
      ];
      for (const label of labels)
        check(
          host.apply([{ kind: 'stand-in', label }], label, 'blocks').ok,
          `"${label}" was refused.`,
        );
      const after = JSON.stringify(host.program());
      for (const label of [...labels].reverse()) {
        check(
          host.undoLabel() === label,
          `The next undo should be "${label}", not "${host.undoLabel()}".`,
        );
        host.undo();
      }
      check(
        JSON.stringify(host.program()) === JSON.stringify(start),
        'Undoing everything did not bring back the original program.',
      );
      labels.forEach(() => host.redo());
      check(
        JSON.stringify(host.program()) === after,
        'Redoing everything did not bring back the changes.',
      );
      return {
        standIn: "uses stand-in changes until the program's own edit operations (WP2) land.",
      };
    },
  },
  {
    id: 'save',
    title: 'Save the production and open it again',
    notReady: 'needs saving and opening (WP8).',
    async run() {},
  },
];
