/**
 * The self-test's steps (WP18.1): a three-scene production; each scene set on the stage; the
 * film's own code run twice, the same both times; frames drawn twice, the same both times; five
 * seconds exported; every change undone and redone; and the film saved and opened again. Each step
 * uses the real parts (the stage, the runtime, the production's undo and its file), so the same
 * steps run in CI on the fake stage and in the app on the real one.
 */
import { nodeId, type EditOperation } from '@storystage/ast';
import { measure, type Timeline } from '@storystage/playback';
import {
  ProductionSession,
  checkReferences,
  demoProduction,
  moveScene,
  openProduction,
  saveProduction,
  type Production,
} from '@storystage/production';
import type { FromRuntime, Port, ToRuntime } from '@storystage/runtime';
import type { Stage } from '@storystage/stage';
import { CAMERA, micros, type SceneSetup, type StageCommand } from '@storystage/story-api';
import { check, type SelfTestStep } from './runner.ts';
import { t } from './strings.ts';

/** A runtime for one run: the worker in the app; in memory in tests. */
export interface SelfTestRuntime {
  readonly port: Port<ToRuntime, FromRuntime>;
  readonly terminate?: () => void;
}

export interface SelfTestContext {
  /** A fresh stage: the Babylon.js stage in the app, `FakeStage` in unit tests. */
  readonly makeStage: () => Stage | Promise<Stage>;
  /** A fresh runtime, for running the film's own code. */
  readonly startRuntime: () => SelfTestRuntime;
  /** The production to test. Default: the demo film, "The Lost Penguin (demo)". */
  readonly production?: () => Production;
  /**
   * Makes an MP4 of the film's first five seconds, where this device can (the app and the
   * browser, with WebCodecs). Without it, the export step checks that its frames come out the
   * same every time, and says so.
   */
  readonly exportFive?: (production: Production) => Promise<ArrayBuffer>;
}

const FPS = 30;
const productionOf = (c: SelfTestContext) => (c.production ?? demoProduction)();

/** Moves for each actor in a scene, for checking that the stage draws the same twice. */
function moves(setup: SceneSetup): StageCommand[] {
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
  ]);
}

/** Plays a scene's moves at a fixed time step and returns the state of every frame. */
async function play(stage: Stage, setup: SceneSetup, seconds: number): Promise<number[]> {
  await stage.load(setup);
  stage.schedule(moves(setup));
  const hashes: number[] = [];
  for (let f = 0; f <= seconds * FPS; f++) {
    stage.seek(micros(f / FPS));
    hashes.push(stage.stateHash());
  }
  return hashes;
}

/** Runs the film's own code through, drawing nothing, as the Screening room measures it. */
async function runFilm(c: SelfTestContext, production: Production): Promise<Timeline> {
  const stage = await c.makeStage();
  const runtime = c.startRuntime();
  try {
    return await measure({
      production,
      stage,
      port: runtime.port,
      ...(runtime.terminate ? { terminate: runtime.terminate } : {}),
      seed: 1,
      viewerWait: micros(1),
    });
  } finally {
    stage.dispose();
  }
}

/** The words each scene's code says: its `say` blocks, with the ids an edit needs. */
function saysOf(p: Production): { block: string; text: string; words: string }[] {
  const methods = p.program.types.flatMap((t) => t.methods);
  return p.scenes.flatMap((s) => {
    const body = methods.find((m) => m.id === s.method)?.body ?? [];
    return body.flatMap((b) => {
      const text = (b as { args?: { text?: { id: string; kind: string; value: string } } }).args
        ?.text;
      return b.kind === 'call' && text?.kind === 'text'
        ? [{ block: b.id as string, text: text.id, words: text.value }]
        : [];
    });
  });
}

/** The same text for the same value, whatever order its keys were written in. */
function same(a: unknown, b: unknown): boolean {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.keys(v)
              .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
              .sort()
              .map((k) => [k, canonical((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** What stopped the film, in the runtime's own plain words. */
const endWords = (end: Timeline['end']) =>
  'words' in end ? end.words : 'message' in end ? end.message : end.kind;

export const STEPS: readonly SelfTestStep<SelfTestContext>[] = [
  {
    id: 'production',
    title: t('step.production'),
    async run(c) {
      const p = productionOf(c);
      check(p.scenes.length === 3, t('problem.sceneCount', { count: p.scenes.length }));
      const problems = checkReferences(p);
      check(problems.length === 0, t('problem.references', { problem: problems[0] ?? '' }));
      check(p.storyboard.logline && p.storyboard.synopsis, t('problem.noLogline'));
      for (const s of p.scenes)
        check(
          p.frames.some((f) => f.scene === s.id),
          t('problem.noFrame', { scene: s.id }),
        );
      check(saysOf(p).length === 3, t('problem.noSays'));
    },
  },
  {
    id: 'stage',
    title: t('step.stage'),
    async run(c) {
      const stage = await c.makeStage();
      try {
        for (const scene of productionOf(c).scenes) {
          await stage.load(scene.setup);
          const objects = stage.objects();
          for (const o of scene.setup.objects)
            check(objects.includes(o.id), t('problem.missing', { scene: scene.id, object: o.id }));
          check(objects.includes(CAMERA), t('problem.noCamera', { scene: scene.id }));
        }
      } finally {
        stage.dispose();
      }
    },
  },
  {
    id: 'rehearse',
    title: t('step.rehearse'),
    async run(c) {
      const p = productionOf(c);
      const first = await runFilm(c, p);
      check(
        first.end.kind !== 'error' && first.end.kind !== 'fault',
        t('problem.filmStopped', { words: endWords(first.end) }),
      );
      const order = p.manifest.runningOrder.map((r) => r.scene);
      check(
        JSON.stringify(first.scenes.map((s) => s.scene)) === JSON.stringify(order),
        t('problem.order'),
      );
      for (const scene of order)
        check(
          first.blocks.some((b) => b.scene === scene),
          t('problem.codeDidNotRun', { scene }),
        );
      const said = first.lines.map((l) => l.text);
      for (const { words } of saysOf(p))
        check(said.includes(words), t('problem.neverSaid', { words }));
      const second = await runFilm(c, p);
      check(same(first, second), t('problem.filmDiffered'));
    },
  },
  {
    id: 'frames',
    title: t('step.frames'),
    async run(c) {
      for (const scene of productionOf(c).scenes) {
        const a = await c.makeStage();
        const b = await c.makeStage();
        try {
          const first = await play(a, scene.setup, 2);
          const second = await play(b, scene.setup, 2);
          check(first[0] !== first.at(-1), t('problem.nothingMoved', { scene: scene.id }));
          const frame = first.findIndex((h, i) => h !== second[i]);
          check(frame === -1, t('problem.sceneDiffered', { scene: scene.id, frame }));
        } finally {
          a.dispose();
          b.dispose();
        }
      }
    },
  },
  {
    id: 'export',
    title: t('step.export'),
    async run(c) {
      const p = productionOf(c);
      if (c.exportFive) {
        const mp4 = new Uint8Array(await c.exportFive(p));
        // An MP4 starts with its `ftyp` box.
        const type = String.fromCharCode(...mp4.slice(4, 8));
        check(mp4.length > 1000 && type === 'ftyp', t('problem.noMp4'));
        return;
      }
      const scene = p.scenes[0]!;
      const render = async () => {
        const stage = await c.makeStage();
        try {
          await stage.load(scene.setup);
          stage.schedule(moves(scene.setup));
          const frames: string[] = [];
          for (let f = 0; f < 5 * FPS; f++) {
            stage.seek(micros(f / FPS));
            const image = await stage.renderFrame();
            check(
              image.width > 0 && image.data.length === image.width * image.height * 4,
              t('problem.emptyFrame', { frame: f }),
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
      check(frame === -1, t('problem.exportDiffered', { frame }));
      return {
        standIn: t('standIn.noMp4'),
      };
    },
  },
  {
    id: 'undo',
    title: t('step.undo'),
    async run(c) {
      const start = productionOf(c);
      const session = new ProductionSession(start);
      const labels: string[] = [];
      for (const [i, say] of saysOf(start).entries()) {
        const label = t('edit.say', { n: i + 1 });
        const edit: EditOperation = {
          kind: 'setArgument',
          label,
          node: nodeId(say.block),
          slot: 'args',
          param: 'text',
          value: { id: nodeId(say.text), kind: 'text', value: `Self-test ${i + 1}` },
        };
        check(session.apply([edit], label, 'selftest').ok, t('problem.refused', { label }));
        labels.push(label);
      }
      const last = start.manifest.runningOrder.at(-1)!.scene;
      const moved = moveScene(session.production(), last, 0, t('edit.moveScene'));
      check(moved.ok, t('problem.moveRefused'));
      session.step(moved.step, 'selftest');
      labels.push(t('edit.moveScene'));
      const after = session.production();
      for (const label of [...labels].reverse()) {
        check(
          session.undoLabel() === label,
          t('problem.undoLabel', { expected: label, actual: session.undoLabel() ?? '' }),
        );
        session.undo();
      }
      check(same(session.production(), start), t('problem.undoAll'));
      labels.forEach(() => session.redo());
      check(same(session.production(), after), t('problem.redoAll'));
    },
  },
  {
    id: 'save',
    title: t('step.save'),
    async run(c) {
      const p = productionOf(c);
      const bytes = saveProduction(p);
      const opened = openProduction(bytes);
      check(opened.status === 'ok', t('problem.wontOpen'));
      check(same(opened.production, p), t('problem.openedDifferently'));
      const again = saveProduction(opened.production);
      check(
        again.length === bytes.length && again.every((b, i) => b === bytes[i]),
        t('problem.savedDifferently'),
      );
    },
  },
];
