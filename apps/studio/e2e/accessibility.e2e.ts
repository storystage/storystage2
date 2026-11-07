import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// WP12.5 and WP12's done-when: axe reports no serious issues on any screen, in both themes, at the
// three sizes (docs/spec/07-ux.md, section 5). The component page shows every component in both
// themes side by side, so one page covers both. The three tabs join this file as they are built.

const COMPONENT_PAGE = 'http://localhost:4182/components.html';

const SIZES = [
  { name: 'laptop', width: 1536, height: 864 },
  { name: 'Chromebook', width: 1366, height: 768 },
  { name: 'iPad', width: 1180, height: 820 },
] as const;

const WCAG_22_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function seriousIssues(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG_22_AA).analyze();
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function openComponents(page: Page) {
  await page.goto(COMPONENT_PAGE);
  await expect(page.getByRole('main', { name: 'Light theme' })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

for (const size of SIZES) {
  test.describe(`at ${size.name} size`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('axe finds no serious issues on the components, in either theme', async ({ page }) => {
      await openComponents(page);
      expect(await seriousIssues(page)).toEqual([]);
    });

    for (const theme of ['Dark', 'Light']) {
      test(`axe finds no serious issues in an open ${theme} dialog`, async ({ page }) => {
        await openComponents(page);
        await page
          .getByRole('main', { name: `${theme} theme` })
          .getByRole('button', { name: 'Open the export dialog' })
          .click();
        await expect(page.getByRole('dialog', { name: 'Export film' })).toBeVisible();
        expect(await seriousIssues(page)).toEqual([]);
      });
    }
  });
}

// The studio itself: the shell at each size, with Settings open, and the note in a narrow window.
for (const size of SIZES) {
  test(`axe finds no serious issues in the studio at ${size.name} size`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await expect(page.getByRole('tab', { name: 'Storyboard' })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);
    await page.getByRole('button', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
    expect(await seriousIssues(page)).toEqual([]);
  });
}

test('below 1024 px the studio asks for more room (decision 0033)', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 768 });
  await page.goto('/');
  await expect(page.getByRole('note')).toHaveText(
    'Turn your iPad sideways, or make the window wider.',
  );
  await expect(page.getByRole('tab', { name: 'Storyboard' })).toBeHidden();
  expect(await seriousIssues(page)).toEqual([]);
});

// 07-ux §1.3 and §4: every control is at least 44 × 44 px, more than the 24 px axe checks for.
test('every control is at least 44 × 44 px', async ({ page }) => {
  await openComponents(page);
  const tooSmall = await page.evaluate(() => {
    const controls = document.querySelectorAll(
      'button, [role=tab], [role=option], input:not([type=radio], [type=checkbox]), .ss-segment, .ss-radio-card, .ss-toggle, .ss-checkbox',
    );
    return [...controls]
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 44 || box.height < 44)
      .map(({ el, box }) => {
        const name = el.getAttribute('aria-label') ?? el.textContent?.trim();
        return `${el.className || el.tagName} "${name}": ${box.width} × ${box.height}`;
      });
  });
  expect(tooSmall).toEqual([]);
});

test('a keyboard user can reach the controls and sees where they are', async ({ page }) => {
  await openComponents(page);
  await page.keyboard.press('Tab');
  const focused = page.locator(':focus');
  await expect(focused).toHaveText('Rehearse');
  const ring = await focused.evaluate((el) => getComputedStyle(el).boxShadow);
  expect(ring).not.toBe('none');
});
