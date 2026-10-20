import { expect, test } from '@playwright/test';

test('the app opens and shows the three tabs', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'StoryStage 2' })).toBeVisible();
  for (const tab of ['Storyboard', 'Production stage', 'Screening room']) {
    await expect(page.getByText(tab)).toBeVisible();
  }
});

test('WebGL2 is available with software rendering', async ({ page }) => {
  await page.goto('/');
  const hasWebGL2 = await page.evaluate(
    () => document.createElement('canvas').getContext('webgl2') !== null,
  );
  expect(hasWebGL2).toBe(true);
});
