import { expect, type Page } from '@playwright/test';

/**
 * Each gate's own film plays with the same scene state on every renderer this browser has, frame
 * for frame (workplan 18.2): Settings › Self-test's scene state step, which checks the film open
 * in the studio as well as the demo. The step comes before the export, so this waits for it alone
 * and leaves the rest of the self-test running. CI draws with WebGL2 only, so there the film is
 * checked twice on WebGL2 and the step says so; a device with WebGPU checks both.
 */
export async function expectSameSceneState(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Settings' }).click();
  const card = page.getByRole('region', { name: 'Self-test' });
  await card.getByRole('button', { name: 'Run the self-test' }).click();
  const step = card
    .getByRole('list', { name: 'Self-test steps' })
    .getByRole('listitem')
    .filter({ hasText: 'on each renderer' });
  await expect(step).toBeVisible({ timeout: 90_000 });
  const words = (await step.textContent()) ?? '';
  expect(await step.getAttribute('data-status'), words).toBe('pass');
  return words;
}
