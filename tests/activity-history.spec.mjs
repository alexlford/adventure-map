import { test, expect } from '@playwright/test';

const chapters = [
  ['/summits/', 'summits', 'Climbing history'],
  ['/skiing/', 'skiing', 'Alpine history'],
  ['/nordic/', 'nordic', 'Nordic history'],
  ['/mtb/', 'mountainBiking', 'Riding history']
];

for (const [path, key, heading] of chapters) {
  test(`${key} renders canonical history without horizontal overflow`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    const section = page.locator(`[data-activity-history-section="${key}"]`);
    await expect(section).toBeVisible();
    await expect(section.getByRole('heading', { name: heading })).toBeVisible();
    await expect(section.locator('.activity-history-card')).toHaveCount(4);
    expect(await section.locator('.activity-history-panel').count()).toBeGreaterThanOrEqual(2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
    expect(overflow).toBeFalsy();
  });
}

test('activity history artifact is internally consistent', async ({ request }) => {
  const response = await request.get('/data/activity-history.json');
  expect(response.ok()).toBeTruthy();
  const data = await response.json();
  expect(data.schemaVersion).toBe(1);
  expect(data.chapters.summits.summary.count).toBeGreaterThan(0);
  expect(data.chapters.skiing.summary.recordedDays).toBeGreaterThan(0);
  expect(data.chapters.nordic.summary.recordedDays).toBeGreaterThan(0);
  expect(data.chapters.mountainBiking.summary.recordedDays).toBeGreaterThan(0);
});
