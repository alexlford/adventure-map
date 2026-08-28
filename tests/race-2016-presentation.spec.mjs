import { test, expect } from '@playwright/test';

test('2016 Heartland and Illinois grouped race stories render the intended structures', async ({ page }) => {
  await page.goto('/detail.html?record=heartland-39-3-2016', { waitUntil: 'domcontentloaded' });
  const series = page.locator('#raceSeriesHistory');
  await expect(series).toBeVisible();
  await expect(series.getByRole('heading', { name: 'Heartland 39.3' })).toBeVisible();
  await expect(series.locator('.series-year-card')).toHaveCount(3);
  await expect(series).toContainText('1:47:58.7');
  await expect(series).toContainText('1:43:16');
  await expect(series).toContainText('1:43:29.6');
  await expect(page.locator('.challenge-feature')).toHaveCount(0);

  await page.goto('/detail.html?record=illinois-half-i-challenge-2016', { waitUntil: 'domcontentloaded' });
  const challenge = page.locator('.challenge-feature');
  await expect(challenge).toBeVisible();
  await expect(challenge.locator('.story-component')).toHaveCount(2);
  await expect(challenge).toContainText('21:02');
  await expect(challenge).toContainText('1:48:13');
});

test('2016 race memories render on their canonical race records', async ({ page }) => {
  await page.goto('/detail.html?record=rock-parkway-half-2016', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#page[data-race-memory="true"]')).toBeVisible();
  await expect(page.locator('.race-memory-finish strong')).toHaveText('1:47:58.7');
  await expect(page.locator('.race-memory-story-copy')).toContainText('first race in the series');

  await page.goto('/detail.html?record=illinois-5k-2016', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#page[data-race-memory="true"]')).toBeVisible();
  await expect(page.locator('.race-memory-finish strong')).toHaveText('21:02');
  await expect(page.locator('.race-memory-story-copy')).toContainText('official 5K race PR');
});
