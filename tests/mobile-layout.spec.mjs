import { test, expect } from '@playwright/test';

const pages = [
  '/index.html',
  '/activities.html',
  '/map.html',
  '/adventures.html',
  '/timeline.html',
  '/races.html',
  '/summits.html',
  '/skiing.html',
  '/nordic.html',
  '/mountain-biking.html',
];

for (const path of pages) {
  test(`${path} avoids body-level horizontal overflow on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(500);
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport + 2);
    expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport + 2);
  });
}

test('shared pages expose a keyboard skip link', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const skip = page.locator('.skip-link');
  await expect(skip).toHaveCount(1);
  await expect(skip).toHaveAttribute('href', '#main-content');
  await skip.focus();
  await expect(skip).toBeFocused();
});
