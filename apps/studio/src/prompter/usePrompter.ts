/**
 * The Prompter for the open film (WP13c; `docs/spec/04-prompter.md` section 4.5): S7's
 * `createPrompterPanel` over the studio's own session, the host's transport and the class's
 * level. A new film is a new session and history, so it gets a new panel.
 */
import type { HostInterface, PupilId } from '@storystage/host';
import type { SceneId } from '@storystage/production';
import {
  createPrompterPanel,
  offTransport,
  type PrompterLevel,
  type PrompterPanel,
} from '@storystage/prompter';
import type { BackstageId } from '@storystage/story-api';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { placeFromStoryboard, storyboardPlan } from '@storystage/staging';
import type { ModelSourceHandle } from '../stage/useModelSource.ts';
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
    const made = createPrompterPanel({
      // The studio's own history, whose sources name the Prompter's changes 'prompter'.
      production: session,
      transport: host.prompter,
      source: 'prompter',
      level: () => (held.current ? 'off' : currentLevel.current),
      scene: () => (sceneNow.current ?? firstScene()) as SceneId,
      backstageClass: (id) => modelsNow.current.item(id as BackstageId)?.class ?? null,
      stageFromStoryboard: (p, at, label) => {
        const placed = placeFromStoryboard(p, at, storyboardPlan(p, at, backstage), label);
        return placed.ok ? placed : { ok: false, refusal: placed.refusal, name: placed.name };
      },
    });
    setPanel(made);
    return () => {
      // A request still running stops with the film it was for.
      made.stop();
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
