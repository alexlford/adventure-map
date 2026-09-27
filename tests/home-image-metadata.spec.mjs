import { test, expect } from '@playwright/test';

test('verified homepage photos reserve layout space and decode asynchronously', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  const hero = page.locator('.home-hero-photo img');
  await expect(hero).toHaveAttribute('width', '1536');
  await expect(hero).toHaveAttribute('height', '1152');
  await expect(hero).toHaveAttribute('decoding', 'async');
  await expect(hero).toHaveAttribute('fetchpriority', 'high');

  const chicago = page.locator('img[src*="chicago-marathon-course-01.jpeg"]');
  await expect(chicago).toHaveAttribute('width', '1536');
  await expect(chicago).toHaveAttribute('height', '874');
  await expect(chicago).toHaveAttribute('loading', 'lazy');

  const twinCities = page.locator('img[src*="twin-cities-marathon-finish-01.jpeg"]');
  await expect(twinCities).toHaveAttribute('width', '1199');
  await expect(twinCities).toHaveAttribute('height', '1199');
  await expect(twinCities).toHaveAttribute('loading', 'lazy');
});
