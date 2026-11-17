import { expect, test, type Page } from '@playwright/test';
import type { Callee, Expression, NodeId } from '@storystage/ast';
import { exampleProduction } from '@storystage/production';
import { CONTROL_KINDS, palette, type PaletteTab } from '@storystage/story-api/editing';

// The Blocks editor's palette in a browser (docs/spec/14-editors.md sections 2.1, 3i.2 and 5.6):
// each block Blockly draws in the flyout names its entry (`data-callee`), in the shared palette's
// order and then the control group's, for the scene and for an object, on both tabs. Section 5.6's
// parity test reads the same attribute to compare Blocks' palette with Tiles'.

const example = exampleProduction();
const scene = example.program.types.find((t) =>
  t.methods.some((m) => m.id === example.scenes[0]!.method),
)!;
const penguin = scene.fields.find((f) => f.name === 'penguin')!;
const self: Expression = { id: 'palself' as NodeId, kind: 'this' };
const TAB_WORDS: Record<PaletteTab, RegExp> = { actions: /^Actions/, questions: /^Questions/ };

/** What `toolbox.ts` names each entry. */
const entry = (callee: Callee) =>
  callee.kind === 'story' ? `story:${callee.name}` : `user:${callee.method}`;

function expected(target: Expression, tab: PaletteTab) {
  const entries = palette(example.program, target, scene.id, tab).flatMap((g) =>
    g.items.map((i) => entry(i.callee)),
  );
  // Then the control group, in Tiles' control bar's order: variable and set before the note.
  if (tab === 'actions')
    entries.push(
      ...CONTROL_KINDS.filter((k) => k !== 'comment').map((k) => `control:${k}`),
      'control:variable',
      'control:assign',
      'control:comment',
    );
  return entries;
}

const drawn = (page: Page) =>
  page
    .locator('.pr-workspace .blocklyFlyout [data-callee]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-callee')));

async function chooseTab(page: Page, tab: PaletteTab) {
  await page
    .getByRole('radiogroup', { name: 'Kind of block' })
    .locator('.ss-segment', { hasText: TAB_WORDS[tab] })
    .click();
}

test('the flyout names each block’s entry, in the shared palette’s order', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/?example');
  await page.getByRole('tab', { name: /Production stage/ }).click();
  await expect(page.locator('.pr-workspace[data-ready]')).toBeVisible();
  const objectRef: Expression = {
    id: 'palobj' as NodeId,
    kind: 'fieldRef',
    target: self,
    field: penguin.id,
  };
  // The scene's own blocks first, then the penguin's, on both tabs.
  await expect.poll(() => drawn(page)).toEqual(expected(self, 'actions'));
  await chooseTab(page, 'questions');
  await expect.poll(() => drawn(page)).toEqual(expected(self, 'questions'));
  await page.getByRole('button', { name: /Blocks for/ }).click();
  await page.locator('.sb-menu-item', { hasText: 'penguin' }).click();
  await expect.poll(() => drawn(page)).toEqual(expected(objectRef, 'questions'));
  await chooseTab(page, 'actions');
  await expect.poll(() => drawn(page)).toEqual(expected(objectRef, 'actions'));
});
