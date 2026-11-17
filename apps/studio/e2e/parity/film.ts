import { programText, type Program } from '@storystage/ast';
import { demoProduction, openProduction, saveProduction } from '@storystage/production';
import { expect, type Page } from '@playwright/test';

// The film in and out of the studio as a learner keeps it (spec 14, section 5.1 and 5.3): Open a
// copy and Save a copy in the Film menu, with the system's file pickers stood in for in the page,
// as the M3 gate does. The studio's own code, from the Film menu to the file's bytes, runs as it
// does for a learner.

export type EditorName = 'Blocks' | 'Tiles';

/** The pickers, stood in for: Save a copy keeps the bytes on `window`; Open hands over ours. */
async function standInPickers(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    w.showSaveFilePicker = async ({ suggestedName }: { suggestedName: string }) => ({
      async createWritable() {
        const parts: Uint8Array[] = [];
        return {
          write: async (b: Uint8Array) => void parts.push(new Uint8Array(b)),
          close: async () => {
            w.savedCopy = { name: suggestedName, bytes: parts.flatMap((p) => [...p]) };
          },
          abort: async () => undefined,
        };
      },
    });
    w.showOpenFilePicker = async () => {
      const { name, bytes } = w.copyToOpen as { name: string; bytes: number[] };
      return [{ getFile: async () => new File([new Uint8Array(bytes)], name) }];
    };
  });
}

/** The demo film with `program` as its code, as a file. */
export function filmWith(program: Program): Uint8Array {
  return saveProduction({ ...demoProduction(), program });
}

const filmMenu = (page: Page) => page.getByRole('button', { name: /^Film: / });

/**
 * A fresh page with the film whose code is `program` (or that film itself), opened with Open a copy, on the Production
 * stage's scene 1 in `editor`, chosen with the studio's own switch. "Don't explain this again"
 * is already ticked on this device, so the switch goes straight there (its dialog has its own
 * tests in `switch.e2e.ts`).
 */
export async function openFilm(page: Page, program: Program | Uint8Array, editor: EditorName) {
  await standInPickers(page);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'storystage.codeEditor',
      JSON.stringify({ chosen: 'blocks', explained: true }),
    );
  });
  await page.setViewportSize({ width: 1366, height: 900 });
  // A device folder and no class list, as a learner at home has: the Film menu is there.
  await page.goto('/?example');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys())
      await root.removeEntry(name, { recursive: true });
  });
  await page.goto('/');
  await expect(filmMenu(page)).toBeVisible();
  const bytes = program instanceof Uint8Array ? program : filmWith(program);
  await page.evaluate(
    (b) => {
      (window as unknown as Record<string, unknown>).copyToOpen = {
        name: 'Parity.storystage',
        bytes: b,
      };
    },
    [...bytes],
  );
  await filmMenu(page).click();
  await page.getByRole('menuitem', { name: 'Open a copy…' }).click();
  await expect(
    page.getByRole('button', { name: /^Film: The Lost Penguin \(demo\)/ }),
  ).toBeVisible();
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  if (editor === 'Tiles') await switchTo(page, 'Tiles');
  await expect(page.locator(`.pr-code[data-editor="${editor.toLowerCase()}"]`)).toBeVisible();
}

/** The studio's switch, clicked where it's drawn (React Aria's radio input is hidden). */
export async function switchTo(page: Page, editor: EditorName) {
  await page.locator('.pr-editor-switch .ss-segment', { hasText: editor }).click();
  await expect(page.locator(`.pr-code[data-editor="${editor.toLowerCase()}"]`)).toBeVisible();
  if (editor === 'Blocks') await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  else await expect(page.locator('.pr-tiles [role="tree"]')).toBeVisible();
  // Focus goes into the editor a frame after it's drawn (section 4.5), once the switch has let go
  // of it: wait for that, so it doesn't undo where a task puts focus next.
  await expect
    .poll(() =>
      page.evaluate(
        () => !!document.activeElement?.closest('.pr-code section, .pr-tiles, .pr-workspace'),
      ),
    )
    .toBe(true);
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/** The program in the film, read from Save a copy. */
export async function savedProgram(page: Page): Promise<Program> {
  await page.evaluate(() => delete (window as unknown as Record<string, unknown>).savedCopy);
  await filmMenu(page).click();
  await page.getByRole('menuitem', { name: 'Save a copy…' }).click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { savedCopy?: unknown }).savedCopy))
    .toBeTruthy();
  const bytes = await page.evaluate(
    () => (window as unknown as { savedCopy: { bytes: number[] } }).savedCopy.bytes,
  );
  const opened = openProduction(new Uint8Array(bytes));
  if (opened.status !== 'ok') throw new Error(`The saved copy didn't open: ${opened.status}`);
  return opened.production.program;
}

/** The stage's own Undo (07-ux section 7.5), named for its step. */
export const undoButton = (page: Page) =>
  page.getByRole('toolbar', { name: 'Undo and redo' }).getByRole('button', { name: /^Undo/ });

/** The last step's label, as the stage's Undo names it. */
export const lastLabel = async (page: Page) =>
  ((await undoButton(page).textContent()) ?? '').replace(/^Undo:?\s*/, '');

/** The last step's label, then how many steps there are to undo, undoing them all to count. */
export async function history(page: Page): Promise<{ label: string; steps: number }> {
  const label = await lastLabel(page);
  let steps = 0;
  while (await undoButton(page).isEnabled()) {
    const before = await undoButton(page).textContent();
    await undoButton(page).click();
    steps++;
    if (steps > 50) throw new Error('More than 50 steps to undo');
    // The next step's name, once this one is undone; two steps in a row can share a name.
    await expect(undoButton(page))
      .not.toHaveText(before ?? '', { timeout: 2_000 })
      .catch(() => undefined);
  }
  return { label, steps };
}

/**
 * The program with the ids of nodes made since `before` renamed by where each first appears
 * (`new1`, `new2`, ...), and every reference to one renamed with it (section 5.3). Ids already
 * in `before` stay as they are.
 */
export function canonical(program: Program, before: Program): unknown {
  const kept = new Set<string>();
  collectIds(before, kept);
  const renamed = new Map<string, string>();
  const order = new Set<string>();
  collectIds(program, order);
  for (const id of order) if (!kept.has(id)) renamed.set(id, `new${renamed.size + 1}`);
  const rename = (value: unknown): unknown => {
    if (typeof value === 'string') return renamed.get(value) ?? value;
    if (Array.isArray(value)) return value.map(rename);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rename(v)]));
    return value;
  };
  return rename(program);
}

/** Every node's id, in reading order: lists in order, an object's fields by name, not as kept. */
function collectIds(value: unknown, into: Set<string>) {
  if (Array.isArray(value)) for (const v of value) collectIds(v, into);
  else if (value && typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    if (typeof id === 'string') into.add(id);
    const fields = Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    for (const [, v] of fields) collectIds(v, into);
  }
}

/** The program's text, for a failure that reads as code (section 5.7). */
export const asText = (program: Program) => programText(program).text;

/**
 * A film of one scene whose code is `program`, for a program of its own shape, such as S2's
 * sample with every kind of node (section 5.5.3): the demo's scene 1, playing `method`, with
 * `objects` in it (each a field's name and class), and only that scene's cards, lines and frames.
 */
export function oneSceneFilm(
  program: Program,
  method: string,
  objects: readonly { readonly name: string; readonly class: string }[],
): Uint8Array {
  const demo = demoProduction();
  const first = demo.scenes[0]!;
  const look = first.setup.objects.find((o) => o.id === 'fox')!;
  return saveProduction({
    ...demo,
    program,
    manifest: { ...demo.manifest, runningOrder: [demo.manifest.runningOrder[0]!] },
    scenes: [
      {
        ...first,
        method: method as typeof first.method,
        setup: {
          ...first.setup,
          objects: objects.map((o) => ({
            ...look,
            id: o.name as typeof look.id,
            class: o.class as typeof look.class,
          })),
        },
      },
    ],
    storyboard: {
      ...demo.storyboard,
      cards: demo.storyboard.cards.filter((c) => c.id === first.id),
    },
    script: demo.script.filter((l) => l.scene === first.id),
    frames: demo.frames.filter((f) => f.scene === first.id).map((f) => ({ ...f, links: [] })),
  });
}
