/**
 * Spike 23.2: builds a show in a running Pixera from a projection package, through Pixera's API,
 * and records what each step did and what the API can't do.
 *
 *   node src/build.ts <package> [--host 127.0.0.1] [--port 1400] [--save <project path>]
 *
 * Pixera must be running with an API port set to JSON/TCP(dl) (Settings > API). Run it on a new,
 * empty project: it adds a resource folder, a timeline, layers, clips and cues, and removes
 * nothing. Someone must be at Pixera to answer its dialog for each PNG sequence. `--save` saves
 * the project as a new one at that path (`.avp` is added). The report goes to
 * `<package>/pixera-report.json`.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { Pixera } from './pixera.ts';
import type { Show } from './package.ts';

type Handle = number;

interface Step {
  step: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

/** What the API revision 481 docs have no command for: the operator does these in Pixera. */
const MANUAL = [
  'Import the surface model and make it a screen (Screens has no create or import).',
  'Create and place projectors (Projectors only finds existing ones by name, then sets position, rotation, lens and resolution).',
  "Set the timeline's frame rate in its properties (Timeline has getFps, no setter; a new one is 60).",
  'Answer "Import as Image Sequence?" for each PNG sequence with its frame rate (the API waits on it; "Remember my Choice" wasn\'t kept).',
  'Map projectors to outputs and calibrate (warp files can be loaded on a screen, but making them is manual).',
];

/** How long a PNG sequence's import waits for the operator to answer Pixera's dialog. */
const SEQUENCE_DIALOG_MS = 10 * 60_000;

/** Every command the build uses, checked with getHasFunction first. */
const USED = [
  'Pixera.Utility.getApiRevision',
  'Pixera.Resources.getResourceFolderWithNamePath',
  'Pixera.Resources.ResourceFolder.createFoldersFrom',
  'Pixera.Resources.ResourceFolder.addResource',
  'Pixera.Resources.Resource.getId',
  'Pixera.Resources.Resource.getType',
  'Pixera.Resources.Resource.getDuration',
  'Pixera.Resources.Resource.getFps',
  'Pixera.Resources.Resource.getResolution',
  'Pixera.Timelines.createTimeline',
  'Pixera.Timelines.Timeline.setName',
  'Pixera.Timelines.Timeline.getFps',
  'Pixera.Timelines.Timeline.createLayer',
  'Pixera.Timelines.Timeline.createCueLayer',
  'Pixera.Timelines.Timeline.createCue',
  'Pixera.Timelines.Timeline.getCueInfosAsJsonString',
  'Pixera.Timelines.Layer.setName',
  'Pixera.Timelines.Layer.setHomeScreenFromScreenName',
  'Pixera.Timelines.Layer.createClipAtTime',
  'Pixera.Timelines.Clip.assignResource',
  'Pixera.Timelines.Clip.getTime',
  'Pixera.Timelines.Clip.getDuration',
  'Pixera.Screens.getScreenNames',
  'Pixera.Session.getProjectName',
  'Pixera.Session.saveProjectAs',
];

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      host: { type: 'string', default: '127.0.0.1' },
      port: { type: 'string', default: '1400' },
      save: { type: 'string' },
    },
  });
  const folder = resolve(positionals[0] ?? 'out/package');
  const show = JSON.parse(readFileSync(join(folder, 'show.json'), 'utf8')) as Show;
  const px = await Pixera.connect(values.host, Number(values.port));
  const steps: Step[] = [];
  const step = async <T>(name: string, run: () => Promise<T>): Promise<T | undefined> => {
    try {
      const result = await run();
      steps.push({ step: name, ok: true, result });
      console.log(
        `✓ ${name}${result === undefined || result === null ? '' : `: ${JSON.stringify(result)}`}`,
      );
      return result;
    } catch (e) {
      steps.push({ step: name, ok: false, error: (e as Error).message });
      console.log(`✗ ${name}: ${(e as Error).message}`);
      return undefined;
    }
  };
  const call = <T>(method: string, params?: object) => px.call<T>(`Pixera.${method}`, params);

  try {
    const revision = await step('API revision', () => call<number>('Utility.getApiRevision'));
    await step('Project open', () => call<string>('Session.getProjectName'));
    const missing: string[] = [];
    for (const name of USED)
      if (!(await call<boolean>('Utility.getHasFunction', { functionName: name })))
        missing.push(name);
    steps.push({
      step: 'Commands the build uses, missing from this Pixera',
      ok: !missing.length,
      result: missing,
    });

    // Media: a folder of its own under Media, then each surface's media and the soundtrack.
    const folderPath = `StoryStage/${show.title}`;
    const media = await step('Find the Media folder', () =>
      call<Handle>('Resources.getResourceFolderWithNamePath', { namePath: 'Media' }),
    );
    if (media)
      await step(`Make Media/${folderPath}`, () =>
        call('Resources.ResourceFolder.createFoldersFrom', {
          handle: media,
          path: `/${folderPath}`,
        }),
      );
    const target = await step('Find the new folder', () =>
      call<Handle>('Resources.getResourceFolderWithNamePath', { namePath: `Media/${folderPath}` }),
    );

    const describe = async (resource: Handle) => ({
      id: await call<number>('Resources.Resource.getId', { handle: resource }),
      type: await call<string>('Resources.Resource.getType', { handle: resource }),
      duration: await call<number>('Resources.Resource.getDuration', { handle: resource }),
      fps: await call<number>('Resources.Resource.getFps', { handle: resource }),
      resolution: await call<number[]>('Resources.Resource.getResolution', { handle: resource }),
    });
    const add = async (label: string, path: string, waitMs?: number) => {
      const resource = await step(`Add ${label}: ${path}`, () =>
        px.call<Handle>(
          'Pixera.Resources.ResourceFolder.addResource',
          { handle: target, path },
          waitMs,
        ),
      );
      // A cancelled import dialog answers 0.
      if (!resource) return undefined;
      return step(`What Pixera made of ${label}`, () => describe(resource));
    };

    const items: { name: string; label: string; id: number }[] = [];
    if (target) {
      for (const s of show.surfaces) {
        const path = join(folder, s.media);
        if (s.kind === 'png-sequence') {
          // Pixera finds the rest of the sequence from its first frame, then asks in a dialog
          // ("Import as Image Sequence?") for the frame rate. The API can't answer it, and the call
          // waits until someone does. Keep the connection open: in the spike, Pixera crashed
          // twice when a dialog was answered after its call had given up.
          const first = readdirSync(path)
            .filter((f) => f.endsWith('.png'))
            .sort()[0]!;
          console.log(
            `… In Pixera, answer "Import as Image Sequence?" for ${first}: FPS of Sequence ${show.fps}, then Yes.`,
          );
          const got = await add(
            `${s.name}'s PNG sequence (from its first frame)`,
            join(path, first),
            SEQUENCE_DIALOG_MS,
          );
          if (got) items.push({ name: s.name, label: `${s.name} (PNG sequence)`, id: got.id });
        } else {
          const got = await add(`${s.name}'s video`, path);
          if (got)
            items.push({
              name: s.name,
              label: `${s.name} (${s.media.split('.').pop()})`,
              id: got.id,
            });
        }
      }
      if (show.soundtrack) {
        const got = await add('the soundtrack', join(folder, show.soundtrack));
        if (got) items.push({ name: '', label: 'Soundtrack', id: got.id });
      }
    }

    // The timeline: a layer for each item, sent to the screen of the same name if there is one.
    const timeline = await step('Create a timeline', () =>
      call<Handle>('Timelines.createTimeline'),
    );
    if (timeline) {
      await step(`Name it "${show.title}"`, () =>
        call('Timelines.Timeline.setName', { handle: timeline, name: show.title }),
      );
      const fps =
        (await step("The timeline's frame rate", () =>
          call<number>('Timelines.Timeline.getFps', { handle: timeline }),
        )) ?? show.fps;
      const screens =
        (await step('Screens in the project', () => call<string[]>('Screens.getScreenNames'))) ??
        [];
      for (const item of items) {
        const layer = await step(`Layer for ${item.label}`, () =>
          call<Handle>('Timelines.Timeline.createLayer', { handle: timeline }),
        );
        if (!layer) continue;
        await step(`Name the layer ${item.label}`, () =>
          call('Timelines.Layer.setName', { handle: layer, name: item.label }),
        );
        if (item.name && screens.includes(item.name))
          await step(`Send ${item.label} to screen ${item.name}`, () =>
            call('Timelines.Layer.setHomeScreenFromScreenName', {
              handle: layer,
              screenName: item.name,
            }),
          );
        const clip = await step(`Clip at frame 0 on ${item.label}`, () =>
          call<Handle>('Timelines.Layer.createClipAtTime', { handle: layer, timeInFrames: 0 }),
        );
        if (!clip) continue;
        await step(`Give the clip ${item.label}'s media, at its own length`, () =>
          call('Timelines.Clip.assignResource', {
            handle: clip,
            resId: item.id,
            setToResourceDuration: true,
          }),
        );
        await step(
          `The clip's time and length (want 0 and ${show.seconds * fps} frames)`,
          async () => ({
            time: await call<number>('Timelines.Clip.getTime', { handle: clip }),
            duration: await call<number>('Timelines.Clip.getDuration', { handle: clip }),
          }),
        );
      }
      const cueLayer = await step('A cue layer', () =>
        call<Handle>('Timelines.Timeline.createCueLayer', { handle: timeline }),
      );
      if (cueLayer) {
        for (const c of show.cues)
          await step(`Cue "${c.name}" at ${c.seconds} s (operation ${c.operation})`, () =>
            call<Handle>('Timelines.Timeline.createCue', {
              handle: timeline,
              name: c.name,
              timeInFrames: Math.round(c.seconds * fps),
              operation: c.operation,
              cueLayerHandle: cueLayer,
            }),
          );
        await step('The cues as Pixera has them', async () =>
          JSON.parse(
            await call<string>('Timelines.Timeline.getCueInfosAsJsonString', { handle: timeline }),
          ),
        );
      }
    }
    if (values.save)
      await step(`Save the project as ${values.save}`, () =>
        call('Session.saveProjectAs', {
          // Pixera's projects are .avp files; without it, it takes ".2" in "23.2" as the extension.
          path: resolve(values.save!.endsWith('.avp') ? values.save! : `${values.save!}.avp`),
        }),
      );
    const report = { show: show.title, revision, steps, manual: MANUAL, log: px.log };
    writeFileSync(join(folder, 'pixera-report.json'), JSON.stringify(report, null, 2) + '\n');
    const failed = steps.filter((s) => !s.ok).length;
    console.log(
      `\n${steps.length - failed} of ${steps.length} steps worked. Report: ${join(folder, 'pixera-report.json')}`,
    );
    console.log('Still by hand in Pixera:\n' + MANUAL.map((m) => `- ${m}`).join('\n'));
  } finally {
    px.close();
  }
}

await main();
