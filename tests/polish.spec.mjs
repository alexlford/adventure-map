import { test, expect } from '@playwright/test';

async function expectNoHorizontalOverflow(page) {
  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(overflow.scroll, `page scroll width ${overflow.scroll}px should fit ${overflow.viewport}px viewport`).toBeLessThanOrEqual(overflow.viewport + 1);
}

test('mobile shell honors touch targets and reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expectNoHorizontalOverflow(page);
  await expect(page.locator('link[data-global-polish="true"]')).toHaveCount(1);

  const navHeights = await page.locator('.nav a').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(navHeights.length).toBeGreaterThan(0);
  for (const height of navHeights) expect(height).toBeGreaterThanOrEqual(43.5);

  const transitionSeconds = await page.locator('.home-portal').first().evaluate(node => {
    const raw = getComputedStyle(node).transitionDuration.split(',')[0].trim();
    if (raw.endsWith('ms')) return Number.parseFloat(raw) / 1000;
    return Number.parseFloat(raw) || 0;
  });
  expect(transitionSeconds).toBeLessThanOrEqual(0.001);
});

test('map and record pages stay usable at phone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto('/map/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#resultCount')).toContainText('shown');
  await expectNoHorizontalOverflow(page);
  await expect(page.locator('link[data-global-polish="true"]')).toHaveCount(1);

  const filterHeights = await page.locator('.filter-button').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height));
  expect(filterHeights.length).toBeGreaterThan(0);
  for (const height of filterHeights) expect(height).toBeGreaterThanOrEqual(43.5);

  await page.goto('/record/2022-09-25-mount-sherman/', { waitUntil: 'domcontentloaded' });
  await expectNoHorizontalOverflow(page);
  await expect(page.locator('link[data-global-polish="true"]')).toHaveCount(1);
});
