import { test, expect } from '@playwright/test';

test('Map loads every ski resort as a map entity', async ({ page }) => {
  await page.goto('/map.html', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#skiCount')).not.toHaveText('—');
  const skiCount = Number(await page.locator('#skiCount').textContent());
  expect(skiCount).toBeGreaterThan(0);
  await expect(page.locator('.adventure-item[data-id^="map-ski-resort-"]')).toHaveCount(skiCount);
});
