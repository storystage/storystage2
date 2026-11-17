/**
 * WP10.5: draws the storyboard sketches for every model in a Backstage folder, records them in
 * `backstage.json`, and writes the touch-up list (`docs/spec/17-backstage.md`, section 7).
 *
 * A Backstage folder holds `backstage.json`, the model files it names, and `sketches/`. Hand-drawn
 * replacements for sketches that don't read well are named in `sketches/touch-up.json`:
 *
 *   {
 *     "overrides": { "sketches/kenney/Prop/sign/side.svg": "touch-up/sign-side.svg" },
 *     "backdrops": { "polyhaven/Ground/meadow": "backdrop/hills" },
 *     "outlineOnly": ["sketches/smithsonian/Prop/triceratops/back.svg"],
 *     "kept": ["sketches/polypizza/Prop/books/side.svg"]
 *   }
 *
 * `outlineOnly` draws a sketch as its outer edge alone, for a scan whose surface tangles into
 * small lines; `kept` names sketches a person looked at and found fine, so the checks stop
 * listing them (owner, 17 Nov 2026).
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  validateManifest,
  type BackstageItem,
  type BackstageManifest,
} from '@storystage/backstage';
import {
  BACKDROP_SKETCHES,
  canPose,
  makeItemSketches,
  meshFromModel,
  type SketchFlag,
} from '@storystage/sketches';

export interface TouchUp {
  /** Sketch file → hand-drawn SVG to use instead, both relative to the Backstage folder. */
  readonly overrides?: Readonly<Record<string, string>>;
  /** Backdrop item id → hand-made backdrop sketch id, instead of the one its name suggests. */
  readonly backdrops?: Readonly<Record<string, string>>;
  /** Sketch files drawn as an outline only. */
  readonly outlineOnly?: readonly string[];
  /** Sketch files a person looked at and kept as they are: no longer listed to look at. */
  readonly kept?: readonly string[];
}

export interface MakeReport {
  readonly manifest: BackstageManifest;
  readonly written: number;
  readonly overridden: readonly string[];
  readonly flagged: readonly { readonly file: string; readonly flags: readonly SketchFlag[] }[];
  /** Sketches drawn as an outline only, and sketches looked at and kept, from touch-up.json. */
  readonly outlined: readonly string[];
  readonly kept: readonly string[];
  /** Cast members drawn without poses, because their skeleton doesn't map (WP3.3). */
  readonly unposed: readonly string[];
}

export async function makeSketches(
  dir: string,
  options: { readonly write?: boolean } = {},
): Promise<MakeReport> {
  const write = options.write ?? true;
  const checked = validateManifest(JSON.parse(await readFile(join(dir, 'backstage.json'), 'utf8')));
  if (!checked.ok) throw new Error(`backstage.json is not valid:\n${checked.errors.join('\n')}`);
  const touchUpFile = join(dir, 'sketches', 'touch-up.json');
  const touchUp: TouchUp = existsSync(touchUpFile)
    ? JSON.parse(await readFile(touchUpFile, 'utf8'))
    : {};
  let written = 0;
  const overridden: string[] = [];
  const flagged: { file: string; flags: readonly SketchFlag[] }[] = [];
  const outlineOnly = new Set(touchUp.outlineOnly ?? []);
  const keptFiles = new Set(touchUp.kept ?? []);
  const outlined: string[] = [];
  const kept: string[] = [];
  const unposed: string[] = [];
  const items: BackstageItem[] = [];

  for (const item of checked.manifest.items) {
    const mesh =
      item.section === 'backdrops'
        ? null
        : await meshFromModel(await readFile(join(dir, item.files.model)));
    if (mesh && item.section === 'cast' && !canPose(mesh)) unposed.push(item.id);
    const made = makeItemSketches(item, mesh, { outlineOnly });
    for (const sketch of made) {
      let svg = sketch.svg;
      const override = touchUp.overrides?.[sketch.file];
      const backdrop = touchUp.backdrops?.[item.id];
      if (override) {
        svg = await readFile(join(dir, override), 'utf8');
        overridden.push(sketch.file);
      } else if (backdrop && item.section === 'backdrops') {
        const hand = BACKDROP_SKETCHES.find((s) => s.id === backdrop);
        if (!hand) throw new Error(`touch-up.json: no backdrop sketch called "${backdrop}".`);
        svg = hand.svg.replace('<svg ', `<svg data-backstage-id="${item.id}" `);
        overridden.push(sketch.file);
      } else {
        if (outlineOnly.has(sketch.file)) outlined.push(sketch.file);
        if (keptFiles.has(sketch.file)) kept.push(sketch.file);
        else if (sketch.flags.length) flagged.push({ file: sketch.file, flags: sketch.flags });
      }
      if (write) {
        const out = join(dir, sketch.file);
        await mkdir(dirname(out), { recursive: true });
        await writeFile(out, svg);
      }
      written++;
    }
    items.push({
      ...item,
      sketches: made.map((s) => ({
        facing: s.facing,
        ...(s.pose ? { pose: s.pose } : {}),
        file: s.file,
      })),
    });
  }

  const manifest: BackstageManifest = { ...checked.manifest, items };
  // A name in touch-up.json that matches no sketch is a mistake, not something to ignore.
  const all = new Set(items.flatMap((i) => i.sketches.map((s) => s.file)));
  const unknown = [...outlineOnly, ...keptFiles].filter((f) => !all.has(f));
  if (unknown.length) throw new Error(`touch-up.json names no such sketch: ${unknown.join(', ')}`);
  const report = { manifest, written, overridden, flagged, unposed, outlined, kept };
  if (write) {
    await writeFile(join(dir, 'backstage.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    await mkdir(join(dir, 'sketches'), { recursive: true });
    await writeFile(join(dir, 'sketches', 'touch-up.md'), touchUpList(report));
  }
  return report;
}

/** The touch-up list: what a person should look at, and how to replace a sketch. */
export function touchUpList(report: Omit<MakeReport, 'manifest'>): string {
  const lines = [
    '# Sketches to touch up',
    '',
    `Written by \`tools/make-sketches\`: ${report.written} sketches, ${report.overridden.length} replaced by hand, ${report.flagged.length} to look at.`,
    '',
    'To replace a sketch, draw it in the same style (black lines 3 units wide on a white shape, the model facing left in side and three-quarter views), save it beside this file, and name it in `touch-up.json` under `overrides`. To draw one as its outline only, name it under `outlineOnly`; to keep one as it is, under `kept`.',
    '',
    '## To look at',
    '',
  ];
  if (report.flagged.length === 0) lines.push('Nothing: every sketch passed the checks.');
  else {
    lines.push('| Sketch | Why |', '|---|---|');
    for (const f of report.flagged)
      lines.push(`| \`${f.file}\` | ${f.flags.map((x) => x.reason).join(' ')} |`);
  }
  lines.push('', '## Cast drawn without poses', '');
  if (report.unposed.length === 0) lines.push('None.');
  else
    lines.push(
      "Their skeletons don't map onto the joint map (spec 17, section 2a), so they have the four facings only:",
      '',
      ...report.unposed.map((id) => `- \`${id}\``),
    );
  lines.push('', '## Replaced by hand', '');
  lines.push(
    ...(report.overridden.length ? report.overridden.map((f) => `- \`${f}\``) : ['None.']),
  );
  lines.push('', '## Drawn as an outline only', '');
  lines.push(...(report.outlined.length ? report.outlined.map((f) => `- \`${f}\``) : ['None.']));
  lines.push('', '## Looked at and kept', '');
  lines.push(...(report.kept.length ? report.kept.map((f) => `- \`${f}\``) : ['None.']));
  return `${lines.join('\n')}\n`;
}
