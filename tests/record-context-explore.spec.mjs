import { test, expect } from '@playwright/test';

test('Record pages link back into the surrounding year place and activity archive', async ({ page }) => {
  const from = encodeURIComponent('/timeline.html?year=2023&view=summits');
  await page.goto(`/detail.html?record=mount-lincoln&from=${from}`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.record-context-explore')).toBeVisible();
  await expect(page.locator('.record-context-card').filter({ hasText: 'Same year' })).toHaveAttribute('href', /year=2023/);
  await expect(page.locator('.record-context-card').filter({ hasText: 'Same activity' })).toHaveAttribute('href', /view=summits/);
  await expect(page.locator('.record-context-back')).toHaveAttribute('href', '/timeline.html?year=2023&view=summits');
});

test('Record return links reject cross-origin archive destinations', async ({ page }) => {
  const from = encodeURIComponent('https://example.com/not-the-archive');
  await page.goto(`/detail.html?record=mount-lincoln&from=${from}`, { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.record-context-explore')).toBeVisible();
  await expect(page.locator('.record-context-back')).toHaveCount(0);
});
