/**
 * The Prompter for the open film (WP13c; `docs/spec/04-prompter.md` section 4.5): S7's
 * `createPrompterPanel` over the studio's own session, the host's transport and the class's
 * level. A new film is a new session and history, so it gets a new panel.
 */
import type { HostInterface, PupilId } from '@storystage/host';
import {
  isFramePlan,
  withFramePlan,
  type FrameId,
  type Production,
  type SceneId,
} from '@storystage/production';
import {
  createPrompterPanel,
  offTransport,
  type Json,
  type PrompterLevel,
  type KeptPlan,
  type PrompterPanel,
} from '@storystage/prompter';
import type { BackstageId } from '@storystage/story-api';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { placeFromStoryboard, storyboardPlan } from '@storystage/staging';
import { addedObjectType } from '../production/characters.ts';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
import { sceneNumber } from '../storyboard/edits.ts';
import { sceneFrames } from '../storyboard/frames.ts';
import type { Studio, StudioSource } from '../studio.ts';

export type PrompterHost = Pick<HostInterface, 'prompter' | 'policy' | 'version' | 'prompterUsage'>;

/**
 * Whether this build has a Prompter at all: not the browser version (decision 0022). A Tauri app
 * whose policy can't be read has the off transport but a version, so it shows Off, not nothing.
 */
export const prompterInBuild = (host: Pick<HostInterface, 'prompter' | 'version'>): boolean =>
  host.version !== null || host.prompter !== offTransport;

/**
 * The pupil's level now (spec 04 section 4.3): the policy's, until the day's cap lowers it, which
 * the native layer's count says (`prompterUsage`). The browser version has no count.
 */
export async function levelNow(
  host: Pick<HostInterface, 'policy' | 'prompterUsage'>,
  pupil: PupilId | null,
): Promise<PrompterLevel> {
  if (!host.prompterUsage) return host.policy.prompter.level;
  try {
    const today = await host.prompterUsage.today();
    return today.entries.find((e) => e.pupil === pupil)?.level ?? today.level;
  } catch {
    return host.policy.prompter.level;
  }
}

/**
 * Keeps the agreed plan with its frame, in the build's own undo step (spec 04 section 6.7): the
 * plan as last shown and as the learner agreed it. One over the format's limits isn't kept, and
 * the build goes on without it.
 */
export function keepFramePlan(p: Production, { frame, shown, agreed }: KeptPlan): Production {
  const plan = { agreedAt: new Date().toISOString(), shown, agreed };
  return isFramePlan(plan) ? withFramePlan(p, frame, plan) : p;
}

/**
 * A frame's automatic check for the Prompter (spec 04 section 3.2, `check_frame`; 11.6): the
 * result saved on the frame, with the frame's id and the number the learner sees ("2.3"), so a
 * question about "frame 2.3" can be matched to it. `null` before the frame is checked. The words
 * come from the file: the session sends them as data, never as instructions.
 */
export function frameCheckFor(p: Production, id: FrameId): Json | null {
  const frame = p.frames.find((f) => f.id === id);
  if (!frame?.check) return null;
  const index = sceneFrames(p, frame.scene).findIndex((f) => f.id === id);
  return {
    frame: id,
    number: `${sceneNumber(p, frame.scene)}.${index + 1}`,
    items: frame.check.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      outcome: i.outcome,
      words: i.words,
      ...(i.node === undefined ? {} : { node: i.node }),
      ...(i.line === undefined ? {} : { line: i.line }),
    })),
    kept: [...frame.check.kept],
  };
}

export interface PrompterOptions {
  readonly host: PrompterHost;
  readonly studio: Studio;
  /** The current scene, shared with the Storyboard. */
  readonly scene: SceneId | null;
  readonly models: ModelSourceHandle;
  /** The pupil whose folder is open, whose count the cap is on. */
  readonly pupil: PupilId | null;
  /** A study task is open: the Prompter is held off, whatever the level (spec 14 section 6.5). */
  readonly heldOff?: boolean;
}

/** The panel for the open film, or `null` in the browser version. */
export function usePrompter({
  host,
  studio,
  scene,
  models,
  pupil,
  heldOff = false,
}: PrompterOptions): PrompterPanel<StudioSource> | null {
  // What the panel reads as it runs, kept current without making a new panel.
  const sceneNow = useRef(scene);
  const modelsNow = useRef(models);
  const currentLevel = useRef<PrompterLevel>(host.policy.prompter.level);
  const held = useRef(heldOff);
  useEffect(() => {
    sceneNow.current = scene;
    modelsNow.current = models;
  });
  const { session } = studio;
  // Made once the studio has drawn, as the stage and the editors are: one for each film.
  const [panel, setPanel] = useState<PrompterPanel<StudioSource> | null>(null);
  useEffect(() => {
    if (!prompterInBuild(host)) return;
    const firstScene = () => session.production().scenes[0]?.id;
    const backstage = {
      item: (id: string) => modelsNow.current.item(id as BackstageId),
      get backdrops() {
        return modelsNow.current.catalogue.filter((i) => i.section === 'backdrops');
      },
    };
    const staged = new WeakMap<Production, Map<SceneId, boolean>>();
    const made = createPrompterPanel({
      // The studio's own history, whose sources name the Prompter's changes 'prompter'.
      production: session,
      transport: host.prompter,
      source: 'prompter',
      level: () => (held.current ? 'off' : currentLevel.current),
      scene: () => (sceneNow.current ?? firstScene()) as SceneId,
      backstageClass: (id) => modelsNow.current.item(id as BackstageId)?.class ?? null,
      // An object it adds has its character's own moves, as Backstage's Add gives it (0074).
      objectType: (p, object) =>
        addedObjectType(p, object, (id) => modelsNow.current.item(id)?.displayName ?? null),
      stageFromStoryboard: (p, at, label) => {
        const placed = placeFromStoryboard(p, at, storyboardPlan(p, at, backstage), label);
        return placed.ok ? placed : { ok: false, refusal: placed.refusal, name: placed.name };
      },
      // Plan only ticks a `stage` step once the storyboard has nothing left to place (spec 04,
      // 6.6). Asked on every change, so worked out once for each production and scene.
      staged: (p, at) => {
        let scenes = staged.get(p);
        if (!scenes) staged.set(p, (scenes = new Map()));
        let done = scenes.get(at);
        if (done === undefined) {
          done =
            p.frames.some((f) => f.scene === at) && storyboardPlan(p, at, backstage).length === 0;
          scenes.set(at, done);
        }
        return done;
      },
      keepPlan: keepFramePlan,
      checkResult: (frame) => frameCheckFor(session.production(), frame),
    });
    setPanel(made);
    return () => {
      // A request still running stops with the film it was for.
      made.stop();
      made.dispose();
      setPanel(null);
    };
  }, [host, session]);

  // A request closes its one step on the session when it ends: Undo and Redo are named again.
  const busy = useSyncExternalStore(
    (l) => panel?.subscribe(l) ?? (() => {}),
    () => panel?.state.phase === 'working' || panel?.state.phase === 'building',
  );
  const { historyChanged } = studio;
  const changed = useRef(historyChanged);
  useEffect(() => {
    changed.current = historyChanged;
  });
  useEffect(() => {
    if (!busy) changed.current();
  }, [busy]);

  // The level on opening and for each pupil, and again once the day's cap has been reached.
  const atLimit = useSyncExternalStore(
    (l) => panel?.subscribe(l) ?? (() => {}),
    () => panel?.state.phase === 'limit',
  );
  useEffect(() => {
    if (!panel) return;
    let live = true;
    void levelNow(host, pupil).then((level) => {
      if (!live) return;
      currentLevel.current = level;
      void panel.refresh();
    });
    return () => {
      live = false;
    };
  }, [panel, host, pupil, atLimit]);

  // Held off while a study task is open, and back when it closes: a request running stops (S7).
  useEffect(() => {
    held.current = heldOff;
    void panel?.refresh();
  }, [panel, heldOff]);

  return panel;
}
