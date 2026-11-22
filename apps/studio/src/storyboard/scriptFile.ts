/**
 * Import a script and Export the script (`07-ux.md` section 6.6; WP10.4): the script as a Fountain
 * file, read and written by `packages/production` (spec 03 section 5), with its limits. Importing
 * is for a production with no scenes yet: each heading becomes a scene, with its lines under it,
 * all one undo step.
 */
import {
  FOUNTAIN_LIMITS,
  addScene,
  fitName,
  lineId,
  plainName,
  readFountain,
  sceneId,
  scriptLineText,
  writeFountain,
  type FountainProblem,
  type Production,
  type SceneId,
  type SceneStep,
  type ScriptLine,
} from '@storystage/production';

/** What a script file may end in: Fountain's own ending, and plain text. */
export const SCRIPT_FILE_TYPES = '.fountain,.txt';

/** The script's file name, from the title: "The Owl.fountain". */
export const scriptFileName = (p: Production): string =>
  fitName(plainName(p.manifest.title, 'My film'), '.fountain');

/** The script as a Fountain file, in UTF-8. */
export const scriptFile = (p: Production): Uint8Array => new TextEncoder().encode(writeFountain(p));

export type ImportRefusal =
  /** Importing is only for a production with no scenes yet. */
  | { readonly code: 'hasScenes' }
  /** Scenes wait for a logline and a synopsis, as Add a scene does. */
  | { readonly code: 'needsLoglineAndSynopsis' }
  /** The file isn't text. */
  | { readonly code: 'notText' }
  /** A script with no scenes or lines in it. */
  | { readonly code: 'empty' }
  /** Over one of spec 03's limits: not read at all. */
  | FountainProblem
  /** The program refused a scene, in plain words. */
  | { readonly code: 'refused'; readonly reason: string };

export type ImportResult =
  | { readonly ok: true; readonly step: SceneStep; readonly scenes: number; readonly lines: number }
  | { readonly ok: false; readonly refusal: ImportRefusal };

const refuse = (refusal: ImportRefusal): ImportResult => ({ ok: false, refusal });

/** A file's bytes as text, or `null` if they aren't UTF-8. */
export function scriptText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * The script in `bytes` as one step: a scene for each heading, in order, with its heading and its
 * lines. Ids in the file are not kept (they belong to the production it came from), and nor are
 * pins, as the new scenes have no frames.
 */
export function importScript(p: Production, bytes: Uint8Array, label: string): ImportResult {
  if (p.manifest.runningOrder.length > 0) return refuse({ code: 'hasScenes' });
  if (p.storyboard.logline.trim() === '' || p.storyboard.synopsis.trim() === '')
    return refuse({ code: 'needsLoglineAndSynopsis' });
  // Over the size limit, it isn't decoded either.
  if (bytes.length > FOUNTAIN_LIMITS.bytes)
    return refuse({ code: 'tooBig', limit: FOUNTAIN_LIMITS.bytes });
  const text = scriptText(bytes);
  if (text === null) return refuse({ code: 'notText' });
  let n = 0;
  const read = readFountain(text, {
    scene: () => sceneId(`read-s${++n}`),
    line: () => lineId(`read-l${++n}`),
  });
  if (!read.ok) return refuse(read.problem);
  const { scenes } = read.script;
  if (scenes.length === 0) return refuse({ code: 'empty' });

  // Each heading through `addScene`, as Add a scene does, so the program gains each scene's type.
  let next = p;
  const edits: SceneStep['edits'][number][] = [];
  const undoing: SceneStep['inverses'][] = [];
  const ids = new Map<SceneId, SceneId>();
  for (const scene of scenes) {
    const added = addScene(next, { heading: scene.heading, label });
    // Checked above, or as the script was read: only the program can still refuse a scene.
    if (!added.ok)
      return refuse(
        added.refusal.code === 'refused' ? added.refusal : { code: 'refused', reason: '' },
      );
    next = added.step.production;
    edits.push(...added.step.edits);
    undoing.unshift(added.step.inverses);
    ids.set(scene.id, next.manifest.runningOrder.at(-1)!.scene);
  }

  // The lines, under their new scenes, numbered `l1`, `l2`, … as the script pane numbers them.
  const script: ScriptLine[] = [];
  for (const line of read.script.lines) {
    const text = scriptLineText(line.text);
    if (text === '') continue;
    script.push({
      ...line,
      id: lineId(`l${script.length + 1}`),
      scene: ids.get(line.scene)!,
      text,
      pinnedFrame: null,
    });
  }
  return {
    ok: true,
    scenes: scenes.length,
    lines: script.length,
    step: { label, edits, inverses: undoing.flat(), production: { ...next, script } },
  };
}
