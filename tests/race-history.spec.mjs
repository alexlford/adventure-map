import { test, expect } from '@playwright/test';

test('race chapter renders canonical sports-history analytics', async ({ page }) => {
  const errors=[];
  page.on('pageerror', error=>errors.push(error.message));
  await page.goto('/races/', { waitUntil: 'domcontentloaded' });

  const section=page.locator('[data-race-history="true"]');
  await expect(section).toBeVisible();
  await expect(page.locator('link[data-race-history-style="true"]')).toHaveCount(1);

  const history=await page.evaluate(async()=>fetch('../data/race-history.json').then(response=>response.json()));
  expect(history.summary.raceCount).toBeGreaterThan(20);
  expect(history.yearly.length).toBeGreaterThan(5);
  expect(history.marathonTimeline.length).toBeGreaterThan(3);

  await expect(section.locator('.race-history-year-row')).toHaveCount(history.yearly.length);
  await expect(section.locator('.race-history-marathon')).toHaveCount(history.marathonTimeline.length);
  await expect(section.locator('[data-race-history-count]')).toHaveAttribute('data-race-history-count', String(history.summary.raceCount));
  expect(errors).toEqual([]);
});

test('race history stays readable on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/races/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-race-history="true"]')).toBeVisible();
  const width=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  expect(width.scroll).toBeLessThanOrEqual(width.client+1);
  await expect(page.locator('.race-history-summary .race-history-card')).toHaveCount(4);
});
