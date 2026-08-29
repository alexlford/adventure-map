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
  '/world-majors/',
];

const recordPages = [
  '/detail.html?record=2023-12-02-colorado-triathlon',
  '/detail.html?record=2026-03-11-ski-the-sky-loop',
  '/detail.html?record=2026-06-29-west-maroon-pass-traverse',
  '/detail.html?record=2025-05-18-denver-colfax-marathon',
  '/detail.html?record=2023-08-13-mount-democrat',
  '/detail.html?record=2025-03-30-devil-s-thumb-ranch-nordic-day',
  '/detail.html?record=2026-08-05-trestle-bike-park-winter-park-mtb-day',
];

async function expectNoHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));
  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewport + 2);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.viewport + 2);
}

for (const path of pages) {
  test(`${path} avoids body-level horizontal overflow on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('main')).toBeVisible();
    await page.waitForTimeout(500);
    await expectNoHorizontalOverflow(page);
  });
}

for (const path of recordPages) {
  test(`${path} avoids body-level horizontal overflow on mobile`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.hero h1')).toBeVisible();
    await page.waitForTimeout(700);
    await expectNoHorizontalOverflow(page);
  });
}

test('mobile map keeps every layer control reachable and operational', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');

  const filters = ['all', 'mtb', 'nordic', 'road-races', 'trail-races', 'skiing', 'summits', 'adventures'];
  const buttons = page.locator('.filter-row [data-filter]');
  await expect(buttons).toHaveCount(filters.length);

  for (const filter of filters) {
    const button = page.locator(`[data-filter="${filter}"]`);
    await button.scrollIntoViewIfNeeded();
    await expect(button).toBeVisible();
    await button.click();
    await expect(button).toHaveClass(/is-active/);
    await expect.poll(() => page.evaluate(() => window.AdventureMap?.state?.().filter)).toBe(filter);
    await expect(page.locator('#resultCount')).toContainText('shown');
    await expectNoHorizontalOverflow(page);
  }
});

test('mobile activity pages use Explore instead of a second navigation scroller', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/races.html', { waitUntil: 'domcontentloaded' });

  const primary = page.locator('nav[aria-label="Primary navigation"]');
  const explore = primary.getByRole('link', { name: 'Explore', exact: true });
  const secondary = page.locator('.activity-subnav-wrap');

  await expect(primary).toBeVisible();
  await expect(explore).toBeVisible();
  await expect(explore).toHaveAttribute('aria-current', 'page');
  await expect(secondary).toHaveCount(1);
  await expect(secondary).toBeHidden();

  const box = await explore.boundingBox();
  expect(box).not.toBeNull();
  expect(box.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
});

test('shared pages expose a keyboard skip link', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'domcontentloaded' });
  const skip = page.locator('.skip-link');
  await expect(skip).toHaveCount(1);
  await expect(skip).toHaveAttribute('href', '#main-content');
  await skip.focus();
  await expect(skip).toBeFocused();
});
