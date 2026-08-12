import { test, expect } from '@playwright/test';

test('Race timeline renders before optional relationship enrichment finishes', async ({ page }) => {
  let releaseRelationships;
  await page.route('**/data/relationships.json', async route => {
    await new Promise(resolve => { releaseRelationships = resolve; });
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"test delayed enrichment"}'
    });
  });

  await page.goto('/races/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#timeline .timeline-item').first()).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#raceTotal')).not.toHaveText('—');
  await expect(page.locator('#seriesGrid')).toContainText('Loading series & challenges');
  expect(releaseRelationships).toBeTruthy();

  releaseRelationships();
  await expect(page.locator('#seriesGrid')).toContainText('Colorado Triathlon');
  await expect(page.locator('#timeline .timeline-item').first()).toBeVisible();
});
