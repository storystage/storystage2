/**
 * WP3.2, after the Java converter (`java/ConvertAliceModels.java`): finishes its .glb files and
 * summarises them.
 *
 * - **Facing.** Alice's models face -Z; glTF and StoryStage expect +Z (spec 17, section 7). Each
 *   model's scene goes under one node turned half a turn about Y. The node is named, so running
 *   again changes nothing.
 * - **Summary.** Each variant's class, home section, triangles, largest texture, and whether its
 *   skeleton maps onto the joint map (`mapSkeleton`), in `alice-models.json` and
 *   `conversion-report.md`.
 *
 * Nothing here publishes a model: the licence audit (3.1) decides which may ship.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NodeIO, type Document } from '@gltf-transform/core';
import { mapSkeleton, skeletonOf } from '@storystage/backstage';
import type { StoryClass } from '@storystage/story-api';
import { homeSection, storyClassOf } from './gallery.ts';

const TURN_NODE = 'storystage-face-plus-z';

interface Converted {
  readonly key: string;
  readonly variant: string | null;
  readonly file: string | null;
  readonly joints: readonly string[];
  readonly error: string | null;
}

export interface FinishedModel {
  readonly key: string;
  readonly variant: string | null;
  readonly file: string | null;
  readonly storyClass: string;
  readonly section: string;
  readonly triangles: number;
  /** The longer side of the largest texture, in pixels; 0 without textures. */
  readonly textureMaxPx: number;
  /** `none` for classes without a skeleton (props, vehicles). */
  readonly skeleton: 'mapped' | 'prop-only' | 'none';
  readonly missingJoints: readonly string[];
  readonly problem: string | null;
}

export async function finishAliceModels(dir: string): Promise<{ models: FinishedModel[] }> {
  const report = JSON.parse(await readFile(join(dir, 'conversion-report.json'), 'utf8')) as {
    models: Converted[];
  };
  const io = new NodeIO();
  const models: FinishedModel[] = [];
  for (const m of report.models) {
    const pkg = m.key.split('/')[0]!.toLowerCase();
    const storyClass = storyClassOf(pkg);
    const base = {
      key: m.key,
      variant: m.variant,
      file: m.file,
      storyClass,
      section: homeSection(pkg),
    };
    if (!m.file || m.error) {
      models.push({
        ...base,
        triangles: 0,
        textureMaxPx: 0,
        skeleton: 'none',
        missingJoints: [],
        problem: m.error ?? 'not converted',
      });
      continue;
    }
    const path = join(dir, m.file);
    const doc = await io.read(path);
    if (turnToFacePlusZ(doc)) await io.write(path, doc);
    const skeleton = skeletonOf(storyClass as StoryClass);
    const mapping = skeleton ? mapSkeleton(m.joints, skeleton) : null;
    models.push({
      ...base,
      triangles: countTriangles(doc),
      textureMaxPx: Math.max(
        0,
        ...doc
          .getRoot()
          .listTextures()
          .map((t) => Math.max(...(t.getSize() ?? [0, 0]))),
      ),
      skeleton: mapping ? mapping.status : 'none',
      missingJoints: mapping ? mapping.missingRequired : [],
      problem: null,
    });
  }
  const summary = { models };
  await writeFile(join(dir, 'alice-models.json'), `${JSON.stringify(summary, null, 2)}\n`);
  await writeFile(join(dir, 'conversion-report.md'), reportMarkdown(models));
  return summary;
}

/** Puts the scene under a node turned half a turn about Y. False if already done. */
function turnToFacePlusZ(doc: Document): boolean {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  if (!scene) return false;
  const children = scene.listChildren();
  if (children.length === 1 && children[0]!.getName() === TURN_NODE) return false;
  const turn = doc.createNode(TURN_NODE).setRotation([0, 1, 0, 0]);
  for (const child of children) {
    scene.removeChild(child);
    turn.addChild(child);
  }
  scene.addChild(turn);
  return true;
}

function countTriangles(doc: Document): number {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue;
      n += Math.floor(
        (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3,
      );
    }
  return n;
}

function reportMarkdown(models: readonly FinishedModel[]): string {
  const ok = models.filter((m) => !m.problem);
  const lines = [
    '# Alice models converted to glTF',
    '',
    'Written by `tools/convert-alice-models` (WP3.2). Not to be published until the licence audit clears each model (`docs/legal/licence-audit.md`; WP17.1).',
    '',
    `${ok.length} variants converted; ${models.length - ok.length} not converted.`,
    '',
    '| Model | Variant | Class | Section | Triangles | Largest texture | Skeleton | Missing joints |',
    '|---|---|---|---|---|---|---|---|',
    ...ok.map(
      (m) =>
        `| \`${m.key}\` | ${m.variant} | ${m.storyClass} | ${m.section} | ${m.triangles} | ${m.textureMaxPx || '—'} | ${m.skeleton} | ${m.missingJoints.join(', ') || '—'} |`,
    ),
  ];
  const failed = models.filter((m) => m.problem);
  if (failed.length)
    lines.push(
      '',
      '## Not converted',
      '',
      ...failed.map((m) => `- \`${m.key}\` ${m.variant ?? ''}: ${m.problem}`),
    );
  return `${lines.join('\n')}\n`;
}
