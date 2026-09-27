import { test, expect } from '@playwright/test';

test('homepage separates archive freshness from event chronology', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Fresh in the archive.' })).toBeVisible();

  const featured = page.locator('#latest-card');
  await expect(featured).toHaveAttribute('data-record-id', 'air-force-aim-high-challenge-2026');
  await expect(featured).toHaveAttribute('data-added-at', '2026-09-20');
  await expect(page.locator('#recent-feature-added')).toContainText('Added Sep 20, 2026');

  const recentCards = page.locator('#recently-added-list .recent-card');
  await expect(recentCards).toHaveCount(2);
  await expect(recentCards.nth(0)).toHaveAttribute('data-record-id', 'air-force-marathon-2026');
  await expect(recentCards.nth(1)).toHaveAttribute('data-record-id', 'air-force-5k-2026');
  await expect(recentCards.nth(0)).toContainText('U.S. Air Force Marathon');
  await expect(recentCards.nth(1)).toContainText('U.S. Air Force Marathon 5K');
});

test('homepage archive snapshot is populated from archive health', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => Number((await page.locator('#snapshot-records').textContent())?.replace(/,/g, '') || 0)).toBeGreaterThan(100);
  await expect.poll(async () => Number((await page.locator('#snapshot-routes').textContent())?.replace(/,/g, '') || 0)).toBeGreaterThan(0);
  await expect.poll(async () => Number((await page.locator('#snapshot-photos').textContent())?.replace(/,/g, '') || 0)).toBeGreaterThan(0);
  await expect(page.locator('#snapshot-years')).toHaveText(/\d{4}–\d{4}/);
});
