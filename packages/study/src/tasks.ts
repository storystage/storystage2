/**
 * The five study tasks (spec 14, 6.4; the draft protocol's section 4, cast from the library as
 * the owner chose on 17 Nov): each one's words, its prepared film, the events Check my step plays
 * in, and its success test. A test reads only what the scene's run did (`traceScene`, from
 * `@storystage/check`): where everyone ended, what they said and when. So any program that gets
 * there succeeds, however it's built, in either editor.
 */
import { nodeId, type Statement } from '@storystage/ast';
import {
  FORMAT_VERSION,
  frameId,
  sceneId,
  type Production,
  type SceneId,
} from '@storystage/production';
import {
  IDENTITY,
  backstageId,
  micros,
  objectId,
  type Micros,
  type ObjectId,
  type Quat,
  type StageEvent,
  type StoryClass,
  type Transform,
} from '@storystage/story-api';
import type { CheckOutcome, StudyTask } from './events.ts';
import { t } from './strings.ts';

/** A task still open after this long ends, as time up (6.4). */
export const TASK_LIMIT_MS = 15 * 60 * 1000;

/** The task films' one scene. */
export const TASK_SCENE: SceneId = sceneId('s1');

/** What a success test reads from the scene's run: a part of `@storystage/check`'s `SceneRun`. */
export interface TaskRun {
  readonly samples: readonly {
    readonly at: Micros;
    readonly characters: ReadonlyMap<string, { readonly transform: Transform }>;
  }[];
  readonly said: readonly {
    readonly object: string;
    readonly text: string;
    readonly start: Micros;
  }[];
  readonly error: unknown;
}

export interface StudyTaskDef {
  readonly task: StudyTask;
  readonly title: string;
  readonly instruction: string;
  readonly hint: string;
  /** T1 to T3 hold the class's default editor (6.5). */
  readonly holdsEditor: boolean;
  /** Played into Check my step's run, as the learner's would be: T4's click. */
  readonly events: readonly StageEvent[];
  /** A new copy of the task's prepared film, opened in memory only. */
  film(): Production;
  /** True when the run reached the task's end state. */
  succeeded(run: TaskRun): boolean;
}

// ---- Placing and reading the cast --------------------------------------------------------

/** A turn about the vertical, in degrees: 0 faces +Z, away from the camera; 180 faces it. */
const turned = (degrees: number): Quat => {
  const half = (degrees * Math.PI) / 360;
  return { x: 0, y: Math.sin(half), z: 0, w: Math.cos(half) };
};

interface Cast {
  readonly id: string;
  readonly model: string;
  readonly class: StoryClass;
  readonly x: number;
  readonly z: number;
  readonly degrees: number;
}

const endOf = (run: TaskRun) => run.samples.at(-1) ?? null;
const placeOf = (run: TaskRun, at: number, id: string) =>
  run.samples[at]?.characters.get(id)?.transform ?? null;

/** Distance on the ground, centre to centre. */
function apart(a: Transform, b: Transform): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

/**
 * How far `who` is turned from facing `what`, in degrees, on the ground. A model faces its own
 * +Z, so its facing is its rotation applied to (0, 0, 1). Close enough to stand on it counts as
 * facing it.
 */
function turnedFrom(who: Transform, what: Transform): number {
  const { x, y, z, w } = who.rotation;
  const fx = 2 * (x * z + w * y);
  const fz = 1 - 2 * (x * x + y * y);
  const dx = what.position.x - who.position.x;
  const dz = what.position.z - who.position.z;
  const facing = Math.hypot(fx, fz);
  const away = Math.hypot(dx, dz);
  if (away < 0.3) return 0;
  if (facing < 1e-6) return 180;
  const cos = (fx * dx + fz * dz) / (facing * away);
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

/** Words compared as a learner means them: no capitals, punctuation or spare spaces. */
const plain = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();

const saidBy = (run: TaskRun, who: string, words: string) =>
  run.said.filter((s) => s.object === who && plain(s.text) === plain(words));

/** One step of the run, 1/30 s: something that happens "as" he arrives may be a step early. */
const STEP: Micros = micros(1 / 30);

// ---- The films ---------------------------------------------------------------------------

const MODELS = {
  teddy: 'osa/Biped/teddy',
  polybot: 'osa/Biped/polybot',
  dinoKid: 'osa/Biped/dino-kid',
  autumn: 'blender-studio/Quadruped/autumn',
  redRidingHood: 'sketchfab/Biped/red-riding-hood',
  grandmother: 'sketchfab/Biped/grandmother',
  tree: 'polypizza/Prop/tree',
  fence: 'polypizza/Prop/picket-fence',
} as const;

/**
 * A film of one scene on grass: the cast where `cast` puts them, the camera 6 m back looking at
 * them, and `body` as the scene's method (empty, except for T5's broken turn). The storyboard has
 * its logline, synopsis, card and one frame, so the Code editor opens (10.8).
 */
function film(task: StudyTask, cast: readonly Cast[], body: readonly Statement[] = []): Production {
  const n = task.slice(1);
  const id = (part: string) => nodeId(`study${n}${part}`);
  const scene = TASK_SCENE;
  const fields = cast.map((c, i) => ({
    id: id(`f${i}`),
    kind: 'field' as const,
    name: c.id,
    type: { kind: 'story' as const, name: c.class },
    initial: null,
  }));
  return {
    manifest: {
      format: 'storystage',
      formatVersion: FORMAT_VERSION,
      createdWith: { app: 'StoryStage', version: '0.0.0' },
      title: t(`${task}.title`),
      origin: 'storystage',
      runningOrder: [{ scene, transition: { kind: 'cut', duration: 0 } }],
      audio: [],
      models: [],
    },
    program: {
      schemaVersion: '1.0.0',
      types: [
        {
          id: id('type'),
          kind: 'type',
          name: 'Scene1',
          extends: { kind: 'story', name: 'Scene' },
          fields: [
            {
              id: id('cam'),
              kind: 'field',
              name: 'camera',
              type: { kind: 'story', name: 'Camera' },
              initial: null,
            },
            ...fields,
          ],
          methods: [
            {
              id: id('main'),
              kind: 'method',
              name: 'myFirstMethod',
              returns: null,
              params: [],
              body,
            },
          ],
          listeners: [],
        },
      ],
    },
    scenes: [
      {
        id: scene,
        method: id('main'),
        setup: {
          backdrop: {
            ground: backstageId('storystage/Ground/grass'),
            sky: backstageId('storystage/Sky/grass'),
            lighting: backstageId('storystage/Lighting/grass'),
            fog: 0,
          },
          objects: cast.map((c) => ({
            id: objectId(c.id),
            model: backstageId(c.model),
            class: c.class,
            transform: {
              ...IDENTITY,
              position: { x: c.x, y: 0, z: c.z },
              rotation: turned(c.degrees),
            },
          })),
          camera: { transform: { ...IDENTITY, position: { x: 0, y: 1.6, z: -6 } } },
          markers: [],
        },
      },
    ],
    storyboard: {
      logline: t('film.logline'),
      synopsis: t('film.synopsis'),
      arc: { template: 'threePart', parts: ['beginning', 'middle', 'end'] },
      cards: [
        {
          id: scene,
          heading: t('film.heading', { number: n }),
          cast: cast.filter((c) => c.class !== 'Prop').map((c) => backstageId(c.model)),
          arcPart: 'beginning',
        },
      ],
    },
    script: [],
    frames: [
      {
        id: frameId(`study${n}f`),
        scene,
        order: 0,
        caption: t(`${task}.instruction`),
        shot: 'wide',
        lengthSeconds: 5,
        sketches: [],
        links: [],
      },
    ],
  };
}

/** T5's broken step: Red Riding Hood turns right a quarter, away from Grandmother. */
const wrongTurn: Statement = {
  id: nodeId('study5turn'),
  kind: 'call',
  target: {
    id: nodeId('study5tref'),
    kind: 'fieldRef',
    target: { id: nodeId('study5this'), kind: 'this' },
    field: nodeId('study5f0'),
  },
  callee: { kind: 'story', name: 'turn' },
  args: {
    direction: { id: nodeId('study5dir'), kind: 'enum', type: 'TurnDirection', value: 'right' },
    amount: { id: nodeId('study5amt'), kind: 'number', value: 0.25 },
  },
  details: {},
};

// ---- The tasks ---------------------------------------------------------------------------

const words = (task: StudyTask) => ({
  task,
  title: t(`${task}.title`),
  instruction: t(`${task}.instruction`),
  hint: t(`${task}.hint`),
});

const T1: StudyTaskDef = {
  ...words('T1'),
  holdsEditor: true,
  events: [],
  film: () =>
    film('T1', [
      { id: 'teddy', model: MODELS.teddy, class: 'Biped', x: 2.5, z: 0, degrees: 180 },
      { id: 'tree', model: MODELS.tree, class: 'Prop', x: -2.5, z: 3, degrees: 0 },
    ]),
  succeeded(run) {
    const end = run.samples.length - 1;
    const teddy = placeOf(run, end, 'teddy');
    const tree = placeOf(run, end, 'tree');
    if (!teddy || !tree || apart(teddy, tree) > 2 || turnedFrom(teddy, tree) > 45) return false;
    const there = run.samples.findIndex((s, i) => {
      const a = placeOf(run, i, 'teddy');
      const b = placeOf(run, i, 'tree');
      return !!s && !!a && !!b && apart(a, b) <= 2;
    });
    const arrived = run.samples[there]!.at;
    return saidBy(run, 'teddy', 'Hello').some((s) => s.start >= arrived - STEP);
  },
};

const T2: StudyTaskDef = {
  ...words('T2'),
  holdsEditor: true,
  events: [],
  film: () =>
    film('T2', [
      { id: 'polybot', model: MODELS.polybot, class: 'Biped', x: -1.5, z: 2, degrees: 180 },
      { id: 'teddy', model: MODELS.teddy, class: 'Biped', x: 3, z: -2, degrees: 180 },
      { id: 'fence', model: MODELS.fence, class: 'Prop', x: -3, z: 4, degrees: 0 },
    ]),
  succeeded(run) {
    const end = run.samples.length - 1;
    const polybot = placeOf(run, end, 'polybot');
    const teddy = placeOf(run, end, 'teddy');
    const fence = placeOf(run, end, 'fence');
    if (!polybot || !teddy || !fence) return false;
    if (apart(polybot, fence) > 1.5 || turnedFrom(teddy, polybot) > 30) return false;
    // Polybot's moving and Teddy's turning overlap for at least half a second.
    let together = 0;
    for (let i = 1; i < run.samples.length; i++) {
      const [p0, p1] = [placeOf(run, i - 1, 'polybot'), placeOf(run, i, 'polybot')];
      const [t0, t1] = [placeOf(run, i - 1, 'teddy'), placeOf(run, i, 'teddy')];
      if (!p0 || !p1 || !t0 || !t1) continue;
      const moving =
        Math.hypot(...['x', 'y', 'z'].map((k) => p1.position[k as 'x'] - p0.position[k as 'x'])) >
        1e-3;
      const turning = (['x', 'y', 'z', 'w'] as const).some(
        (k) => Math.abs(t1.rotation[k] - t0.rotation[k]) > 1e-4,
      );
      if (moving && turning) together += run.samples[i]!.at - run.samples[i - 1]!.at;
    }
    return together >= micros(0.5);
  },
};

const T3: StudyTaskDef = {
  ...words('T3'),
  holdsEditor: true,
  events: [],
  film: () =>
    film('T3', [
      { id: 'dinoKid', model: MODELS.dinoKid, class: 'Biped', x: 0, z: 0, degrees: 180 },
    ]),
  succeeded(run) {
    const ground = placeOf(run, 0, 'dinoKid')?.position.y;
    const last = endOf(run)?.characters.get('dinoKid')?.transform.position.y;
    if (ground === undefined || last === undefined || Math.abs(last - ground) > 0.05) return false;
    let jumps = 0;
    let up = false;
    for (const s of run.samples) {
      const y = s.characters.get('dinoKid')?.transform.position.y;
      if (y === undefined) continue;
      if (!up && y - ground >= 0.3) {
        up = true;
        jumps++;
      } else if (up && y - ground <= 0.05) up = false;
    }
    return jumps === 3 && !up;
  },
};

/** T4's click on Autumn, a second into the run. */
const CLICK_AT = micros(1);

const T4: StudyTaskDef = {
  ...words('T4'),
  holdsEditor: false,
  events: [{ kind: 'click', object: objectId('autumn') as ObjectId, x: 0.5, y: 0.3, at: CLICK_AT }],
  film: () =>
    film('T4', [
      { id: 'autumn', model: MODELS.autumn, class: 'Quadruped', x: 0, z: 0, degrees: 180 },
    ]),
  succeeded(run) {
    const woofs = saidBy(run, 'autumn', 'Woof');
    return woofs.length > 0 && woofs.every((s) => s.start >= CLICK_AT);
  },
};

const T5: StudyTaskDef = {
  ...words('T5'),
  holdsEditor: false,
  events: [],
  film: () =>
    film(
      'T5',
      [
        {
          id: 'redRidingHood',
          model: MODELS.redRidingHood,
          class: 'Biped',
          x: 2,
          z: 0,
          degrees: 180,
        },
        { id: 'grandmother', model: MODELS.grandmother, class: 'Biped', x: -2, z: 1, degrees: 180 },
      ],
      [wrongTurn],
    ),
  succeeded(run) {
    const end = run.samples.length - 1;
    const hood = placeOf(run, end, 'redRidingHood');
    const grandmother = placeOf(run, end, 'grandmother');
    return !!hood && !!grandmother && turnedFrom(hood, grandmother) <= 30;
  },
};

/** The five tasks, in order. */
export const STUDY_TASKS: readonly StudyTaskDef[] = [T1, T2, T3, T4, T5];

export const studyTask = (task: StudyTask): StudyTaskDef =>
  STUDY_TASKS.find((d) => d.task === task)!;

/** Check my step's outcome for a run: an error stops it, else success or not yet. */
export function checkTask(task: StudyTask, run: TaskRun): CheckOutcome {
  if (run.error) return 'error';
  return studyTask(task).succeeded(run) ? 'success' : 'notYet';
}
