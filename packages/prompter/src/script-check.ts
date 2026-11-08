/**
 * `script_check`'s facts (`docs/spec/04-prompter.md` section 3.2): how the script and the
 * storyboard line up, worked out by code. The Prompter explains them and asks about them; it
 * suggests no replacement words.
 */
import type { Production, SceneId } from '@storystage/production';

/** Words a second, spoken at a child's reading pace, to judge whether a frame is long enough. */
const WORDS_PER_SECOND = 2.5;

export interface ScriptFacts {
  /** Lines pinned to no frame. */
  readonly linesOnNoFrame: readonly string[];
  /** Frames with no line pinned to them. */
  readonly framesWithNoLine: readonly string[];
  /** Characters who speak in the script but aren't in the scene's cast. */
  readonly charactersNotInCast: readonly string[];
  /** Objects in the scene that no line names. */
  readonly castNeverNamed: readonly string[];
  /** Frames planned shorter than the time their lines take to say. */
  readonly framesTooShort: readonly {
    readonly frame: string;
    readonly plannedSeconds: number;
    readonly needsSeconds: number;
  }[];
}

const words = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

/** The facts for one scene, or for every scene. */
export function scriptFacts(p: Production, scene?: SceneId): ScriptFacts {
  const inScene = <T extends { readonly scene: SceneId }>(list: readonly T[]) =>
    scene === undefined ? list : list.filter((x) => x.scene === scene);
  const lines = inScene(p.script);
  const frames = inScene(p.frames);
  const setups = scene === undefined ? p.scenes : p.scenes.filter((s) => s.id === scene);
  const cast = new Set(
    setups.flatMap((s) => s.setup.objects.map((o) => String(o.id).toLowerCase())),
  );
  const said = lines.map((l) => `${l.character ?? ''} ${l.text}`.toLowerCase()).join(' ');

  const speakers = [
    ...new Set(lines.flatMap((l) => (l.kind === 'dialogue' && l.character ? [l.character] : []))),
  ];
  return {
    linesOnNoFrame: lines.filter((l) => l.pinnedFrame === null).map((l) => l.id),
    framesWithNoLine: frames
      .filter((f) => !lines.some((l) => l.pinnedFrame === f.id))
      .map((f) => f.id),
    charactersNotInCast: speakers.filter((c) => !cast.has(c.toLowerCase())),
    castNeverNamed: [...cast].filter((name) => name !== 'camera' && !said.includes(name)),
    framesTooShort: frames.flatMap((f) => {
      const total = lines
        .filter((l) => l.pinnedFrame === f.id)
        .reduce((sum, l) => sum + words(l.text), 0);
      const needsSeconds = Math.ceil((total / WORDS_PER_SECOND) * 10) / 10;
      return needsSeconds > f.lengthSeconds
        ? [{ frame: f.id, plannedSeconds: f.lengthSeconds, needsSeconds }]
        : [];
    }),
  };
}
