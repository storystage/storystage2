/**
 * The real stage on a reference device (#6), for what only the device can say:
 * - 5.6: how many of Backstage's heaviest people (MakeHuman's, about 20,000 triangles each) hold
 *   30 frames a second at each quality, which sets the budget per device;
 * - 5.8: what the stage's own work costs a frame, walking, looking and waving, and what working
 *   out the walks and a crossfade cost;
 * - decision 0051: what view and occlusion events would cost a frame.
 *
 * The models are from the Backstage commit `backstage.lock.json` pins, so every device draws the
 * same files. The runs are `stageHarness`'s, which the end-to-end test also uses.
 */
import lock from '../../../../backstage.lock.json';
import './harness.ts';

/**
 * The published page has the models beside it, copied from the pinned commit when the site is
 * built (`.github/workflows/spike-pages.yml`), so it loads nothing from elsewhere. `?models=` points
 * a local run somewhere else, such as that commit on GitHub.
 */
const BASE = new URLSearchParams(location.search).get('models') ?? './backstage/';
const PERSON = `${BASE}makehuman/Biped/p01.glb`;
const KNIGHT = `${BASE}kaykit/Biped/knight.glb`;
/** Seconds each scene is measured frame by frame, then played live. */
const MEASURED = 2;
const LIVE = 4;

interface Harness {
  characterCost(
    count: number,
    seconds: number,
    url: string,
    renderer: 'auto',
    quality: 'low' | 'standard',
    live: number,
  ): Promise<unknown>;
  eventCost(objects: number): unknown;
}
const harness = () => (window as unknown as { stageHarness: Harness }).stageHarness;

const RUNS: { name: string; run: () => Promise<unknown> | unknown }[] = [
  ...[1, 4, 8, 12, 16].flatMap((count) =>
    (['low', 'standard'] as const).map((quality) => ({
      name: `${count} ${count === 1 ? 'person' : 'people'}, ${quality}`,
      run: () => harness().characterCost(count, MEASURED, PERSON, 'auto', quality, LIVE),
    })),
  ),
  {
    name: '8 knights, standard',
    run: () => harness().characterCost(8, MEASURED, KNIGHT, 'auto', 'standard', LIVE),
  },
  { name: 'view and occlusion events, 30 objects', run: () => harness().eventCost(30) },
];

const $ = (id: string) => document.getElementById(id)!;
const status = $('status');
const results = $('results');
const copy = $('copy') as HTMLButtonElement;
const runButton = $('run') as HTMLButtonElement;

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  copy.disabled = true;
  const report: Record<string, unknown> = {
    page: 'stage on this device (5.6, 5.8)',
    when: new Date().toISOString(),
    browser: navigator.userAgent,
    pixelRatio: devicePixelRatio,
    screen: `${screen.width}x${screen.height}`,
    cores: navigator.hardwareConcurrency,
    backstage: lock.commit.slice(0, 7),
    runs: {},
  };
  const runs = report.runs as Record<string, unknown>;
  for (const [i, { name, run }] of RUNS.entries()) {
    status.textContent = `${i + 1} of ${RUNS.length}: ${name}…`;
    try {
      runs[name] = await run();
    } catch (e) {
      runs[name] = { failed: String(e) };
    }
    results.textContent = JSON.stringify(report, null, 1);
  }
  status.textContent = 'Done. Copy the results into a chat with S3.';
  runButton.disabled = false;
  copy.disabled = false;
});

copy.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(results.textContent ?? '');
    status.textContent = 'Copied.';
  } catch {
    // Without the clipboard, select the text so it can be copied by hand.
    getSelection()?.selectAllChildren(results);
    status.textContent = 'Selected: copy it with the menu.';
  }
});
