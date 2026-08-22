import { test, expect } from '@playwright/test';

const openStory = async page => {
  await page.goto('/detail.html?record=2023-12-02-colorado-triathlon', { waitUntil: 'domcontentloaded' });
};

test('diagnostic Story chrome and theme class', async ({ page }) => {
  await openStory(page);
  await expect(page.locator('.hero h1')).toHaveText('Colorado Triathlon');
  await expect(page.locator('body')).toHaveClass(/story-theme-challenge/);
  await expect(page.locator('.route-endpoint-wrap')).toHaveCount(0);
});

test('diagnostic Story accent tokens', async ({ page }) => {
  await openStory(page);
  const tokens = await page.locator('body').evaluate(node => {
    const style = getComputedStyle(node);
    return {
      story: style.getPropertyValue('--story-accent').trim().toLowerCase(),
      accent: style.getPropertyValue('--accent').trim().toLowerCase(),
    };
  });
  expect(tokens).toEqual({ story: '#7b4b66', accent: '#7b4b66' });
});

test('diagnostic Story route exists', async ({ page }) => {
  await openStory(page);
  const route = page.locator('.detail-map path.leaflet-interactive:not(.detail-location-point)').first();
  await expect(route).toBeVisible();
});

test('diagnostic Story route stroke', async ({ page }) => {
  await openStory(page);
  const route = page.locator('.detail-map path.leaflet-interactive:not(.detail-location-point)').first();
  await expect(route).toBeVisible();
  await expect(route).toHaveCSS('stroke', 'rgb(123, 75, 102)');
});
