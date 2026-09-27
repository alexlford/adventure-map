import { test, expect } from '@playwright/test';

test('homepage ships a useful recently-added fallback before JavaScript enhancement', async ({ page }) => {
  await page.route('**/landing.js', route => route.abort());
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: 'Fresh in the archive.' })).toBeVisible();
  await expect(page.locator('#latest-card')).toHaveAttribute('data-added-at', '2026-09-20');
  await expect(page.locator('#recently-added-list .recent-card')).toHaveCount(2);
  await expect(page.locator('#snapshot-records')).not.toHaveText('');
});
