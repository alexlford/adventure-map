import { test, expect } from '@playwright/test';

test('race timeline consistently shows distance rather than finish time', async ({ page }) => {
  await page.goto('/races/', { waitUntil: 'domcontentloaded' });
  const items = page.locator('#timeline .timeline-item');
  await expect(items.first()).toBeVisible();

  await expect(page.locator('.section-title', { has: page.getByRole('heading', { name: 'Race timeline' }) }).locator('p'))
    .toContainText('distance and date on the right');

  const values = (await page.locator('#timeline .timeline-item > div:last-child > strong').allTextContents())
    .map(value => value.trim())
    .filter(Boolean);
  expect(values.length).toBeGreaterThan(0);
  expect(values.some(value => /^(?:\d{1,2}:)?\d{1,2}:\d{2}$/.test(value))).toBeFalsy();

  const colder = items.filter({ hasText: 'COLDERBolder 5K' }).first();
  await expect(colder.locator(':scope > div:last-child > strong')).toHaveText('5K');
});
