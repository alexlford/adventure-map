import { test, expect } from '@playwright/test';

const target = '/detail.html?record=2023-12-02-colorado-triathlon';

test('diagnostic: Colorado Triathlon Story identity and tokens', async ({ page }) => {
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.hero h1')).toHaveText('Colorado Triathlon');
  await expect(page.locator('body')).toHaveClass(/story-theme-challenge/);
  await expect(page.locator('.route-endpoint-wrap')).toHaveCount(0);

  const tokens = await page.locator('body').evaluate(node => {
    const style = getComputedStyle(node);
    return {
      story: style.getPropertyValue('--story-accent').trim().toLowerCase(),
      accent: style.getPropertyValue('--accent').trim().toLowerCase(),
    };
  });
  expect(tokens).toEqual({ story: '#7b4b66', accent: '#7b4b66' });
});

test('diagnostic: Colorado Triathlon route uses Story accent', async ({ page }) => {
  await page.goto(target, { waitUntil: 'domcontentloaded' });
  const route = page.locator('.detail-map path.leaflet-interactive:not(.detail-location-point)').first();
  await expect(route).toBeVisible();
  await expect(route).toHaveCSS('stroke', 'rgb(123, 75, 102)');
});
