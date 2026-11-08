import { expect, test } from '@playwright/test';

test('the app opens on the Storyboard, with the three tabs', async ({ page }) => {
  await page.goto('/');
  for (const tab of ['Storyboard', 'Production stage', 'Screening room']) {
    await expect(page.getByRole('tab', { name: tab })).toBeVisible();
  }
  await expect(page.getByRole('tab', { name: 'Storyboard' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
});

test('WebGL2 is available with software rendering', async ({ page }) => {
  await page.goto('/');
  const hasWebGL2 = await page.evaluate(
    () => document.createElement('canvas').getContext('webgl2') !== null,
  );
  expect(hasWebGL2).toBe(true);
});
